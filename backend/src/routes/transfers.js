const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { syncBatchStage } = require('../utils/googleSheetSync');

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

function replaceBox(boxes, from, to) {
  return uniqueBoxes(boxes.map((box) => (box === from ? to : box)));
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
  const { batch_id, bean_type, from_box, to_box, transfer_date, transfer_scope } = req.body;
  const scope = String(transfer_scope || 'batch').toLowerCase();

  if (!bean_type || !from_box || !to_box || !transfer_date) {
    return res.status(400).json({ error: 'bean_type, from_box, to_box, and transfer_date are required' });
  }

  if (scope !== 'box' && !batch_id) {
    return res.status(400).json({ error: 'batch_id is required for single-batch transfer' });
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
    let activeRecords = [];
    if (scope === 'box') {
      const recordsResult = await pool.query(
        'SELECT * FROM fermentation WHERE status = $1',
        ['active']
      );
      activeRecords = recordsResult.rows.map(normalizeFermentationRecord).filter((record) => {
        const currentBoxes = type === 'bad' ? record.bad_box_ids : record.good_box_ids;
        return currentBoxes.includes(from);
      });

      if (!activeRecords.length) {
        return res.status(400).json({ error: `No active ${type === 'bad' ? 'bad' : 'good'} beans batches found in ${from}` });
      }
    } else {
      const ferResult = await pool.query(
        'SELECT * FROM fermentation WHERE batch_id = $1 AND status = $2',
        [batch_id, 'active']
      );
      if (!ferResult.rows[0]) {
        return res.status(400).json({ error: 'Batch does not have an active fermentation record' });
      }

      const fermentation = normalizeFermentationRecord(ferResult.rows[0]);
      const currentBoxes = type === 'bad' ? fermentation.bad_box_ids : fermentation.good_box_ids;
      if (!currentBoxes.length) {
        return res.status(400).json({ error: `${type === 'bad' ? 'Bad' : 'Good'} beans are not currently assigned to any box` });
      }
      if (!currentBoxes.includes(from)) {
        return res.status(400).json({ error: `${type === 'bad' ? 'Bad' : 'Good'} beans are not currently in ${from}` });
      }
      activeRecords = [fermentation];
    }

    const occupied = await pool.query(
      'SELECT batch_id, box_id, good_box_id, bad_box_id FROM fermentation WHERE status = $1',
      ['active']
    );
    const occupancy = buildActiveBoxMap(occupied.rows);
    const targetOccupants = new Set((occupancy[to] ? Array.from(occupancy[to]) : []));
    activeRecords.forEach((record) => targetOccupants.add(record.batch_id));
    if (targetOccupants.size > MAX_ACTIVE_BATCHES_PER_BOX) {
      return res.status(409).json({ error: `Target box ${to} already has ${MAX_ACTIVE_BATCHES_PER_BOX} active batches` });
    }

    await pool.query('BEGIN');
    const createdTransfers = [];

    for (const record of activeRecords) {
      const result = await pool.query(
        `INSERT INTO transfers (batch_id, bean_type, from_box, to_box, transfer_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [record.batch_id, type, from, to, transfer_date]
      );
      createdTransfers.push(result.rows[0]);

      const nextGoodBoxes = type === 'good'
        ? replaceBox(record.good_box_ids, from, to)
        : record.good_box_ids;
      const nextBadBoxes = type === 'bad'
        ? replaceBox(record.bad_box_ids, from, to)
        : record.bad_box_ids;
      const primaryBox = joinBoxes(nextGoodBoxes.length ? nextGoodBoxes : nextBadBoxes);

      await pool.query(
        `UPDATE fermentation
         SET box_id = $1, good_box_id = $2, bad_box_id = $3
         WHERE batch_id = $4 AND status = $5`,
        [primaryBox, joinBoxes(nextGoodBoxes), joinBoxes(nextBadBoxes), record.batch_id, 'active']
      );
    }
    await pool.query('COMMIT');

    for (const record of activeRecords) {
      const refreshedResult = await pool.query(
        'SELECT * FROM fermentation WHERE batch_id = $1 AND status = $2',
        [record.batch_id, 'active']
      );
      const refreshed = normalizeFermentationRecord(refreshedResult.rows[0]);
      const transferCountResult = await pool.query(
        'SELECT COUNT(*)::int AS transfer_count FROM transfers WHERE batch_id = $1',
        [record.batch_id]
      );

      await syncBatchStage(pool, record.batch_id, {
        stage: 'Transfer',
        transfer_count: transferCountResult.rows[0]?.transfer_count || 0,
        transfer_bean_type: type,
        from_box: from,
        to_box: to,
        transfer_date,
        fermentation_good_boxes: refreshed.good_box_ids,
        fermentation_bad_boxes: refreshed.bad_box_ids,
        fermentation_start_date: refreshed.start_date,
        fermentation_end_date: refreshed.end_date,
        status: refreshed.status,
      });
    }

    res.status(201).json({
      message: scope === 'box'
        ? `Transferred ${activeRecords.length} batch(es) from ${from} to ${to}`
        : 'Transfer recorded',
      transfers: createdTransfers,
      moved_batches: activeRecords.length,
    });
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
