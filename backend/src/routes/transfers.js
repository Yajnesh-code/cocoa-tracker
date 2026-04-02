const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const MAX_ACTIVE_BATCHES_PER_BOX = 2;

const VALID_BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap(letter => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

// GET all transfers for a batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transfers WHERE batch_id = $1 ORDER BY transfer_date',
      [req.params.batch_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record a transfer
router.post('/', auth, async (req, res) => {
  const { batch_id, from_box, to_box, transfer_date } = req.body;
  if (!batch_id || !from_box || !to_box || !transfer_date) {
    return res.status(400).json({ error: 'batch_id, from_box, to_box, and transfer_date are required' });
  }

  const from = from_box.toUpperCase();
  const to = to_box.toUpperCase();

  if (!VALID_BOXES.includes(from) || !VALID_BOXES.includes(to)) {
    return res.status(400).json({ error: 'Boxes must be A1-E12' });
  }

  if (from === to) {
    return res.status(400).json({ error: 'from_box and to_box cannot be the same' });
  }

  try {
    const ferResult = await pool.query(
      'SELECT * FROM fermentation WHERE batch_id = $1 AND box_id = $2 AND status = $3',
      [batch_id, from, 'active']
    );
    if (!ferResult.rows[0]) {
      return res.status(400).json({ error: `Batch is not currently in ${from}` });
    }

    const occupied = await pool.query(
      'SELECT batch_id FROM fermentation WHERE box_id = $1 AND status = $2 AND batch_id <> $3',
      [to, 'active', batch_id]
    );
    if (occupied.rows.length >= MAX_ACTIVE_BATCHES_PER_BOX) {
      return res.status(409).json({ error: `Target box ${to} already has ${MAX_ACTIVE_BATCHES_PER_BOX} active batches` });
    }

    await pool.query('BEGIN');
    const result = await pool.query(
      `INSERT INTO transfers (batch_id, from_box, to_box, transfer_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [batch_id, from, to, transfer_date]
    );
    await pool.query(
      'UPDATE fermentation SET box_id = $1 WHERE batch_id = $2 AND box_id = $3 AND status = $4',
      [to, batch_id, from, 'active']
    );
    await pool.query('COMMIT');

    res.status(201).json(result.rows[0]);
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      // ignore rollback errors
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
