import React, { useState } from 'react';
import api from '../api/axios';

const formatDate = (value) => (value ? String(value).slice(0, 10) : 'Not recorded');
const formatNum = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : value || 'Not recorded';
};

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

export default function ProcessingBatchTracking() {
  const [batchCode, setBatchCode] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    setError('');
    setData(null);
    setLoading(true);
    try {
      const res = await api.get(`/processing-trace/${String(batchCode || '').toUpperCase()}`);
      setData(res.data);
    } catch (err) {
      setError(normalizeError(err, 'Batch trace not found'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Batch Tracking</h1>
        <p>Search by source batch code and view full traceability from beans arrival to chocolate sample retention.</p>
      </div>

      <div className="card">
        <form onSubmit={search}>
          <div className="form-group">
            <label>Batch Code *</label>
            <input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="Example: B001" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {error ? <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div> : null}
      </div>

      {data ? (
        <div className="card">
          <h2>Traceability Flow - {data.batch_code}</h2>
          <div className="timeline" style={{ marginTop: 16 }}>
            <div className="timeline-item">
              <h4>Beans Arrival</h4>
              <p>
                Weight: {formatNum(data.beans_arrival.weight_kg)} kg | Moisture: {formatNum(data.beans_arrival.moisture_pct)}%
              </p>
            </div>

            <div className="timeline-item">
              <h4>Roasting</h4>
              {data.roasting.length === 0 ? (
                <p>No roast lots recorded</p>
              ) : data.roasting.map((lot) => (
                <p key={lot.id}>
                  Lot {lot.roast_lot_number}: Qty {formatNum(lot.quantity_roasted_kg)} kg, After {formatNum(lot.weight_after_roasting_kg)} kg, Moisture {formatNum(lot.moisture_after_roasting_pct)}%
                </p>
              ))}
            </div>

            <div className="timeline-item">
              <h4>Winnowing</h4>
              <p>
                Before: {data.winnowing ? `${formatNum(data.winnowing.weight_before_kg)} kg` : 'Not recorded'}
                {' | '}
                After: {data.winnowing ? `${formatNum(data.winnowing.weight_after_kg)} kg` : 'Not recorded'}
              </p>
            </div>

            <div className="timeline-item">
              <h4>Cleaning Nibs</h4>
              <p>
                Before: {data.cleaning_nibs ? `${formatNum(data.cleaning_nibs.weight_before_kg)} kg` : 'Not recorded'}
                {' | '}
                After: {data.cleaning_nibs ? `${formatNum(data.cleaning_nibs.weight_after_kg)} kg` : 'Not recorded'}
              </p>
              <p>
                Workers: {Array.isArray(data.cleaning_nibs?.workers_involved) ? data.cleaning_nibs.workers_involved.join(', ') || 'Not recorded' : 'Not recorded'}
                {' | '}
                Remarks: {data.cleaning_nibs?.remarks || 'Not recorded'}
              </p>
            </div>

            <div className="timeline-item">
              <h4>Nibs Packing</h4>
              <p>
                Total Nibs: {data.nibs_packing ? `${formatNum(data.nibs_packing.total_nibs_weight_kg)} kg` : 'Not recorded'}
                {' | '}
                Bags: {data.nibs_packing?.number_of_bags || 'Not recorded'}
              </p>
            </div>

            <div className="timeline-item">
              <h4>Inventory</h4>
              <p>
                Remaining Nibs Stock: {formatNum(data.remaining_nibs_inventory_kg)} kg | Status: {data.inventory?.status || 'Not recorded'}
              </p>
            </div>

            <div className="timeline-item">
              <h4>Chocolate Production Runs ({data.chocolate_production_runs.length})</h4>
              {data.chocolate_production_runs.length === 0 ? (
                <p>No chocolate production runs recorded</p>
              ) : data.chocolate_production_runs.map((run) => (
                <p key={run.id}>
                  {run.production_batch_number} | Recipe: {run.recipe_name || 'N/A'} | Used {formatNum(run.nibs_quantity_used_kg)} kg | Packed Bars: {run.packed_bars || 0} | Sample: {run.sample_saved ? 'Yes' : 'No'} | Status: {run.status}
                </p>
              ))}
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
            Last updated view generated on {formatDate(new Date())}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
