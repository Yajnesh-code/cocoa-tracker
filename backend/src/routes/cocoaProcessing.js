const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeBagDetails(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry, index) => {
      const weightKg = toNumber(entry.weight_kg);
      const moisturePct = toNumber(entry.moisture_pct);
      if (weightKg === null || moisturePct === null) return null;
      return {
        bag_label: String(entry.bag_label || `Bag ${index + 1}`).trim() || `Bag ${index + 1}`,
        weight_kg: weightKg,
        moisture_pct: moisturePct,
      };
    })
    .filter(Boolean);
}

function summarizeBagDetails(entries) {
  const totalWeightKg = entries.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0);
  const weightedMoistureTotal = entries.reduce(
    (sum, entry) => sum + (Number(entry.weight_kg || 0) * Number(entry.moisture_pct || 0)),
    0
  );

  return {
    totalWeightKg: Number(totalWeightKg.toFixed(2)),
    averageMoisturePct: totalWeightKg > 0
      ? Number((weightedMoistureTotal / totalWeightKg).toFixed(2))
      : 0,
  };
}

function normalizeCleaningWorkers(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (typeof entry === 'string') {
        const workerName = entry.trim();
        return workerName ? { worker_name: workerName, cleaned_nibs_kg: null } : null;
      }

      const workerName = String(entry.worker_name || '').trim();
      const cleanedNibsKg = toNumber(entry.cleaned_nibs_kg);
      if (!workerName) return null;

      return {
        worker_name: workerName,
        cleaned_nibs_kg: cleanedNibsKg,
      };
    })
    .filter(Boolean);
}

async function getSourceBatchIdByCode(batchCode) {
  const sourceBatchResult = await pool.query(
    'SELECT id FROM batches WHERE batch_code = $1 LIMIT 1',
    [batchCode]
  );
  return sourceBatchResult.rows[0]?.id || null;
}

async function getCocoaBatchByCode(batchCode) {
  const result = await pool.query(
    `SELECT cpb.*
     FROM cocoa_processing_batches cpb
     WHERE cpb.batch_code = $1
     LIMIT 1`,
    [batchCode]
  );
  return result.rows[0] || null;
}

async function nextRoastLotNumber(cocoaBatchId) {
  const result = await pool.query(
    `SELECT roast_lot_number
     FROM cocoa_roast_lots
     WHERE cocoa_batch_id = $1
       AND roast_lot_number ~ '^LOT-[0-9]+$'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [cocoaBatchId]
  );

  const current = result.rows[0]?.roast_lot_number || 'LOT-000';
  const currentNumber = Number(String(current).replace(/^LOT-/, '')) || 0;
  return `LOT-${String(currentNumber + 1).padStart(3, '0')}`;
}

async function getRoastedTotals(cocoaBatchId, excludeRoastLotId = null) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(quantity_roasted_kg), 0) AS total_roasted_kg
     FROM cocoa_roast_lots
     WHERE cocoa_batch_id = $1
       AND ($2::int IS NULL OR id <> $2)`,
    [cocoaBatchId, excludeRoastLotId]
  );

  return toNumber(result.rows[0]?.total_roasted_kg, 0);
}

async function getChocolateNibsUsedKg(batchCode) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(nibs_quantity_used_kg), 0) AS total_used_kg
     FROM chocolate_grinding_conching
     WHERE source_batch_code = $1`,
    [batchCode]
  );

  return toNumber(result.rows[0]?.total_used_kg, 0);
}

async function recomputeNibsInventory(batchCode, cocoaBatchId) {
  const [cleaningResult, packingResult] = await Promise.all([
    pool.query(
      `SELECT weight_after_kg
       FROM cocoa_cleaning_nibs
       WHERE cocoa_batch_id = $1
       LIMIT 1`,
      [cocoaBatchId]
    ),
    pool.query(
      `SELECT total_nibs_weight_kg
       FROM cocoa_nibs_packing
       WHERE cocoa_batch_id = $1
       LIMIT 1`,
      [cocoaBatchId]
    ),
  ]);

  const cleanedNibsKg = toNumber(cleaningResult.rows[0]?.weight_after_kg);
  const packedNibsKg = toNumber(packingResult.rows[0]?.total_nibs_weight_kg);
  const baseStockKg = cleanedNibsKg !== null ? cleanedNibsKg : (packedNibsKg !== null ? packedNibsKg : 0);
  const totalUsedKg = await getChocolateNibsUsedKg(batchCode);
  const availableStockKg = Number(Math.max(baseStockKg - totalUsedKg, 0).toFixed(2));
  const inventoryStatus = availableStockKg > 0 ? 'Active' : 'Fully Consumed';

  const result = await pool.query(
    `INSERT INTO nibs_inventory (cocoa_batch_id, batch_code, available_nibs_stock_kg, status, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (cocoa_batch_id)
     DO UPDATE SET
       batch_code = EXCLUDED.batch_code,
       available_nibs_stock_kg = EXCLUDED.available_nibs_stock_kg,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [cocoaBatchId, batchCode, availableStockKg, inventoryStatus]
  );

  return result.rows[0];
}

