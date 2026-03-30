const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// GET packing record by batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM packing WHERE batch_id = $1', [req.params.batch_id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Packing record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record packing
router.post('/', auth, async (req, res) => {
  const { batch_id, bag_weights, packing_date } = req.body;
  if (!batch_id || !bag_weights || !Array.isArray(bag_weights) || !packing_date)
    return res.status(400).json({ error: 'batch_id, bag_weights (array), and packing_date are required' });

  const final_weight = bag_weights.reduce((sum, w) => sum + Number(w), 0);
  const bag_count = bag_weights.length;

  try {
    const result = await pool.query(
      `INSERT INTO packing (batch_id, bag_count, final_weight, packing_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (batch_id) DO UPDATE SET bag_count=$2, final_weight=$3, packing_date=$4
       RETURNING *`,
      [batch_id, bag_count, final_weight, packing_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
