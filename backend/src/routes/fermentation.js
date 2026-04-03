const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const MAX_ACTIVE_BATCHES_PER_BOX = 2;
const VALID_BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap((letter) => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

function normalizeBox(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).toUpperCase();
}

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
    const boxes = [
      row.good_box_id || (!row.bad_box_id ? row.box_id : null),
      row.bad_box_id || null,
    ].filter(Boolean);

    boxes.forEach((box) => {
      if (!map[box]) map[box] = new Set();
      map[box].add(row.batch_id);
    });

    return map;
  }, {});
}

// GET all fermentation records with batch details
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, b.batch_code, fr.name AS farmer_name
       FROM fermentation f
       JOIN batches b ON f.batch_id = b.id
       JOIN farmers fr ON b.farmer_id = fr.id
       ORDER BY COALESCE(f.good_box_id, f.bad_box_id, f.box_id), f.batch_id`
    );
    res.json(result.rows.map(normalizeFermentationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET fermentation records by batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM fermentation
       WHERE batch_id = $1
       ORDER BY COALESCE(good_box_id, bad_box_id, box_id)`,
      [req.params.batch_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Fermentation record not found' });
    }
    res.json(result.rows.map(normalizeFermentationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST start fermentation
router.post('/', auth, async (req, res) => {
  const { batch_id, good_box_id, bad_box_id, start_date, good_weight, bad_weight } = req.body;
  if (!batch_id || !start_date) {
    return res.status(400).json({ error: 'batch_id and start_date are required' });
  }

  const goodBox = normalizeBox(good_box_id);
  const badBox = normalizeBox(bad_box_id);

  if (!goodBox && !badBox) {
    return res.status(400).json({ error: 'Provide at least one good or bad beans box' });
  }

  if ((goodBox && !VALID_BOXES.includes(goodBox)) || (badBox && !VALID_BOXES.includes(badBox))) {
    return res.status(400).json({ error: 'Fermentation boxes must be in range A1-E12' });
  }

  const goodWeight = good_weight !== undefined && good_weight !== null && good_weight !== ''
    ? Number(good_weight)
    : null;
  const badWeight = bad_weight !== undefined && bad_weight !== null && bad_weight !== ''
    ? Number(bad_weight)
    : null;

  try {
    const activeForBatch = await pool.query(
      'SELECT id FROM fermentation WHERE batch_id = $1 AND status = $2',
      [batch_id, 'active']
    );
    if (activeForBatch.rows.length) {
      return res.status(409).json({ error: 'This batch already has an active fermentation record' });
    }

    const activeAssignments = await pool.query(
      'SELECT batch_id, box_id, good_box_id, bad_box_id FROM fermentation WHERE status = $1',
      ['active']
    );
    const occupancy = buildActiveBoxMap(activeAssignments.rows);

    for (const box of [...new Set([goodBox, badBox].filter(Boolean))]) {
      const currentCount = occupancy[box] ? occupancy[box].size : 0;
      if (currentCount >= MAX_ACTIVE_BATCHES_PER_BOX) {
        return res.status(409).json({ error: `Box ${box} already has ${MAX_ACTIVE_BATCHES_PER_BOX} active batches` });
      }
    }

    const primaryBox = goodBox || badBox;
    const result = await pool.query(
      `INSERT INTO fermentation (batch_id, box_id, good_box_id, bad_box_id, good_weight, bad_weight, start_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
      [batch_id, primaryBox, goodBox, badBox, goodWeight, badWeight, start_date]
    );
    res.status(201).json(normalizeFermentationRecord(result.rows[0]));
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
      `UPDATE fermentation SET end_date = $1, status = 'completed'
       WHERE batch_id = $2 AND status = 'active' RETURNING *`,
      [end_date, req.params.batch_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'No active fermentation records found for this batch' });
    }
    res.json(result.rows.map(normalizeFermentationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
