const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  return value ? String(value).slice(0, 10) : 'Not recorded';
}

function formatWeight(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toFixed(2);
}

function formatMonthLabel(value) {
  if (!value) return 'Unknown Month';
  const [year, month] = String(value).split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[Number(month) - 1] || month} ${year}`;
}

function buildFarmerBatchPrefix(farmerName) {
  const normalized = String(farmerName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

  return (normalized || 'FARMER').slice(0, 8);
}

function parseBatchSequence(batchCode) {
  const match = String(batchCode || '').match(/-(\d{3,})$/);
  return match ? Number(match[1]) : 0;
}

function roundWeight(value) {
  return Number(Number(value).toFixed(2));
}

function normalizeWeightArray(weights) {
  if (!Array.isArray(weights)) return [];
  return weights
    .map((weight) => Number(weight))
    .filter((weight) => !Number.isNaN(weight) && weight > 0);
}

function normalizeBagEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const grossWeight = Number(entry.weight);
        const bagWeight = entry.bag_weight !== undefined && entry.bag_weight !== null && entry.bag_weight !== ''
          ? Number(entry.bag_weight)
          : 0;

        if (Number.isNaN(grossWeight) || grossWeight <= 0) return null;
        if (Number.isNaN(bagWeight) || bagWeight < 0 || bagWeight >= grossWeight) return null;

        return {
          weight: roundWeight(grossWeight),
          bag_weight: roundWeight(bagWeight),
          net_weight: roundWeight(grossWeight - bagWeight),
        };
      }

      const grossWeight = Number(entry);
      if (Number.isNaN(grossWeight) || grossWeight <= 0) return null;
      return {
        weight: roundWeight(grossWeight),
        bag_weight: 0,
        net_weight: roundWeight(grossWeight),
      };
    })
    .filter(Boolean);
}

function buildMonthlyBatchReport(rows, selectedMonth) {
  const groups = rows.reduce((acc, row) => {
    const monthKey = row.month_key || 'unknown';
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(row);
    return acc;
  }, {});

  const orderedMonths = Object.keys(groups).sort().reverse();

  const sections = orderedMonths.map((monthKey) => {
    const monthRows = groups[monthKey];
    const monthTotalWeight = monthRows.reduce(
      (sum, row) => sum + Number(row.pod_weight || 0) + Number(row.bad_pod_weight || 0),
      0
    );

    return `
      <div class="section">
        <div class="section-title">${escapeHtml(formatMonthLabel(monthKey))}</div>
        <div class="section-meta">
          Total batches: ${monthRows.length} | Total collected weight: ${monthTotalWeight.toFixed(2)} kg
        </div>
        <table>
          <thead>
            <tr>
              <th>Batch Code</th>
              <th>Farmer Code</th>
              <th>Farmer</th>
              <th>Location</th>
              <th>Pod Date</th>
              <th>Good Bags</th>
              <th>Bad Bags</th>
              <th>Total Bags</th>
              <th>Good Weight (kg)</th>
              <th>Bad Weight (kg)</th>
              <th>Total Weight (kg)</th>
              <th>Breaking Date</th>
              <th>Wet Weight (kg)</th>
              <th>Fermentation Boxes</th>
              <th>Transfer Count</th>
              <th>Drying Shelf</th>
              <th>Packing Date</th>
              <th>Final Weight (kg)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${monthRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.batch_code)}</td>
                <td>${escapeHtml(row.farmer_code)}</td>
                <td>${escapeHtml(row.farmer_name)}</td>
                <td>${escapeHtml(row.location)}</td>
                <td>${escapeHtml(formatDate(row.pod_date))}</td>
                <td>${escapeHtml(row.bag_count)}</td>
                <td>${escapeHtml(row.bad_bag_count ?? 0)}</td>
                <td>${escapeHtml(Number(row.bag_count || 0) + Number(row.bad_bag_count || 0))}</td>
                <td>${escapeHtml(formatWeight(row.pod_weight))}</td>
                <td>${escapeHtml(formatWeight(row.bad_pod_weight ?? 0))}</td>
                <td>${escapeHtml(formatWeight(Number(row.pod_weight || 0) + Number(row.bad_pod_weight || 0)))}</td>
                <td>${escapeHtml(formatDate(row.breaking_date))}</td>
                <td>${escapeHtml(formatWeight(row.wet_weight))}</td>
                <td>${escapeHtml(row.fermentation_boxes || 'Not assigned')}</td>
                <td>${escapeHtml(row.transfer_count ?? 0)}</td>
                <td>${escapeHtml(row.shelf_id || 'Not assigned')}</td>
                <td>${escapeHtml(formatDate(row.packing_date))}</td>
                <td>${escapeHtml(formatWeight(row.final_weight))}</td>
                <td>${escapeHtml(row.packed ? 'Done' : 'In Progress')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <meta name="ProgId" content="Excel.Sheet" />
        <style>
          body {
            font-family: Calibri, Arial, sans-serif;
            margin: 24px;
            color: #1f2937;
          }
          h1 {
            color: #1b4332;
            margin: 0 0 6px;
          }
          .subtitle {
            color: #5a7a5a;
            margin-bottom: 18px;
          }
          .section {
            margin-top: 22px;
          }
          .section-title {
            font-size: 16px;
            font-weight: 700;
            color: #1b4332;
            background: #e8f3ec;
            padding: 10px 12px;
            border: 1px solid #cfe3d4;
            border-bottom: none;
          }
          .section-meta {
            padding: 10px 12px;
            border: 1px solid #cfe3d4;
            border-top: none;
            background: #f6fbf7;
            font-size: 13px;
            color: #486257;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border: 1px solid #d8e8d8;
            padding: 8px 10px;
            vertical-align: top;
            text-align: left;
          }
          th {
            background: #2d6a4f;
            color: #fff;
            white-space: nowrap;
          }
          .empty {
            margin-top: 18px;
            padding: 16px;
            border: 1px solid #d8e8d8;
            border-radius: 10px;
            background: #fbfdfb;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <h1>Monthly Batch Detail Report</h1>
        <div class="subtitle">
          ${selectedMonth ? `Filtered month: ${escapeHtml(formatMonthLabel(selectedMonth))}` : 'All months grouped by monthly sheet'}
        </div>
        ${sections || '<div class="empty">No batch records found for the selected month.</div>'}
      </body>
    </html>
  `;
}

// GET all batches
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, f.name AS farmer_name, f.farmer_code, f.location,
        CASE WHEN p.id IS NOT NULL THEN true ELSE false END AS packed
      FROM batches b
      JOIN farmers f ON b.farmer_id = f.id
      LEFT JOIN packing p ON p.batch_id = b.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET monthly Excel-style batch report
router.get('/export/monthly', auth, async (req, res) => {
  const selectedMonth = String(req.query.month || '').trim();
  const hasMonthFilter = /^\d{4}-\d{2}$/.test(selectedMonth);

  try {
    const params = [];
    const whereClause = hasMonthFilter
      ? `WHERE TO_CHAR(b.pod_date, 'YYYY-MM') = $1`
      : '';

    if (hasMonthFilter) params.push(selectedMonth);

    const result = await pool.query(
      `
      SELECT
        b.id,
        b.batch_code,
        b.bag_count,
        b.bad_bag_count,
        b.pod_weight,
        b.bad_pod_weight,
        b.pod_date,
        TO_CHAR(b.pod_date, 'YYYY-MM') AS month_key,
        f.farmer_code,
        f.name AS farmer_name,
        f.location,
        br.breaking_date,
        br.wet_weight,
        dry.shelf_id,
        pack.packing_date,
        pack.final_weight,
        CASE WHEN pack.id IS NOT NULL THEN true ELSE false END AS packed,
        COALESCE(fer.boxes, '') AS fermentation_boxes,
        COALESCE(tr.transfer_count, 0) AS transfer_count
      FROM batches b
      JOIN farmers f ON b.farmer_id = f.id
      LEFT JOIN breaking br ON br.batch_id = b.id
      LEFT JOIN drying dry ON dry.batch_id = b.id
      LEFT JOIN packing pack ON pack.batch_id = b.id
      LEFT JOIN (
        SELECT batch_id, STRING_AGG(box_id, ', ' ORDER BY box_id) AS boxes
        FROM fermentation
        GROUP BY batch_id
      ) fer ON fer.batch_id = b.id
      LEFT JOIN (
        SELECT batch_id, COUNT(*)::int AS transfer_count
        FROM transfers
        GROUP BY batch_id
      ) tr ON tr.batch_id = b.id
      ${whereClause}
      ORDER BY b.pod_date DESC, b.created_at DESC
      `,
      params
    );

    const report = buildMonthlyBatchReport(result.rows, hasMonthFilter ? selectedMonth : '');
    const filename = hasMonthFilter
      ? `batch-monthly-sheet-${selectedMonth}.xls`
      : 'batch-monthly-sheet-all.xls';

    res.set('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single batch
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, f.name AS farmer_name, f.farmer_code, f.location
      FROM batches b
      JOIN farmers f ON b.farmer_id = f.id
      WHERE b.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Batch not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create batch (pod collection)
router.post('/', auth, async (req, res) => {
  const { farmer_id, bag_weights, good_bag_weights, bad_bag_weights, pod_date } = req.body;
  const goodBagEntries = normalizeBagEntries(
    Array.isArray(good_bag_weights) ? good_bag_weights : normalizeWeightArray(bag_weights)
  );
  const badBagEntries = normalizeBagEntries(bad_bag_weights);

  if (!farmer_id || !pod_date)
    return res.status(400).json({ error: 'farmer_id and pod_date are required' });

  if (goodBagEntries.length === 0 && badBagEntries.length === 0)
    return res.status(400).json({ error: 'Add at least one good bag or bad bag weight' });

  const pod_weight = roundWeight(goodBagEntries.reduce((sum, entry) => sum + entry.net_weight, 0));
  const bad_pod_weight = roundWeight(badBagEntries.reduce((sum, entry) => sum + entry.net_weight, 0));
  const bag_count = goodBagEntries.length;
  const bad_bag_count = badBagEntries.length;

  try {
    const farmerResult = await pool.query(
      'SELECT name FROM farmers WHERE id = $1',
      [farmer_id]
    );

    if (!farmerResult.rows[0]) {
      return res.status(404).json({ error: 'Farmer not found' });
    }

    const farmerPrefix = buildFarmerBatchPrefix(farmerResult.rows[0].name);
    const datePart = pod_date.replace(/-/g, '');

    const existingResult = await pool.query(
      'SELECT batch_code FROM batches WHERE pod_date = $1 ORDER BY created_at ASC',
      [pod_date]
    );

    const maxSequence = existingResult.rows.reduce(
      (max, row) => Math.max(max, parseBatchSequence(row.batch_code)),
      0
    );

    const sequence = String(maxSequence + 1).padStart(3, '0');
    const batch_code = `${farmerPrefix}-${datePart}-${sequence}`;

    const result = await pool.query(
      `INSERT INTO batches (batch_code, farmer_id, bag_count, bad_bag_count, pod_weight, bad_pod_weight, pod_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [batch_code, farmer_id, bag_count, bad_bag_count, pod_weight, bad_pod_weight, pod_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE batch only after packing is complete (admin only)
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin only' });

  try {
    const packed = await pool.query('SELECT id FROM packing WHERE batch_id = $1', [req.params.id]);
    if (!packed.rows.length)
      return res.status(400).json({ error: 'Batch must be packed before it can be deleted' });

    const result = await pool.query('DELETE FROM batches WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Batch not found' });

    res.json({ message: 'Batch deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