router.get('/batches', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         cpb.*,
         cw.weight_before_kg AS winnowing_weight_before_kg,
         cw.weight_after_kg AS winnowing_weight_after_kg,
         ccn.weight_before_kg AS cleaning_weight_before_kg,
         ccn.weight_after_kg AS cleaning_weight_after_kg,
         ccn.workers_involved,
         ccn.remarks AS cleaning_remarks,
         cnp.total_nibs_weight_kg,
         cnp.number_of_bags,
         ni.available_nibs_stock_kg,
         ni.status AS inventory_status,
         (
           SELECT COUNT(*)::int
           FROM cocoa_roast_lots crl
           WHERE crl.cocoa_batch_id = cpb.id
         ) AS roast_lot_count,
         (
           SELECT COALESCE(SUM(crl.quantity_roasted_kg), 0)
           FROM cocoa_roast_lots crl
           WHERE crl.cocoa_batch_id = cpb.id
         ) AS total_roasted_kg,
         (
           SELECT COALESCE(SUM(crl.weight_after_roasting_kg), 0)
           FROM cocoa_roast_lots crl
           WHERE crl.cocoa_batch_id = cpb.id
         ) AS total_weight_after_roasting_kg
       FROM cocoa_processing_batches cpb
       LEFT JOIN cocoa_winnowing cw ON cw.cocoa_batch_id = cpb.id
       LEFT JOIN cocoa_cleaning_nibs ccn ON ccn.cocoa_batch_id = cpb.id
       LEFT JOIN cocoa_nibs_packing cnp ON cnp.cocoa_batch_id = cpb.id
       LEFT JOIN nibs_inventory ni ON ni.cocoa_batch_id = cpb.id
       ORDER BY cpb.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/roast-lots/:batch_code', auth, async (req, res) => {
  try {
    const cocoaBatch = await getCocoaBatchByCode(req.params.batch_code);
    if (!cocoaBatch) return res.status(404).json({ error: 'Cocoa processing batch not found' });

    const result = await pool.query(
      `SELECT *
       FROM cocoa_roast_lots
       WHERE cocoa_batch_id = $1
       ORDER BY created_at ASC`,
      [cocoaBatch.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/inventory', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ni.*,
         cpb.weight_kg AS beans_arrival_weight_kg,
         cpb.moisture_pct AS beans_arrival_moisture_pct,
         cnp.total_nibs_weight_kg,
         cnp.number_of_bags
       FROM nibs_inventory ni
       JOIN cocoa_processing_batches cpb ON cpb.id = ni.cocoa_batch_id
       LEFT JOIN cocoa_nibs_packing cnp ON cnp.cocoa_batch_id = cpb.id
       ORDER BY ni.updated_at DESC, ni.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workers', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, worker_name
       FROM processing_workers
       ORDER BY worker_name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/workers', auth, async (req, res) => {
  const workerName = String(req.body.worker_name || '').trim();
  if (!workerName) {
    return res.status(400).json({ error: 'worker_name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO processing_workers (worker_name, updated_at)
       VALUES ($1, NOW())
       ON CONFLICT (worker_name)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [workerName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/beans-arrival', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const bagDetails = normalizeBagDetails(req.body.bag_details);
  const fallbackWeightKg = toNumber(req.body.weight_kg);
  const fallbackMoisturePct = toNumber(req.body.moisture_pct);
  const normalizedBagDetails = bagDetails.length
    ? bagDetails
    : (fallbackWeightKg !== null && fallbackMoisturePct !== null
      ? [{ bag_label: 'Bag 1', weight_kg: fallbackWeightKg, moisture_pct: fallbackMoisturePct }]
      : []);
  const { totalWeightKg, averageMoisturePct } = summarizeBagDetails(normalizedBagDetails);

  if (!batchCode || normalizedBagDetails.length === 0) {
    return res.status(400).json({ error: 'batch_code and at least one bag entry are required' });
  }

  try {
    const sourceBatchId = await getSourceBatchIdByCode(batchCode);
    const result = await pool.query(
      `INSERT INTO cocoa_processing_batches (batch_code, source_batch_id, weight_kg, moisture_pct, bag_details, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (batch_code)
       DO UPDATE SET
         source_batch_id = EXCLUDED.source_batch_id,
         weight_kg = EXCLUDED.weight_kg,
         moisture_pct = EXCLUDED.moisture_pct,
         bag_details = EXCLUDED.bag_details,
         updated_at = NOW()
       RETURNING *`,
      [batchCode, sourceBatchId, totalWeightKg, averageMoisturePct, JSON.stringify(normalizedBagDetails)]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roasting-lots', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const quantityRoastedKg = toNumber(req.body.quantity_roasted_kg);
  const weightAfterRoastingKg = toNumber(req.body.weight_after_roasting_kg);
  const moistureAfterRoastingPct = toNumber(req.body.moisture_after_roasting_pct);

  if (!batchCode || quantityRoastedKg === null || weightAfterRoastingKg === null || moistureAfterRoastingPct === null) {
    return res.status(400).json({ error: 'batch_code, quantity_roasted_kg, weight_after_roasting_kg, and moisture_after_roasting_pct are required' });
  }

  if (quantityRoastedKg > 10) {
    return res.status(400).json({ error: 'Maximum roasting quantity per roast lot is 10 kg' });
  }

  try {
    const cocoaBatch = await getCocoaBatchByCode(batchCode);
    if (!cocoaBatch) return res.status(404).json({ error: 'Create Beans Arrival first for this batch code' });
    const totalRoastedKg = await getRoastedTotals(cocoaBatch.id);
    const availableToRoastKg = Number(cocoaBatch.weight_kg || 0) - totalRoastedKg;

    if (quantityRoastedKg > availableToRoastKg) {
      return res.status(400).json({ error: `Only ${Number(Math.max(availableToRoastKg, 0).toFixed(2))} kg remaining for roasting in this batch` });
    }

    const roastLotNumber = await nextRoastLotNumber(cocoaBatch.id);

    const result = await pool.query(
      `INSERT INTO cocoa_roast_lots (
         cocoa_batch_id,
         roast_lot_number,
         quantity_roasted_kg,
         weight_after_roasting_kg,
         moisture_after_roasting_pct,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [cocoaBatch.id, roastLotNumber, quantityRoastedKg, weightAfterRoastingKg, moistureAfterRoastingPct]
    );

    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [cocoaBatch.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/roasting-lots/:id', auth, async (req, res) => {
  const quantityRoastedKg = toNumber(req.body.quantity_roasted_kg);
  const weightAfterRoastingKg = toNumber(req.body.weight_after_roasting_kg);
  const moistureAfterRoastingPct = toNumber(req.body.moisture_after_roasting_pct);

  if (quantityRoastedKg === null || weightAfterRoastingKg === null || moistureAfterRoastingPct === null) {
    return res.status(400).json({ error: 'quantity_roasted_kg, weight_after_roasting_kg, and moisture_after_roasting_pct are required' });
  }

  if (quantityRoastedKg > 10) {
    return res.status(400).json({ error: 'Maximum roasting quantity per roast lot is 10 kg' });
  }

  try {
    const roastLotResult = await pool.query(
      `SELECT id, cocoa_batch_id
       FROM cocoa_roast_lots
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );
    const roastLot = roastLotResult.rows[0];
    if (!roastLot) return res.status(404).json({ error: 'Roast lot not found' });

    const batchResult = await pool.query(
      `SELECT id, weight_kg
       FROM cocoa_processing_batches
       WHERE id = $1
       LIMIT 1`,
      [roastLot.cocoa_batch_id]
    );
    const cocoaBatch = batchResult.rows[0];
    if (!cocoaBatch) return res.status(404).json({ error: 'Cocoa processing batch not found' });

    const otherRoastedKg = await getRoastedTotals(cocoaBatch.id, roastLot.id);
    const availableToRoastKg = Number(cocoaBatch.weight_kg || 0) - otherRoastedKg;
    if (quantityRoastedKg > availableToRoastKg) {
      return res.status(400).json({ error: `Only ${Number(Math.max(availableToRoastKg, 0).toFixed(2))} kg available for this roasting edit` });
    }

    const result = await pool.query(
      `UPDATE cocoa_roast_lots
       SET quantity_roasted_kg = $1,
           weight_after_roasting_kg = $2,
           moisture_after_roasting_pct = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [quantityRoastedKg, weightAfterRoastingKg, moistureAfterRoastingPct, req.params.id]
    );
    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [roastLot.cocoa_batch_id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/winnowing', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const weightBeforeKg = toNumber(req.body.weight_before_kg);
  const weightAfterKg = toNumber(req.body.weight_after_kg);

  if (!batchCode || weightBeforeKg === null || weightAfterKg === null) {
    return res.status(400).json({ error: 'batch_code, weight_before_kg, and weight_after_kg are required' });
  }

  try {
    const cocoaBatch = await getCocoaBatchByCode(batchCode);
    if (!cocoaBatch) return res.status(404).json({ error: 'Create Beans Arrival first for this batch code' });

    const result = await pool.query(
      `INSERT INTO cocoa_winnowing (cocoa_batch_id, weight_before_kg, weight_after_kg, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (cocoa_batch_id)
       DO UPDATE SET
         weight_before_kg = EXCLUDED.weight_before_kg,
         weight_after_kg = EXCLUDED.weight_after_kg,
         updated_at = NOW()
       RETURNING *`,
      [cocoaBatch.id, weightBeforeKg, weightAfterKg]
    );

    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [cocoaBatch.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cleaning-nibs', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const weightBeforeKg = toNumber(req.body.weight_before_kg);
  const workersInvolved = normalizeCleaningWorkers(req.body.workers_involved);
  const workerCleanedTotalKg = workersInvolved.reduce(
    (sum, worker) => sum + Number(worker.cleaned_nibs_kg || 0),
    0
  );
  const requestedWeightAfterKg = toNumber(req.body.weight_after_kg);
  const weightAfterKg = workerCleanedTotalKg > 0
    ? Number(workerCleanedTotalKg.toFixed(2))
    : requestedWeightAfterKg;
  const remarks = req.body.remarks ? String(req.body.remarks).trim() : null;

  if (!batchCode || weightBeforeKg === null || weightAfterKg === null) {
    return res.status(400).json({ error: 'batch_code, weight_before_kg, and weight_after_kg are required' });
  }

  try {
    const cocoaBatch = await getCocoaBatchByCode(batchCode);
    if (!cocoaBatch) return res.status(404).json({ error: 'Create Beans Arrival first for this batch code' });

    const result = await pool.query(
      `INSERT INTO cocoa_cleaning_nibs (
         cocoa_batch_id,
         weight_before_kg,
         weight_after_kg,
         workers_involved,
         remarks,
         updated_at
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (cocoa_batch_id)
       DO UPDATE SET
         weight_before_kg = EXCLUDED.weight_before_kg,
         weight_after_kg = EXCLUDED.weight_after_kg,
         workers_involved = EXCLUDED.workers_involved,
         remarks = EXCLUDED.remarks,
         updated_at = NOW()
       RETURNING *`,
      [cocoaBatch.id, weightBeforeKg, weightAfterKg, JSON.stringify(workersInvolved), remarks]
    );

    const inventory = await recomputeNibsInventory(batchCode, cocoaBatch.id);
    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [cocoaBatch.id]);
    res.status(201).json({
      cleaning: result.rows[0],
      inventory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nibs-packing', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const totalNibsWeightKg = toNumber(req.body.total_nibs_weight_kg);
  const numberOfBags = toNumber(req.body.number_of_bags);

  if (!batchCode || totalNibsWeightKg === null || numberOfBags === null) {
    return res.status(400).json({ error: 'batch_code, total_nibs_weight_kg, and number_of_bags are required' });
  }

  try {
    const cocoaBatch = await getCocoaBatchByCode(batchCode);
    if (!cocoaBatch) return res.status(404).json({ error: 'Create Beans Arrival first for this batch code' });
    const cleaningResult = await pool.query(
      `SELECT weight_after_kg
       FROM cocoa_cleaning_nibs
       WHERE cocoa_batch_id = $1
       LIMIT 1`,
      [cocoaBatch.id]
    );
    const cleanedNibsKg = toNumber(cleaningResult.rows[0]?.weight_after_kg);
    if (cleanedNibsKg !== null) {
      const totalUsedKg = await getChocolateNibsUsedKg(batchCode);
      const remainingAvailableKg = Number(Math.max(cleanedNibsKg - totalUsedKg, 0).toFixed(2));
      if (totalNibsWeightKg > remainingAvailableKg) {
        return res.status(400).json({ error: `Only ${remainingAvailableKg} kg currently available to pack for this batch` });
      }
    }

    await pool.query('BEGIN');

    const packingResult = await pool.query(
      `INSERT INTO cocoa_nibs_packing (cocoa_batch_id, total_nibs_weight_kg, number_of_bags, completed_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (cocoa_batch_id)
       DO UPDATE SET
         total_nibs_weight_kg = EXCLUDED.total_nibs_weight_kg,
         number_of_bags = EXCLUDED.number_of_bags,
         completed_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [cocoaBatch.id, totalNibsWeightKg, numberOfBags]
    );

    const inventoryResult = await recomputeNibsInventory(batchCode, cocoaBatch.id);

    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [cocoaBatch.id]);
    await pool.query('COMMIT');

    res.status(201).json({
      packing: packingResult.rows[0],
      inventory: inventoryResult,
    });
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
