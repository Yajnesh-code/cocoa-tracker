const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTableHtml(title, rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const headers = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const body = rows.length
    ? rows
      .map(
        (row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`
      )
      .join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}">No records found</td></tr>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #1a2e1a; }
          h1 { color: #1b4332; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; font-size: 13px; }
          th, td { border: 1px solid #d8e8d8; padding: 8px; text-align: left; }
          th { background: #2d6a4f; color: #fff; }
          tr:nth-child(even) td { background: #f8faf8; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead><tr>${headers || '<th>Details</th>'}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>
  `;
}

const cocoaReports = {
  batch: {
    title: 'Cocoa Processing Batch Report',
    query: `SELECT batch_code, weight_kg, moisture_pct, created_at
            FROM cocoa_processing_batches
            ORDER BY created_at DESC`,
  },
  roasting: {
    title: 'Roasting Report',
    query: `SELECT cpb.batch_code, crl.roast_lot_number, crl.quantity_roasted_kg, crl.weight_after_roasting_kg, crl.moisture_after_roasting_pct, crl.created_at
            FROM cocoa_roast_lots crl
            JOIN cocoa_processing_batches cpb ON cpb.id = crl.cocoa_batch_id
            ORDER BY crl.created_at DESC`,
  },
  winnowing: {
    title: 'Winnowing Report',
    query: `SELECT cpb.batch_code, cw.weight_before_kg, cw.weight_after_kg, cw.created_at
            FROM cocoa_winnowing cw
            JOIN cocoa_processing_batches cpb ON cpb.id = cw.cocoa_batch_id
            ORDER BY cw.created_at DESC`,
  },
  cleaning: {
    title: 'Cleaning Report',
    query: `SELECT cpb.batch_code, ccn.weight_before_kg, ccn.weight_after_kg, ccn.workers_involved, ccn.remarks, ccn.created_at
            FROM cocoa_cleaning_nibs ccn
            JOIN cocoa_processing_batches cpb ON cpb.id = ccn.cocoa_batch_id
            ORDER BY ccn.created_at DESC`,
  },
  nibs_packing: {
    title: 'Nibs Packing Report',
    query: `SELECT cpb.batch_code, cnp.total_nibs_weight_kg, cnp.number_of_bags, cnp.completed_at
            FROM cocoa_nibs_packing cnp
            JOIN cocoa_processing_batches cpb ON cpb.id = cnp.cocoa_batch_id
            ORDER BY cnp.completed_at DESC`,
  },
  inventory: {
    title: 'Nibs Inventory Report',
    query: `SELECT batch_code, available_nibs_stock_kg, status, updated_at
            FROM nibs_inventory
            ORDER BY updated_at DESC`,
  },
};

const chocolateReports = {
  grinding_conching: {
    title: 'Grinding & Conching Report',
    query: `SELECT cgc.production_batch_number, cgc.source_batch_code, rm.recipe_name, cgc.nibs_quantity_used_kg, cgc.remaining_nibs_stock_kg, cgc.start_time, cgc.end_time, cgc.power_failure, cgc.status
            FROM chocolate_grinding_conching cgc
            LEFT JOIN recipe_master rm ON rm.id = cgc.recipe_id
            ORDER BY cgc.created_at DESC`,
  },
  couverture_packing: {
    title: 'Couverture Packing Report',
    query: `SELECT cgc.production_batch_number, ccp.number_of_couverture_packs, ccp.total_weight_g, ccp.created_at
            FROM chocolate_couverture_packing ccp
            JOIN chocolate_grinding_conching cgc ON cgc.id = ccp.production_batch_id
            ORDER BY ccp.created_at DESC`,
  },
  melting: {
    title: 'Melting Report',
    query: `SELECT cgc.production_batch_number, cm.number_of_couverture_packs_used, cm.melting_temperature_c, cm.created_at
            FROM chocolate_melting cm
            JOIN chocolate_grinding_conching cgc ON cgc.id = cm.production_batch_id
            ORDER BY cm.created_at DESC`,
  },
  tempering: {
    title: 'Tempering Report',
    query: `SELECT cgc.production_batch_number, ct.tempering_temperature_c, ct.remarks, ct.created_at
            FROM chocolate_tempering ct
            JOIN chocolate_grinding_conching cgc ON cgc.id = ct.production_batch_id
            ORDER BY ct.created_at DESC`,
  },
  moulding: {
    title: 'Moulding Report',
    query: `SELECT cgc.production_batch_number, cmw.weight_before_moulding_kg, cmw.weight_after_moulding_kg, cmw.created_at
            FROM chocolate_moulding_weighing cmw
            JOIN chocolate_grinding_conching cgc ON cgc.id = cmw.production_batch_id
            ORDER BY cmw.created_at DESC`,
  },
  packing: {
    title: 'Packing Report',
    query: `SELECT cgc.production_batch_number, cp.total_chocolate_weight_kg, cp.packed_bars, cp.created_at
            FROM chocolate_packing cp
            JOIN chocolate_grinding_conching cgc ON cgc.id = cp.production_batch_id
            ORDER BY cp.created_at DESC`,
  },
  sample_retention: {
    title: 'Sample Retention Report',
    query: `SELECT cgc.production_batch_number, csr.sample_saved, csr.sample_weight_kg, csr.finished_at
            FROM chocolate_sample_retention csr
            JOIN chocolate_grinding_conching cgc ON cgc.id = csr.production_batch_id
            ORDER BY csr.finished_at DESC`,
  },
};

router.get('/list', auth, async (req, res) => {
  res.json({
    cocoa_processing: Object.keys(cocoaReports),
    chocolate_production: Object.keys(chocolateReports),
    supported_formats: ['json', 'excel', 'pdf'],
  });
});

router.get('/:module/:report', auth, async (req, res) => {
  const moduleName = String(req.params.module || '').trim().toLowerCase();
  const reportName = String(req.params.report || '').trim().toLowerCase();
  const format = String(req.query.format || 'json').trim().toLowerCase();

  const source = moduleName === 'cocoa' ? cocoaReports : moduleName === 'chocolate' ? chocolateReports : null;
  if (!source) return res.status(404).json({ error: 'Invalid module. Use cocoa or chocolate.' });

  const report = source[reportName];
  if (!report) return res.status(404).json({ error: 'Invalid report type' });

  try {
    const result = await pool.query(report.query);
    const rows = result.rows;

    if (format === 'json') {
      return res.json({ report: reportName, module: moduleName, rows });
    }

    const html = buildTableHtml(report.title, rows);

    if (format === 'excel') {
      const filename = `${moduleName}-${reportName}-report.xls`;
      res.set('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(html);
    }

    if (format === 'pdf') {
      const filename = `${moduleName}-${reportName}-report.html`;
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(html);
    }

    return res.status(400).json({ error: 'Unsupported format. Use json, excel, or pdf.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
