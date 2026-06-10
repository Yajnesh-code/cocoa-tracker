const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

const CHOCOLATE_BAR_WEIGHT_G = 50;
const ALLOWED_COUVERTURE_PACK_SIZES_G = [250, 500];

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeBatchNo(batchNo) {
  return String(batchNo || '').trim().toUpperCase();
}

function ensureAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return false;
  }
  return true;
}

async function getProductionBatchByNumber(productionBatchNumber) {
  const result = await pool.query(
    `SELECT *
     FROM chocolate_grinding_conching
     WHERE production_batch_number = $1
     LIMIT 1`,
    [normalizeBatchNo(productionBatchNumber)]
  );
  return result.rows[0] || null;
}

function inventoryStatusFromStock(stockKg) {
  return Number(stockKg || 0) > 0 ? 'Active' : 'Fully Consumed';
}

async function nextProductionBatchNumber() {
  const result = await pool.query(
    `SELECT production_batch_number
     FROM chocolate_grinding_conching
     WHERE production_batch_number ~ '^CP[0-9]+$'
     ORDER BY LENGTH(production_batch_number) DESC, production_batch_number DESC
     LIMIT 1`
  );

  const current = result.rows[0]?.production_batch_number || 'CP000';
  const number = Number(current.replace(/^CP/, '')) || 0;
  return `CP${String(number + 1).padStart(3, '0')}`;
}

async function upsertSingleStepRecord({ table, productionBatchId, payload, columns }) {
  const insertColumns = ['production_batch_id', ...columns, 'updated_at'];
  const insertPlaceholders = insertColumns.map((_, index) => `$${index + 1}`);
  const updateAssignments = columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ');

  const values = [productionBatchId, ...columns.map((column) => payload[column]), new Date()];

  const result = await pool.query(
    `INSERT INTO ${table} (${insertColumns.join(', ')})
     VALUES (${insertPlaceholders.join(', ')})
     ON CONFLICT (production_batch_id)
     DO UPDATE SET
       ${updateAssignments},
       updated_at = NOW()
     RETURNING *`,
    values
  );
  return result.rows[0];
}

