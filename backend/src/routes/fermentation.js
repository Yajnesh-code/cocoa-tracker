const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { syncBatchStage } = require('../utils/googleSheetSync');
const { notifyFermentationStart } = require('../utils/notificationHelper');

const MAX_ACTIVE_BATCHES_PER_BOX = 5;
const VALID_BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap((letter) => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

function normalizeBox(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).toUpperCase();
}

function parseBoxList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeBox).filter(Boolean);
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return String(value)
    .split(',')
    .map((item) => normalizeBox(item.trim()))
    .filter(Boolean);
}

function uniqueBoxes(values) {
  return Array.from(new Set(values));
}

function joinBoxes(values) {
  return uniqueBoxes(values).join(', ');
}

function normalizeFermentationRecord(record) {
  const goodBoxes = parseBoxList(record.good_box_id || (!record.bad_box_id ? record.box_id : ''));
  const badBoxes = parseBoxList(record.bad_box_id);

  return {
    ...record,
    box_id: joinBoxes(goodBoxes.length ? goodBoxes : badBoxes),
    good_box_id: joinBoxes(goodBoxes),
    bad_box_id: joinBoxes(badBoxes),
    good_box_ids: goodBoxes,
    bad_box_ids: badBoxes,
  };
}

function buildActiveBoxMap(rows) {
  return rows.reduce((map, row) => {
    const normalized = normalizeFermentationRecord(row);
    [...normalized.good_box_ids, ...normalized.bad_box_ids].forEach((box) => {
      if (!map[box]) map[box] = new Set();
      map[box].add(normalized.batch_id);
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
  const { batch_id, good_box_ids, bad_box_ids, start_date, good_weight, bad_weight } = req.body;
  if (!batch_id || !start_date) {
    return res.status(400).json({ error: 'batch_id and start_date are required' });
  }

  const goodBoxes = uniqueBoxes(parseBoxList(good_box_ids));
  const badBoxes = uniqueBoxes(parseBoxList(bad_box_ids));

  if (!goodBoxes.length && !badBoxes.length) {
    return res.status(400).json({ error: 'Provide at least one good or bad beans box' });
  }

  const allBoxes = uniqueBoxes([...goodBoxes, ...badBoxes]);
  if (allBoxes.some((box) => !VALID_BOXES.includes(box))) {
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

    for (const box of allBoxes) {
      const currentCount = occupancy[box] ? occupancy[box].size : 0;
      if (currentCount >= MAX_ACTIVE_BATCHES_PER_BOX) {
        return res.status(409).json({ error: `Box ${box} already has ${MAX_ACTIVE_BATCHES_PER_BOX} active batches` });
      }
    }

    const primaryBox = joinBoxes(goodBoxes.length ? goodBoxes : badBoxes);
    const result = await pool.query(
      `INSERT INTO fermentation (batch_id, box_id, good_box_id, bad_box_id, good_weight, bad_weight, start_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
      [batch_id, primaryBox, joinBoxes(goodBoxes), joinBoxes(badBoxes), goodWeight, badWeight, start_date]
    );
    const normalizedRecord = normalizeFermentationRecord(result.rows[0]);

    await syncBatchStage(pool, batch_id, {
      stage: 'Fermentation',
      fermentation_good_boxes: normalizedRecord.good_box_ids,
      fermentation_bad_boxes: normalizedRecord.bad_box_ids,
      fermentation_start_date: normalizedRecord.start_date,
      fermentation_end_date: normalizedRecord.end_date,
      status: normalizedRecord.status,
    });

    // Create notification when fermentation starts
    await notifyFermentationStart(batch_id, primaryBox, start_date);

    res.status(201).json(normalizedRecord);
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
    const normalizedRecords = result.rows.map(normalizeFermentationRecord);

    await syncBatchStage(pool, req.params.batch_id, {
      stage: 'Fermentation',
      fermentation_good_boxes: normalizedRecords[0].good_box_ids,
      fermentation_bad_boxes: normalizedRecords[0].bad_box_ids,
      fermentation_start_date: normalizedRecords[0].start_date,
      fermentation_end_date: normalizedRecords[0].end_date,
      status: normalizedRecords[0].status,
    });

    res.json(normalizedRecords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
