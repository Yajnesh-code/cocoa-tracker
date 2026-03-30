const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const VALID_BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap(letter => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

// GET all fermentation records with batch details
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, b.batch_code, fr.name AS farmer_name
       FROM fermentation f
       JOIN batches b ON f.batch_id = b.id
       JOIN farmers fr ON b.farmer_id = fr.id
       ORDER BY box_id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET fermentation records by batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fermentation WHERE batch_id = $1 ORDER BY box_id', [req.params.batch_id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Fermentation record not found' });
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST start fermentation
router.post('/', auth, async (req, res) => {
  const { batch_id, box_id, start_date, good_weight, bad_weight } = req.body;
  if (!batch_id || !box_id || !start_date) {
    return res.status(400).json({ error: 'batch_id, box_id, and start_date are required' });
  }

  const box = box_id.toUpperCase();
  if (!VALID_BOXES.includes(box)) {
    return res.status(400).json({ error: 'box_id must be A1-E12' });
  }

  const goodWeight = good_weight !== undefined && good_weight !== null && good_weight !== ''
    ? Number(good_weight)
    : null;
  const badWeight = bad_weight !== undefined && bad_weight !== null && bad_weight !== ''
    ? Number(bad_weight)
    : null;

  try {
    const occupied = await pool.query(
      'SELECT batch_id FROM fermentation WHERE box_id = $1 AND status = $2',
      [box, 'active']
    );
    if (occupied.rows.length) {
      return res.status(409).json({ error: `Box ${box} is already occupied by another batch` });
    }

    const duplicate = await pool.query(
      'SELECT id FROM fermentation WHERE batch_id = $1 AND box_id = $2 AND status = $3',
      [batch_id, box, 'active']
    );
    if (duplicate.rows.length) {
      return res.status(409).json({ error: `Batch already has an active assignment in ${box}` });
    }

    const result = await pool.query(
      `INSERT INTO fermentation (batch_id, box_id, good_weight, bad_weight, start_date, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
      [batch_id, box, goodWeight, badWeight, start_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH complete fermentation for a batch
router.patch('/:batch_id/complete', auth, async (req, res) => {
  const { end_date } = req.body;
  if (!end_date) {
    return res.status(400).json({ error: 'end_date is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE fermentation SET end_date=$1, status='completed'
       WHERE batch_id=$2 AND status='active' RETURNING *`,
      [end_date, req.params.batch_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'No active fermentation records found for this batch' });
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
