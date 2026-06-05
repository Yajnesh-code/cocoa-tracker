const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
         ) AS roast_lot_count
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

router.post('/beans-arrival', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const weightKg = toNumber(req.body.weight_kg);
  const moisturePct = toNumber(req.body.moisture_pct);

  if (!batchCode || weightKg === null || moisturePct === null) {
    return res.status(400).json({ error: 'batch_code, weight_kg, and moisture_pct are required' });
  }

  try {
    const sourceBatchId = await getSourceBatchIdByCode(batchCode);
    const result = await pool.query(
      `INSERT INTO cocoa_processing_batches (batch_code, source_batch_id, weight_kg, moisture_pct, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (batch_code)
       DO UPDATE SET
         source_batch_id = EXCLUDED.source_batch_id,
         weight_kg = EXCLUDED.weight_kg,
         moisture_pct = EXCLUDED.moisture_pct,
         updated_at = NOW()
       RETURNING *`,
      [batchCode, sourceBatchId, weightKg, moisturePct]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roasting-lots', auth, async (req, res) => {
  const batchCode = String(req.body.batch_code || '').trim().toUpperCase();
  const roastLotNumber = String(req.body.roast_lot_number || '').trim();
  const quantityRoastedKg = toNumber(req.body.quantity_roasted_kg);
  const weightAfterRoastingKg = toNumber(req.body.weight_after_roasting_kg);
  const moistureAfterRoastingPct = toNumber(req.body.moisture_after_roasting_pct);

  if (!batchCode || !roastLotNumber || quantityRoastedKg === null || weightAfterRoastingKg === null || moistureAfterRoastingPct === null) {
    return res.status(400).json({ error: 'batch_code, roast_lot_number, quantity_roasted_kg, weight_after_roasting_kg, and moisture_after_roasting_pct are required' });
  }

  if (quantityRoastedKg > 10) {
    return res.status(400).json({ error: 'Maximum roasting quantity per roast lot is 10 kg' });
  }

  try {
    const cocoaBatch = await getCocoaBatchByCode(batchCode);
    if (!cocoaBatch) return res.status(404).json({ error: 'Create Beans Arrival first for this batch code' });

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
       ON CONFLICT (cocoa_batch_id, roast_lot_number)
       DO UPDATE SET
         quantity_roasted_kg = EXCLUDED.quantity_roasted_kg,
         weight_after_roasting_kg = EXCLUDED.weight_after_roasting_kg,
         moisture_after_roasting_pct = EXCLUDED.moisture_after_roasting_pct,
         updated_at = NOW()
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
    if (!result.rows[0]) return res.status(404).json({ error: 'Roast lot not found' });

    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [result.rows[0].cocoa_batch_id]);
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
  const weightAfterKg = toNumber(req.body.weight_after_kg);
  const workersInvolved = Array.isArray(req.body.workers_involved) ? req.body.workers_involved : [];
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

    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [cocoaBatch.id]);
    res.status(201).json(result.rows[0]);
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

    const inventoryStatus = totalNibsWeightKg > 0 ? 'Active' : 'Fully Consumed';
    const inventoryResult = await pool.query(
      `INSERT INTO nibs_inventory (cocoa_batch_id, batch_code, available_nibs_stock_kg, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (cocoa_batch_id)
       DO UPDATE SET
         available_nibs_stock_kg = EXCLUDED.available_nibs_stock_kg,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [cocoaBatch.id, batchCode, totalNibsWeightKg, inventoryStatus]
    );

    await pool.query('UPDATE cocoa_processing_batches SET updated_at = NOW() WHERE id = $1', [cocoaBatch.id]);
    await pool.query('COMMIT');

    res.status(201).json({
      packing: packingResult.rows[0],
      inventory: inventoryResult.rows[0],
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
