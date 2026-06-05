const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const [
      beansResult,
      roastedResult,
      winnowedResult,
      nibsProducedResult,
      nibsInventoryResult,
      chocolateProducedResult,
      couvertureResult,
      barsResult,
      activeBatchesResult,
      completedBatchesResult,
      samplesSavedResult,
    ] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(weight_kg), 0) AS value FROM cocoa_processing_batches'),
      pool.query('SELECT COALESCE(SUM(quantity_roasted_kg), 0) AS value FROM cocoa_roast_lots'),
      pool.query('SELECT COALESCE(SUM(weight_after_kg), 0) AS value FROM cocoa_winnowing'),
      pool.query('SELECT COALESCE(SUM(total_nibs_weight_kg), 0) AS value FROM cocoa_nibs_packing'),
      pool.query('SELECT COALESCE(SUM(available_nibs_stock_kg), 0) AS value FROM nibs_inventory'),
      pool.query('SELECT COALESCE(SUM(total_chocolate_weight_kg), 0) AS value FROM chocolate_packing'),
      pool.query('SELECT COALESCE(SUM(number_of_couverture_packs), 0) AS value FROM chocolate_couverture_packing'),
      pool.query('SELECT COALESCE(SUM(packed_bars), 0) AS value FROM chocolate_packing'),
      pool.query("SELECT COUNT(*)::int AS value FROM chocolate_grinding_conching WHERE status = 'Active'"),
      pool.query("SELECT COUNT(*)::int AS value FROM chocolate_grinding_conching WHERE status = 'Completed'"),
      pool.query('SELECT COUNT(*)::int AS value FROM chocolate_sample_retention WHERE sample_saved = TRUE'),
    ]);

    res.json({
      cocoa_processing: {
        total_beans_received_kg: Number(beansResult.rows[0].value || 0),
        total_roasted_kg: Number(roastedResult.rows[0].value || 0),
        total_winnowed_kg: Number(winnowedResult.rows[0].value || 0),
        total_nibs_produced_kg: Number(nibsProducedResult.rows[0].value || 0),
        total_nibs_inventory_kg: Number(nibsInventoryResult.rows[0].value || 0),
      },
      chocolate_production: {
        total_chocolate_produced_kg: Number(chocolateProducedResult.rows[0].value || 0),
        total_couverture_packs_produced: Number(couvertureResult.rows[0].value || 0),
        total_bars_produced: Number(barsResult.rows[0].value || 0),
        active_production_batches: Number(activeBatchesResult.rows[0].value || 0),
        completed_production_batches: Number(completedBatchesResult.rows[0].value || 0),
        samples_saved: Number(samplesSavedResult.rows[0].value || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
