const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const QRCode = require('qrcode');

function formatDate(value) {
  return value ? String(value).slice(0, 10) : 'Not recorded';
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderKeyValueRows(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td class="label">${escapeHtml(item.label)}</td>
          <td class="value">${escapeHtml(item.value)}</td>
        </tr>`
    )
    .join('');
}

function renderListRows(items, columns) {
  if (!items.length) {
    return `<tr><td colspan="${columns.length}" class="empty">No records available</td></tr>`;
  }

  return items
    .map(
      (item) => `
        <tr>
          ${columns.map((column) => `<td>${escapeHtml(item[column.key])}</td>`).join('')}
        </tr>`
    )
    .join('');
}

function buildExcelHtmlReport(data, batchId) {
  const { batch, breaking, fermentation, transfers, drying, moisture_logs, packing } = data;
  const logoUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/solemulelogo.png`;
  const overviewRows = [
    { label: 'Batch Code', value: batch.batch_code },
    { label: 'Farmer', value: batch.farmer_name },
    { label: 'Farmer Code', value: batch.farmer_code },
    { label: 'Location', value: batch.location },
    { label: 'Collection Date', value: formatDate(batch.pod_date) },
    { label: 'Good Bag Weight (kg)', value: formatNumber(batch.pod_weight) },
    { label: 'Bad Bag Weight (kg)', value: formatNumber(batch.bad_pod_weight ?? 0) },
    { label: 'Total Collected Weight (kg)', value: formatNumber(Number(batch.pod_weight || 0) + Number(batch.bad_pod_weight || 0)) },
    { label: 'Good Bag Count', value: batch.bag_count },
    { label: 'Bad Bag Count', value: batch.bad_bag_count ?? 0 },
    { label: 'Total Collected Bags', value: Number(batch.bag_count || 0) + Number(batch.bad_bag_count || 0) },
    { label: 'Status', value: packing ? 'Packed' : 'In Progress' },
  ];

  const breakingRows = breaking
    ? [
        { label: 'Breaking Date', value: formatDate(breaking.breaking_date) },
        { label: 'Wet Weight (kg)', value: formatNumber(breaking.wet_weight) },
        { label: 'Bucket Count', value: breaking.bag_count },
        { label: 'Good Bean Weight (kg)', value: formatNumber(breaking.good_weight) },
        { label: 'Bad Bean Weight (kg)', value: formatNumber(breaking.bad_weight) },
      ]
    : [];

  const fermentationRows = fermentation.map((item) => ({
    box: item.box_id,
    start_date: formatDate(item.start_date),
    end_date: formatDate(item.end_date),
    status: item.status,
    good_weight: formatNumber(item.good_weight),
    bad_weight: formatNumber(item.bad_weight),
  }));

  const transferRows = transfers.map((item) => ({
    from_box: item.from_box,
    to_box: item.to_box,
    transfer_date: formatDate(item.transfer_date),
  }));

  const moistureRows = moisture_logs.map((item, index) => ({
    day: `Day ${index + 1}`,
    moisture: `${formatNumber(item.moisture_pct)}%`,
    log_date: formatDate(item.log_date),
  }));

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <meta name="ProgId" content="Excel.Sheet" />
        <meta name="Generator" content="CocoaTrack" />
        <style>
          body {
            font-family: Calibri, Arial, sans-serif;
            margin: 24px;
            color: #1f2937;
          }
          h1 {
            color: #1b4332;
            margin: 0 0 4px;
          }
          .subtitle {
            color: #5a7a5a;
            margin-bottom: 18px;
          }
          .report-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 8px;
          }
          .report-logo {
            width: 68px;
            height: 68px;
            object-fit: contain;
            border: 1px solid #d8e8d8;
            border-radius: 14px;
            padding: 6px;
            background: #ffffff;
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
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 14px;
          }
          th, td {
            border: 1px solid #d8e8d8;
            padding: 8px 10px;
            vertical-align: top;
          }
          th {
            background: #2d6a4f;
            color: #ffffff;
            text-align: left;
          }
          .kv td.label {
            width: 240px;
            font-weight: 700;
            background: #f6fbf7;
          }
          .kv td.value {
            background: #ffffff;
          }
          .empty {
            color: #6b7280;
            font-style: italic;
          }
          .meta {
            margin-top: 18px;
            font-size: 12px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <img src="${escapeHtml(logoUrl)}" alt="Company Logo" class="report-logo" />
          <div>
            <h1>Batch Traceability Report</h1>
            <div class="subtitle">Formatted export for batch ${escapeHtml(batch.batch_code || batchId)}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Batch Overview</div>
          <table class="kv">
            ${renderKeyValueRows(overviewRows)}
          </table>
        </div>

        <div class="section">
          <div class="section-title">Breaking</div>
          <table class="kv">
            ${breaking ? renderKeyValueRows(breakingRows) : '<tr><td class="empty" colspan="2">No breaking record available</td></tr>'}
          </table>
        </div>

        <div class="section">
          <div class="section-title">Fermentation</div>
          <table>
            <thead>
              <tr>
                <th>Box</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderListRows(fermentationRows, [
                { key: 'box' },
                { key: 'start_date' },
                { key: 'end_date' },
                { key: 'status' },
              ])}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Transfers</div>
          <table>
            <thead>
              <tr>
                <th>From Box</th>
                <th>To Box</th>
                <th>Transfer Date</th>
              </tr>
            </thead>
            <tbody>
              ${renderListRows(transferRows, [
                { key: 'from_box' },
                { key: 'to_box' },
                { key: 'transfer_date' },
              ])}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Drying</div>
          <table class="kv">
            ${
              drying
                ? renderKeyValueRows([
                    { label: 'Shelf', value: drying.shelf_id },
                    { label: 'Start Date', value: formatDate(drying.start_date) },
                    { label: 'End Date', value: formatDate(drying.end_date) },
                  ])
                : '<tr><td class="empty" colspan="2">No drying record available</td></tr>'
            }
          </table>
        </div>

        <div class="section">
          <div class="section-title">Moisture Logs</div>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Moisture</th>
                <th>Log Date</th>
              </tr>
            </thead>
            <tbody>
              ${renderListRows(moistureRows, [
                { key: 'day' },
                { key: 'moisture' },
                { key: 'log_date' },
              ])}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Packing</div>
          <table class="kv">
            ${
              packing
                ? renderKeyValueRows([
                    { label: 'Packing Date', value: formatDate(packing.packing_date) },
                    { label: 'Final Weight (kg)', value: formatNumber(packing.final_weight) },
                    { label: 'Bag Count', value: packing.bag_count },
                  ])
                : '<tr><td class="empty" colspan="2">No packing record available</td></tr>'
            }
          </table>
        </div>

        <div class="meta">Generated by CocoaTrack Traceability System</div>
      </body>
    </html>
  `;
}

// GET formatted Excel-friendly summary for a batch
router.get('/:batch_id/export', async (req, res) => {
  const { batch_id } = req.params;

  try {
    const [batch, breaking, fermentation, transfers, drying, moisture, packing] = await Promise.all([
      pool.query(`SELECT b.*, f.farmer_code, f.name AS farmer_name, f.location FROM batches b JOIN farmers f ON b.farmer_id = f.id WHERE b.id = $1`, [batch_id]),
      pool.query('SELECT * FROM breaking WHERE batch_id = $1', [batch_id]),
      pool.query('SELECT * FROM fermentation WHERE batch_id = $1 ORDER BY box_id', [batch_id]),
      pool.query('SELECT * FROM transfers WHERE batch_id = $1 ORDER BY transfer_date', [batch_id]),
      pool.query('SELECT * FROM drying WHERE batch_id = $1', [batch_id]),
      pool.query('SELECT * FROM moisture_logs WHERE batch_id = $1 ORDER BY log_date', [batch_id]),
      pool.query('SELECT * FROM packing WHERE batch_id = $1', [batch_id]),
    ]);

    if (!batch.rows[0]) return res.status(404).json({ error: 'Batch not found' });

    const traceData = {
      batch: batch.rows[0],
      breaking: breaking.rows[0] || null,
      fermentation: fermentation.rows,
      transfers: transfers.rows,
      drying: drying.rows[0] || null,
      moisture_logs: moisture.rows,
      packing: packing.rows[0] || null,
    };

    const report = buildExcelHtmlReport(traceData, batch_id);
    const filename = `batch-${traceData.batch.batch_code || batch_id}-summary.xls`;
    res.set('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET full trace for a batch (public - no auth needed for QR scan)
router.get('/:batch_id', async (req, res) => {
  const { batch_id } = req.params;

  try {
    const [batch, breaking, fermentation, transfers, drying, moisture, packing] = await Promise.all([
      pool.query(`SELECT b.*, f.farmer_code, f.name AS farmer_name, f.location FROM batches b JOIN farmers f ON b.farmer_id = f.id WHERE b.id = $1`, [batch_id]),
      pool.query('SELECT * FROM breaking WHERE batch_id = $1', [batch_id]),
      pool.query('SELECT * FROM fermentation WHERE batch_id = $1 ORDER BY box_id', [batch_id]),
      pool.query('SELECT * FROM transfers WHERE batch_id = $1 ORDER BY transfer_date', [batch_id]),
      pool.query('SELECT * FROM drying WHERE batch_id = $1', [batch_id]),
      pool.query('SELECT * FROM moisture_logs WHERE batch_id = $1 ORDER BY log_date', [batch_id]),
      pool.query('SELECT * FROM packing WHERE batch_id = $1', [batch_id]),
    ]);

    if (!batch.rows[0]) return res.status(404).json({ error: 'Batch not found' });

    const traceData = {
      batch: batch.rows[0],
      breaking: breaking.rows[0] || null,
      fermentation: fermentation.rows,
      transfers: transfers.rows,
      drying: drying.rows[0] || null,
      moisture_logs: moisture.rows,
      packing: packing.rows[0] || null,
    };

    res.json(traceData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET QR code image for a batch
router.get('/:batch_id/qrcode', async (req, res) => {
  const { batch_id } = req.params;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const url = `${baseUrl}/trace/${batch_id}`;

  try {
    const qrBuffer = await QRCode.toBuffer(url, { width: 300, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