router.get('/recipes', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recipe_master ORDER BY recipe_name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/recipes', auth, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const recipeName = String(req.body.recipe_name || '').trim();
  if (!recipeName) return res.status(400).json({ error: 'recipe_name is required' });

  try {
    const result = await pool.query(
      'INSERT INTO recipe_master (recipe_name, is_default, updated_at) VALUES ($1, FALSE, NOW()) RETURNING *',
      [recipeName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Recipe already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/recipes/:id', auth, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const recipeName = String(req.body.recipe_name || '').trim();
  if (!recipeName) return res.status(400).json({ error: 'recipe_name is required' });

  try {
    const result = await pool.query(
      'UPDATE recipe_master SET recipe_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [recipeName, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Recipe not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Recipe already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/recipes/:id', auth, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const recipeUsage = await pool.query(
      'SELECT COUNT(*)::int AS count FROM chocolate_grinding_conching WHERE recipe_id = $1',
      [req.params.id]
    );
    if ((recipeUsage.rows[0]?.count || 0) > 0) {
      return res.status(409).json({ error: 'Cannot delete recipe used in production batches' });
    }

    const result = await pool.query('DELETE FROM recipe_master WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ message: 'Recipe deleted', recipe: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/batches', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         cgc.*,
         rm.recipe_name,
         ni.available_nibs_stock_kg AS source_batch_remaining_nibs_stock_kg,
         ccp.pack_size_g,
         ccp.number_of_couverture_packs,
         ccp.total_weight_g AS couverture_total_weight_g,
         ct.tempering_temperature_c,
         ct.remarks AS tempering_remarks,
         cmw.weight_before_moulding_kg,
         cmw.weight_after_moulding_kg,
         cd.demoulded_quantity,
         cd.broken_bars,
         cp.total_chocolate_weight_kg,
         cp.packed_bars,
         csr.sample_saved,
         csr.sample_weight_kg,
         csr.finished_at
       FROM chocolate_grinding_conching cgc
       LEFT JOIN recipe_master rm ON rm.id = cgc.recipe_id
       LEFT JOIN nibs_inventory ni ON ni.id = cgc.nib_inventory_id
       LEFT JOIN chocolate_couverture_packing ccp ON ccp.production_batch_id = cgc.id
       LEFT JOIN chocolate_tempering ct ON ct.production_batch_id = cgc.id
       LEFT JOIN chocolate_moulding_weighing cmw ON cmw.production_batch_id = cgc.id
       LEFT JOIN chocolate_demoulding cd ON cd.production_batch_id = cgc.id
       LEFT JOIN chocolate_packing cp ON cp.production_batch_id = cgc.id
       LEFT JOIN chocolate_sample_retention csr ON csr.production_batch_id = cgc.id
       ORDER BY cgc.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/grinding-conching', auth, async (req, res) => {
  const sourceBatchCode = String(req.body.source_batch_code || '').trim().toUpperCase();
  const recipeId = toNumber(req.body.recipe_id);
  const nibsQuantityUsedKg = toNumber(req.body.nibs_quantity_used_kg);
  const startTime = req.body.start_time;
  const endTime = req.body.end_time || null;
  const powerFailure = Boolean(req.body.power_failure);
  const remarks = req.body.remarks ? String(req.body.remarks).trim() : null;

  if (!sourceBatchCode || recipeId === null || nibsQuantityUsedKg === null || !startTime) {
    return res.status(400).json({ error: 'source_batch_code, recipe_id, nibs_quantity_used_kg, and start_time are required' });
  }

  try {
    await pool.query('BEGIN');

    const recipeResult = await pool.query('SELECT id FROM recipe_master WHERE id = $1 LIMIT 1', [recipeId]);
    if (!recipeResult.rows[0]) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const inventoryResult = await pool.query(
      `SELECT *
       FROM nibs_inventory
       WHERE batch_code = $1
       LIMIT 1`,
      [sourceBatchCode]
    );
    const inventory = inventoryResult.rows[0];
    if (!inventory) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Source batch nib inventory not found' });
    }

    const availableStock = Number(inventory.available_nibs_stock_kg || 0);
    if (nibsQuantityUsedKg > availableStock) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: 'Nibs quantity used cannot be greater than available stock' });
    }

    const remainingStock = Number((availableStock - nibsQuantityUsedKg).toFixed(2));
    const inventoryStatus = remainingStock > 0 ? 'Active' : 'Fully Consumed';
    const productionBatchNumber = await nextProductionBatchNumber();

    const createBatchResult = await pool.query(
      `INSERT INTO chocolate_grinding_conching (
         production_batch_number,
         source_batch_code,
         nib_inventory_id,
         recipe_id,
         nibs_quantity_used_kg,
         remaining_nibs_stock_kg,
         start_time,
         end_time,
         power_failure,
         remarks,
         status,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', NOW())
       RETURNING *`,
      [
        productionBatchNumber,
        sourceBatchCode,
        inventory.id,
        recipeId,
        nibsQuantityUsedKg,
        remainingStock,
        startTime,
        endTime,
        powerFailure,
        remarks,
      ]
    );

    await pool.query(
      `UPDATE nibs_inventory
       SET available_nibs_stock_kg = $1,
           status = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [remainingStock, inventoryStatus, inventory.id]
    );

    await pool.query('COMMIT');
    res.status(201).json(createBatchResult.rows[0]);
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore rollback error
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/grinding-conching/:production_batch_number', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.params.production_batch_number);
  const sourceBatchCode = String(req.body.source_batch_code || '').trim().toUpperCase();
  const recipeId = toNumber(req.body.recipe_id);
  const nibsQuantityUsedKg = toNumber(req.body.nibs_quantity_used_kg);
  const startTime = req.body.start_time;
  const endTime = req.body.end_time || null;
  const powerFailure = Boolean(req.body.power_failure);
  const remarks = req.body.remarks ? String(req.body.remarks).trim() : null;

  if (!productionBatchNumber || !sourceBatchCode || recipeId === null || nibsQuantityUsedKg === null || !startTime) {
    return res.status(400).json({ error: 'production_batch_number, source_batch_code, recipe_id, nibs_quantity_used_kg, and start_time are required' });
  }

  try {
    await pool.query('BEGIN');

    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Production batch not found' });
    }

    const recipeResult = await pool.query('SELECT id FROM recipe_master WHERE id = $1 LIMIT 1', [recipeId]);
    if (!recipeResult.rows[0]) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const oldInventoryResult = await pool.query(
      `SELECT *
       FROM nibs_inventory
       WHERE id = $1
       LIMIT 1`,
      [batch.nib_inventory_id]
    );
    const oldInventory = oldInventoryResult.rows[0];
    if (!oldInventory) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Current source batch nib inventory not found' });
    }

    const newInventoryResult = await pool.query(
      `SELECT *
       FROM nibs_inventory
       WHERE batch_code = $1
       LIMIT 1`,
      [sourceBatchCode]
    );
    const newInventory = newInventoryResult.rows[0];
    if (!newInventory) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Selected source batch nib inventory not found' });
    }

    const currentUsedQtyKg = Number(batch.nibs_quantity_used_kg || 0);
    const availableForUpdateKg = newInventory.id === oldInventory.id
      ? Number(newInventory.available_nibs_stock_kg || 0) + currentUsedQtyKg
      : Number(newInventory.available_nibs_stock_kg || 0);

    if (nibsQuantityUsedKg > availableForUpdateKg) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: 'Nibs quantity used cannot be greater than available stock' });
    }

    if (newInventory.id !== oldInventory.id) {
      const restoredOldStockKg = Number(Number(oldInventory.available_nibs_stock_kg || 0) + currentUsedQtyKg).toFixed(2);
      await pool.query(
        `UPDATE nibs_inventory
         SET available_nibs_stock_kg = $1,
             status = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [restoredOldStockKg, inventoryStatusFromStock(restoredOldStockKg), oldInventory.id]
      );
    }

    const remainingNewStockKg = Number((availableForUpdateKg - nibsQuantityUsedKg).toFixed(2));
    await pool.query(
      `UPDATE nibs_inventory
       SET available_nibs_stock_kg = $1,
           status = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [remainingNewStockKg, inventoryStatusFromStock(remainingNewStockKg), newInventory.id]
    );

    const result = await pool.query(
      `UPDATE chocolate_grinding_conching
       SET source_batch_code = $1,
           nib_inventory_id = $2,
           recipe_id = $3,
           nibs_quantity_used_kg = $4,
           remaining_nibs_stock_kg = $5,
           start_time = $6,
           end_time = $7,
           power_failure = $8,
           remarks = $9,
           updated_at = NOW()
       WHERE production_batch_number = $10
       RETURNING *`,
      [
        sourceBatchCode,
        newInventory.id,
        recipeId,
        nibsQuantityUsedKg,
        remainingNewStockKg,
        startTime,
        endTime,
        powerFailure,
        remarks,
        productionBatchNumber,
      ]
    );

    await pool.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore rollback error
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/couverture-packing', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.body.production_batch_number);
  const packSizeG = toNumber(req.body.pack_size_g, 500);
  const numberOfCouverturePacks = toNumber(req.body.number_of_couverture_packs);

  if (!productionBatchNumber || numberOfCouverturePacks === null) {
    return res.status(400).json({ error: 'production_batch_number and number_of_couverture_packs are required' });
  }

  if (!ALLOWED_COUVERTURE_PACK_SIZES_G.includes(packSizeG)) {
    return res.status(400).json({ error: 'pack_size_g must be 250 or 500' });
  }

  try {
    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) return res.status(404).json({ error: 'Production batch not found' });

    const totalWeightG = Math.round(numberOfCouverturePacks * packSizeG);
    const result = await upsertSingleStepRecord({
      table: 'chocolate_couverture_packing',
      productionBatchId: batch.id,
      payload: {
        pack_size_g: packSizeG,
        number_of_couverture_packs: numberOfCouverturePacks,
        total_weight_g: totalWeightG,
      },
      columns: ['pack_size_g', 'number_of_couverture_packs', 'total_weight_g'],
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tempering', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.body.production_batch_number);
  const temperingTemperatureC = toNumber(req.body.tempering_temperature_c);
  const remarks = req.body.remarks ? String(req.body.remarks).trim() : null;

  if (!productionBatchNumber || temperingTemperatureC === null) {
    return res.status(400).json({ error: 'production_batch_number and tempering_temperature_c are required' });
  }

  try {
    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) return res.status(404).json({ error: 'Production batch not found' });

    const result = await upsertSingleStepRecord({
      table: 'chocolate_tempering',
      productionBatchId: batch.id,
      payload: {
        tempering_temperature_c: temperingTemperatureC,
        remarks,
      },
      columns: ['tempering_temperature_c', 'remarks'],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/moulding-weighing', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.body.production_batch_number);
  const weightBeforeMouldingKg = toNumber(req.body.weight_before_moulding_kg);
  const weightAfterMouldingKg = toNumber(req.body.weight_after_moulding_kg);

  if (!productionBatchNumber || weightBeforeMouldingKg === null || weightAfterMouldingKg === null) {
    return res.status(400).json({ error: 'production_batch_number, weight_before_moulding_kg, and weight_after_moulding_kg are required' });
  }

  try {
    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) return res.status(404).json({ error: 'Production batch not found' });

    const result = await upsertSingleStepRecord({
      table: 'chocolate_moulding_weighing',
      productionBatchId: batch.id,
      payload: {
        weight_before_moulding_kg: weightBeforeMouldingKg,
        weight_after_moulding_kg: weightAfterMouldingKg,
      },
      columns: ['weight_before_moulding_kg', 'weight_after_moulding_kg'],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/demoulding', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.body.production_batch_number);
  const demouldedQuantity = toNumber(req.body.demoulded_quantity);
  const brokenBars = toNumber(req.body.broken_bars, 0);

  if (!productionBatchNumber || demouldedQuantity === null) {
    return res.status(400).json({ error: 'production_batch_number and demoulded_quantity are required' });
  }

  try {
    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) return res.status(404).json({ error: 'Production batch not found' });

    const result = await upsertSingleStepRecord({
      table: 'chocolate_demoulding',
      productionBatchId: batch.id,
      payload: {
        demoulded_quantity: demouldedQuantity,
        broken_bars: brokenBars,
      },
      columns: ['demoulded_quantity', 'broken_bars'],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/packing', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.body.production_batch_number);
  const totalChocolateWeightKg = toNumber(req.body.total_chocolate_weight_kg);

  if (!productionBatchNumber || totalChocolateWeightKg === null) {
    return res.status(400).json({ error: 'production_batch_number and total_chocolate_weight_kg are required' });
  }

  try {
    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) return res.status(404).json({ error: 'Production batch not found' });

    const packedBars = Math.floor((totalChocolateWeightKg * 1000) / CHOCOLATE_BAR_WEIGHT_G);
    const result = await upsertSingleStepRecord({
      table: 'chocolate_packing',
      productionBatchId: batch.id,
      payload: {
        total_chocolate_weight_kg: totalChocolateWeightKg,
        packed_bars: packedBars,
      },
      columns: ['total_chocolate_weight_kg', 'packed_bars'],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sample-retention', auth, async (req, res) => {
  const productionBatchNumber = normalizeBatchNo(req.body.production_batch_number);
  const sampleSaved = req.body.sample_saved === true || req.body.sample_saved === 'true' || req.body.sample_saved === 'Yes';
  const sampleWeightKg = req.body.sample_weight_kg !== undefined ? toNumber(req.body.sample_weight_kg, null) : null;

  if (!productionBatchNumber) {
    return res.status(400).json({ error: 'production_batch_number is required' });
  }

  try {
    await pool.query('BEGIN');

    const batch = await getProductionBatchByNumber(productionBatchNumber);
    if (!batch) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Production batch not found' });
    }

    const result = await upsertSingleStepRecord({
      table: 'chocolate_sample_retention',
      productionBatchId: batch.id,
      payload: {
        sample_saved: sampleSaved,
        sample_weight_kg: sampleWeightKg,
        finished_at: new Date(),
      },
      columns: ['sample_saved', 'sample_weight_kg', 'finished_at'],
    });

    await pool.query(
      `UPDATE chocolate_grinding_conching
       SET status = 'Completed',
           updated_at = NOW()
       WHERE id = $1`,
      [batch.id]
    );

    await pool.query('COMMIT');
    res.status(201).json(result);
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore rollback error
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
