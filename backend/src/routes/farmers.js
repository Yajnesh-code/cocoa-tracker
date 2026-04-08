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

function buildFarmerBatchSheet(rows) {
  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.farmer_id]) {
      acc[row.farmer_id] = {
        farmer_code: row.farmer_code,
        farmer_name: row.farmer_name,
        location: row.location,
        batches: [],
      };
    }
    if (row.batch_id) acc[row.farmer_id].batches.push(row);
    return acc;
  }, {});

  const sections = Object.values(grouped).map((group) => {
    const totalWeight = group.batches.reduce(
      (sum, item) => sum + Number(item.pod_weight || 0) + Number(item.bad_pod_weight || 0),
      0
    );
    const farmerWeight = group.batches.reduce(
      (sum, item) => sum + Number(item.farmer_pod_weight || 0) + Number(item.farmer_bad_pod_weight || 0),
      0
    );

    return `
      <div class="section">
        <div class="section-title">${escapeHtml(group.farmer_code)} - ${escapeHtml(group.farmer_name)}</div>
        <div class="section-meta">
          Location: ${escapeHtml(group.location)} | Total batches: ${group.batches.length} | Farmer recorded: ${formatWeight(farmerWeight)} kg | Company recorded: ${formatWeight(totalWeight)} kg
        </div>
        <table>
          <thead>
            <tr>
              <th>Batch Code</th>
              <th>Pod Date</th>
              <th>Farmer Good (kg)</th>
              <th>Farmer Bad (kg)</th>
              <th>Farmer Total (kg)</th>
              <th>Company Good (kg)</th>
              <th>Company Bad (kg)</th>
              <th>Company Total (kg)</th>
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
            ${group.batches.length === 0 ? `
              <tr><td colspan="13" class="empty">No batches found for this farmer</td></tr>
            ` : group.batches.map((row) => `
              <tr>
                <td>${escapeHtml(row.batch_code)}</td>
                <td>${escapeHtml(formatDate(row.pod_date))}</td>
                <td>${escapeHtml(formatWeight(row.farmer_pod_weight))}</td>
                <td>${escapeHtml(formatWeight(row.farmer_bad_pod_weight))}</td>
                <td>${escapeHtml(formatWeight(Number(row.farmer_pod_weight || 0) + Number(row.farmer_bad_pod_weight || 0)))}</td>
                <td>${escapeHtml(formatWeight(row.pod_weight))}</td>
                <td>${escapeHtml(formatWeight(row.bad_pod_weight))}</td>
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
          body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #1f2937; }
          h1 { color: #1b4332; margin: 0 0 6px; }
          .subtitle { color: #5a7a5a; margin-bottom: 18px; }
          .section { margin-top: 22px; }
          .section-title {
            font-size: 16px; font-weight: 700; color: #1b4332;
            background: #e8f3ec; padding: 10px 12px;
            border: 1px solid #cfe3d4; border-bottom: none;
          }
          .section-meta {
            padding: 10px 12px; border: 1px solid #cfe3d4; border-top: none;
            background: #f6fbf7; font-size: 13px; color: #486257;
          }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #d8e8d8; padding: 8px 10px; text-align: left; vertical-align: top; }
          th { background: #2d6a4f; color: #fff; white-space: nowrap; }
          .empty { color: #6b7280; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>Selected Farmer Batch Detail Report</h1>
        <div class="subtitle">Single-sheet export containing only the selected farmers and their batch records.</div>
        ${sections || '<div class="empty">No farmer records found.</div>'}
      </body>
    </html>
  `;
}

// GET selected farmers batch export
router.get('/export/details', auth, async (req, res) => {
  const farmerIds = String(req.query.farmer_ids || '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (farmerIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one farmer' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        f.id AS farmer_id,
        f.farmer_code,
        f.name AS farmer_name,
        f.location,
        b.id AS batch_id,
        b.batch_code,
        b.pod_date,
        b.farmer_pod_weight,
        b.farmer_bad_pod_weight,
        b.pod_weight,
        b.bad_pod_weight,
        br.breaking_date,
        br.wet_weight,
        dry.shelf_id,
        pack.packing_date,
        pack.final_weight,
        CASE WHEN pack.id IS NOT NULL THEN true ELSE false END AS packed,
        COALESCE(fer.boxes, '') AS fermentation_boxes,
        COALESCE(tr.transfer_count, 0) AS transfer_count
      FROM farmers f
      LEFT JOIN batches b ON b.farmer_id = f.id
      LEFT JOIN breaking br ON br.batch_id = b.id
      LEFT JOIN drying dry ON dry.batch_id = b.id
      LEFT JOIN packing pack ON pack.batch_id = b.id
      LEFT JOIN (
        SELECT batch_id, STRING_AGG(DISTINCT box_name, ', ' ORDER BY box_name) AS boxes
        FROM (
          SELECT batch_id, BTRIM(UNNEST(string_to_array(COALESCE(good_box_id, bad_box_id, box_id), ','))) AS box_name
          FROM fermentation
        ) fer_boxes
        WHERE box_name IS NOT NULL
          AND box_name <> ''
        GROUP BY batch_id
      ) fer ON fer.batch_id = b.id
      LEFT JOIN (
        SELECT batch_id, COUNT(*)::int AS transfer_count
        FROM transfers
        GROUP BY batch_id
      ) tr ON tr.batch_id = b.id
      WHERE f.id = ANY($1::int[])
      ORDER BY f.name ASC, b.pod_date DESC NULLS LAST, b.created_at DESC NULLS LAST
      `,
      [farmerIds]
    );

    const report = buildFarmerBatchSheet(result.rows);
    res.set('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="selected-farmers-batch-report.xls"');
    res.send(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all farmers
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM farmers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single farmer
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM farmers WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Farmer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create farmer
router.post('/', auth, async (req, res) => {
  const { farmer_code, name, location } = req.body;
  if (!farmer_code || !name || !location)
    return res.status(400).json({ error: 'farmer_code, name, and location are required' });

  try {
    const result = await pool.query(
      'INSERT INTO farmers (farmer_code, name, location) VALUES ($1, $2, $3) RETURNING *',
      [farmer_code, name, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Farmer code already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
