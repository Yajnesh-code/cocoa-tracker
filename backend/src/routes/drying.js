const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// GET all drying records with batch details
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, b.batch_code, fr.name AS farmer_name, fr.location
       FROM drying d
       JOIN batches b ON d.batch_id = b.id
       JOIN farmers fr ON b.farmer_id = fr.id
       ORDER BY d.start_date DESC, d.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET drying record by batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drying WHERE batch_id = $1', [req.params.batch_id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Drying record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST start drying
router.post('/', auth, async (req, res) => {
  const { batch_id, shelf_id, start_date } = req.body;
  if (!batch_id || !shelf_id || !start_date) {
    return res.status(400).json({ error: 'batch_id, shelf_id, and start_date are required' });
  }

  try {
    await pool.query('BEGIN');

    await pool.query(
      `UPDATE fermentation
       SET status = 'completed', end_date = COALESCE(end_date, $1)
       WHERE batch_id = $2 AND status = 'active'`,
      [start_date, batch_id]
    );

    const result = await pool.query(
      `INSERT INTO drying (batch_id, shelf_id, start_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (batch_id) DO UPDATE SET shelf_id = $2, start_date = $3, end_date = NULL
       RETURNING *`,
      [batch_id, shelf_id, start_date]
    );

    await pool.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH complete drying
router.patch('/:batch_id/complete', auth, async (req, res) => {
  const { end_date } = req.body;
  if (!end_date) return res.status(400).json({ error: 'end_date is required' });

  try {
    const result = await pool.query(
      'UPDATE drying SET end_date = $1 WHERE batch_id = $2 RETURNING *',
      [end_date, req.params.batch_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Drying record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
