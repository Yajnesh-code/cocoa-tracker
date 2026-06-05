const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/:batch_code', auth, async (req, res) => {
  const batchCode = String(req.params.batch_code || '').trim().toUpperCase();
  if (!batchCode) return res.status(400).json({ error: 'batch_code is required' });

  try {
    const cocoaBatchResult = await pool.query(
      `SELECT *
       FROM cocoa_processing_batches
       WHERE batch_code = $1
       LIMIT 1`,
      [batchCode]
    );
    const cocoaBatch = cocoaBatchResult.rows[0];
    if (!cocoaBatch) return res.status(404).json({ error: 'Batch not found in cocoa processing' });

    const [
      roastLots,
      winnowing,
      cleaning,
      nibsPacking,
      inventory,
      productionRuns,
    ] = await Promise.all([
      pool.query(
        `SELECT *
         FROM cocoa_roast_lots
         WHERE cocoa_batch_id = $1
         ORDER BY created_at ASC`,
        [cocoaBatch.id]
      ),
      pool.query(
        `SELECT *
         FROM cocoa_winnowing
         WHERE cocoa_batch_id = $1
         LIMIT 1`,
        [cocoaBatch.id]
      ),
      pool.query(
        `SELECT *
         FROM cocoa_cleaning_nibs
         WHERE cocoa_batch_id = $1
         LIMIT 1`,
        [cocoaBatch.id]
      ),
      pool.query(
        `SELECT *
         FROM cocoa_nibs_packing
         WHERE cocoa_batch_id = $1
         LIMIT 1`,
        [cocoaBatch.id]
      ),
      pool.query(
        `SELECT *
         FROM nibs_inventory
         WHERE cocoa_batch_id = $1
         LIMIT 1`,
        [cocoaBatch.id]
      ),
      pool.query(
        `SELECT
           cgc.*,
           rm.recipe_name,
           ccp.number_of_couverture_packs,
           ccp.total_weight_g AS couverture_total_weight_g,
           cm.number_of_couverture_packs_used,
           cm.melting_temperature_c,
           ct.tempering_temperature_c,
           ct.remarks AS tempering_remarks,
           cmw.weight_before_moulding_kg,
           cmw.weight_after_moulding_kg,
           cc.cooling_start_time,
           cc.cooling_end_time,
           cc.ac_temperature_c,
           cd.demoulded_quantity,
           cd.broken_bars,
           cp.total_chocolate_weight_kg,
           cp.packed_bars,
           csr.sample_saved,
           csr.sample_weight_kg,
           csr.finished_at
         FROM chocolate_grinding_conching cgc
         LEFT JOIN recipe_master rm ON rm.id = cgc.recipe_id
         LEFT JOIN chocolate_couverture_packing ccp ON ccp.production_batch_id = cgc.id
         LEFT JOIN chocolate_melting cm ON cm.production_batch_id = cgc.id
         LEFT JOIN chocolate_tempering ct ON ct.production_batch_id = cgc.id
         LEFT JOIN chocolate_moulding_weighing cmw ON cmw.production_batch_id = cgc.id
         LEFT JOIN chocolate_cooling cc ON cc.production_batch_id = cgc.id
         LEFT JOIN chocolate_demoulding cd ON cd.production_batch_id = cgc.id
         LEFT JOIN chocolate_packing cp ON cp.production_batch_id = cgc.id
         LEFT JOIN chocolate_sample_retention csr ON csr.production_batch_id = cgc.id
         WHERE cgc.source_batch_code = $1
         ORDER BY cgc.created_at ASC`,
        [batchCode]
      ),
    ]);

    res.json({
      batch_code: batchCode,
      beans_arrival: cocoaBatch,
      roasting: roastLots.rows,
      winnowing: winnowing.rows[0] || null,
      cleaning_nibs: cleaning.rows[0] || null,
      nibs_packing: nibsPacking.rows[0] || null,
      inventory: inventory.rows[0] || null,
      chocolate_production_runs: productionRuns.rows,
      remaining_nibs_inventory_kg: Number(inventory.rows[0]?.available_nibs_stock_kg || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
