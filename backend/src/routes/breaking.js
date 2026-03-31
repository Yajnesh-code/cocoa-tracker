const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// GET breaking record by batch
router.get('/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM breaking WHERE batch_id = $1', [req.params.batch_id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Breaking record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record breaking stage
router.post('/', auth, async (req, res) => {
  const { batch_id, breaking_date, buckets, good_weight, bad_weight } = req.body;
  if (!batch_id || !breaking_date)
    return res.status(400).json({ error: 'batch_id and breaking_date are required' });

  let bucketRows = [];
  if (Array.isArray(buckets)) {
    bucketRows = buckets.map(bucket => {
      const grossWeight = bucket.weight !== undefined && bucket.weight !== null && bucket.weight !== ''
        ? Number(bucket.weight)
        : null;
      const tareWeight = bucket.bucket_weight !== undefined && bucket.bucket_weight !== null && bucket.bucket_weight !== ''
        ? Number(bucket.bucket_weight)
        : 0;
      const netWeight = grossWeight != null ? grossWeight - tareWeight : null;

      if (bucket.type === 'good') {
        return {
          type: 'good',
          gross_weight: grossWeight,
          bucket_weight: tareWeight,
          good_weight: netWeight,
          bad_weight: null,
        };
      }
      if (bucket.type === 'bad') {
        return {
          type: 'bad',
          gross_weight: grossWeight,
          bucket_weight: tareWeight,
          good_weight: null,
          bad_weight: netWeight,
        };
      }
      return {
        type: bucket.type || null,
        gross_weight: grossWeight,
        bucket_weight: tareWeight,
        good_weight: bucket.good_weight !== undefined && bucket.good_weight !== null && bucket.good_weight !== ''
          ? Number(bucket.good_weight)
          : null,
        bad_weight: bucket.bad_weight !== undefined && bucket.bad_weight !== null && bucket.bad_weight !== ''
          ? Number(bucket.bad_weight)
          : null,
      };
    }).filter(row => row.good_weight != null || row.bad_weight != null);
  } else if (good_weight !== undefined || bad_weight !== undefined) {
    bucketRows = [{ good_weight, bad_weight }];
  }

  if (bucketRows.length === 0)
    return res.status(400).json({ error: 'Please provide at least one bucket with good_weight or bad_weight' });

  if (bucketRows.some(row =>
    (row.gross_weight != null && Number.isNaN(Number(row.gross_weight))) ||
    (row.bucket_weight != null && Number.isNaN(Number(row.bucket_weight))) ||
    (row.good_weight != null && Number.isNaN(Number(row.good_weight))) ||
    (row.bad_weight != null && Number.isNaN(Number(row.bad_weight)))
  )) {
    return res.status(400).json({ error: 'Invalid bucket weight values' });
  }

  if (bucketRows.some(row =>
    row.gross_weight != null && row.gross_weight <= 0
  )) {
    return res.status(400).json({ error: 'Bucket gross weight must be greater than zero' });
  }

  if (bucketRows.some(row =>
    row.bucket_weight != null && row.bucket_weight < 0
  )) {
    return res.status(400).json({ error: 'Bucket weight cannot be negative' });
  }

  if (bucketRows.some(row =>
    row.good_weight != null && row.good_weight < 0
  ) || bucketRows.some(row =>
    row.bad_weight != null && row.bad_weight < 0
  )) {
    return res.status(400).json({ error: 'Bucket weight cannot be greater than gross weight' });
  }

  const goodWeight = bucketRows.reduce((sum, row) => sum + (row.good_weight || 0), 0);
  const badWeight = bucketRows.reduce((sum, row) => sum + (row.bad_weight || 0), 0);
  const wet_weight = goodWeight + badWeight;
  const bag_count = 0;
  const bucket_details = JSON.stringify(bucketRows);

  try {
    const result = await pool.query(
      `INSERT INTO breaking (batch_id, wet_weight, bag_count, good_weight, bad_weight, breaking_date, bucket_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (batch_id) DO UPDATE
         SET wet_weight=$2, bag_count=$3, good_weight=$4, bad_weight=$5, breaking_date=$6, bucket_details=$7
       RETURNING *`,
      [batch_id, wet_weight, bag_count, goodWeight, badWeight, breaking_date, bucket_details]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
