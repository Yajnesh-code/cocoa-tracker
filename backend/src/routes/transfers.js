const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const MAX_ACTIVE_BATCHES_PER_BOX = 2;
const VALID_BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap((letter) => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

function normalizeFermentationRecord(record) {
  const goodBox = record.good_box_id || (!record.bad_box_id ? record.box_id : null);
  const badBox = record.bad_box_id || null;

  return {
    ...record,
    good_box_id: goodBox,
    bad_box_id: badBox,
  };
}

function buildActiveBoxMap(rows) {
  return rows.reduce((map, row) => {
    const normalized = normalizeFermentationRecord(row);
    [normalized.good_box_id, normalized.bad_box_id]
      .filter(Boolean)
      .forEach((box) => {
        if (!map[box]) map[box] = new Set();
        map[box].add(normalized.batch_id);
      });
    return map;
  }, {});
}

// GET all transfers for a batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transfers WHERE batch_id = $1 ORDER BY transfer_date, id',
      [req.params.batch_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record a transfer
router.post('/', auth, async (req, res) => {
  const { batch_id, bean_type, from_box, to_box, transfer_date } = req.body;
  if (!batch_id || !bean_type || !from_box || !to_box || !transfer_date) {
    return res.status(400).json({ error: 'batch_id, bean_type, from_box, to_box, and transfer_date are required' });
  }

  const type = String(bean_type).toLowerCase();
  if (!['good', 'bad'].includes(type)) {
    return res.status(400).json({ error: 'bean_type must be good or bad' });
  }

  const from = String(from_box).toUpperCase();
  const to = String(to_box).toUpperCase();

  if (!VALID_BOXES.includes(from) || !VALID_BOXES.includes(to)) {
    return res.status(400).json({ error: 'Boxes must be A1-E12' });
  }

  if (from === to) {
    return res.status(400).json({ error: 'from_box and to_box cannot be the same' });
  }

  try {
    const ferResult = await pool.query(
      'SELECT * FROM fermentation WHERE batch_id = $1 AND status = $2',
      [batch_id, 'active']
    );
    if (!ferResult.rows[0]) {
      return res.status(400).json({ error: 'Batch does not have an active fermentation record' });
    }

    const fermentation = normalizeFermentationRecord(ferResult.rows[0]);
    const currentBox = type === 'bad' ? fermentation.bad_box_id : fermentation.good_box_id;
    if (!currentBox) {
      return res.status(400).json({ error: `${type === 'bad' ? 'Bad' : 'Good'} beans are not currently assigned to any box` });
    }
    if (currentBox !== from) {
      return res.status(400).json({ error: `${type === 'bad' ? 'Bad' : 'Good'} beans are not currently in ${from}` });
    }

    const occupied = await pool.query(
      'SELECT batch_id, box_id, good_box_id, bad_box_id FROM fermentation WHERE status = $1 AND batch_id <> $2',
      ['active', batch_id]
    );
    const occupancy = buildActiveBoxMap(occupied.rows);
    if (((occupancy[to] ? occupancy[to].size : 0)) >= MAX_ACTIVE_BATCHES_PER_BOX) {
      return res.status(409).json({ error: `Target box ${to} already has ${MAX_ACTIVE_BATCHES_PER_BOX} active batches` });
    }

    await pool.query('BEGIN');
    const result = await pool.query(
      `INSERT INTO transfers (batch_id, bean_type, from_box, to_box, transfer_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [batch_id, type, from, to, transfer_date]
    );

    const nextGoodBox = type === 'good' ? to : fermentation.good_box_id;
    const nextBadBox = type === 'bad' ? to : fermentation.bad_box_id;
    const primaryBox = nextGoodBox || nextBadBox;

    await pool.query(
      `UPDATE fermentation
       SET box_id = $1, good_box_id = $2, bad_box_id = $3
       WHERE batch_id = $4 AND status = $5`,
      [primaryBox, nextGoodBox, nextBadBox, batch_id, 'active']
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

module.exports = router;
