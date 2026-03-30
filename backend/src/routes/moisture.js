const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// GET all moisture logs for a batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM moisture_logs WHERE batch_id = $1 ORDER BY log_date',
      [req.params.batch_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add moisture log
router.post('/', auth, async (req, res) => {
  const { batch_id, moisture_pct, log_date } = req.body;
  if (!batch_id || moisture_pct === undefined || !log_date)
    return res.status(400).json({ error: 'batch_id, moisture_pct, and log_date are required' });

  try {
    const result = await pool.query(
      `INSERT INTO moisture_logs (batch_id, moisture_pct, log_date)
       VALUES ($1, $2, $3) RETURNING *`,
      [batch_id, moisture_pct, log_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
