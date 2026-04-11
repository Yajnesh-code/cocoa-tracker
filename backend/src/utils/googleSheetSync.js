function formatDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '';
  return Number(numeric.toFixed(2));
}

function formatBoxValue(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }
  return value || '';
}

async function syncToGoogleSheet(payload) {
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) return;

  try {
    await fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Google Sheet sync failed:', error.message);
  }
}

async function getBatchContext(pool, batchId) {
  const result = await pool.query(
    `SELECT
       b.id,
       b.batch_code,
       b.pod_date,
       b.farmer_pod_weight,
       b.farmer_bad_pod_weight,
       b.pod_weight,
       b.bad_pod_weight,
       f.farmer_code,
       f.name AS farmer_name,
       f.location
     FROM batches b
     JOIN farmers f ON b.farmer_id = f.id
     WHERE b.id = $1`,
    [batchId]
  );

  return result.rows[0] || null;
}

async function syncBatchStage(pool, batchId, payload) {
  const batch = await getBatchContext(pool, batchId);
  if (!batch) return;

  await syncToGoogleSheet({
    batch_code: batch.batch_code,
    farmer_code: batch.farmer_code,
    farmer_name: batch.farmer_name,
    location: batch.location,
    pod_date: formatDate(batch.pod_date),
    farmer_good_weight: formatNumber(batch.farmer_pod_weight),
    farmer_bad_weight: formatNumber(batch.farmer_bad_pod_weight),
    company_good_weight: formatNumber(batch.pod_weight),
    company_bad_weight: formatNumber(batch.bad_pod_weight),
    ...payload,
    fermentation_good_boxes: formatBoxValue(payload.fermentation_good_boxes),
    fermentation_bad_boxes: formatBoxValue(payload.fermentation_bad_boxes),
    fermentation_start_date: formatDate(payload.fermentation_start_date),
    fermentation_end_date: formatDate(payload.fermentation_end_date),
    transfer_date: formatDate(payload.transfer_date),
    drying_start_date: formatDate(payload.drying_start_date),
    drying_end_date: formatDate(payload.drying_end_date),
    packing_date: formatDate(payload.packing_date),
  });
}

module.exports = {
  syncToGoogleSheet,
  syncBatchStage,
};
