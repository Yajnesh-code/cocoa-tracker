import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const formatDate = (value) => (value ? String(value).slice(0, 10) : 'Not recorded');
const formatNum = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : value || 'Not recorded';
};

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

function formatWorkerEntries(workers) {
  if (!Array.isArray(workers) || workers.length === 0) return 'Not recorded';
  return workers
    .map((worker) => {
      if (typeof worker === 'string') return worker;
      return `${worker.worker_name || 'Worker'}${worker.cleaned_nibs_kg != null ? ` (${formatNum(worker.cleaned_nibs_kg)} kg)` : ''}`;
    })
    .join(', ');
}

function StepState({ done, label }) {
  return <span className={`badge ${done ? 'badge-completed' : 'badge-pending'}`}>{label}</span>;
}

export default function ProcessingBatchTracking() {
  const [batchCode, setBatchCode] = useState('');
  const [allBatches, setAllBatches] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  const loadList = async () => {
    setListLoading(true);
    try {
      const res = await api.get('/processing-trace');
      setAllBatches(res.data || []);
    } catch (err) {
      setError(normalizeError(err, 'Failed to load batch tracking list'));
    } finally {
      setListLoading(false);
    }
  };

  const loadTrace = async (targetBatchCode) => {
    const normalizedBatchCode = String(targetBatchCode || '').toUpperCase();
    if (!normalizedBatchCode) return;

    setError('');
    setData(null);
    setLoading(true);
    try {
      const res = await api.get(`/processing-trace/${normalizedBatchCode}`);
      setData(res.data);
      setBatchCode(normalizedBatchCode);
    } catch (err) {
      setError(normalizeError(err, 'Batch trace not found'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const filteredBatches = useMemo(() => {
    const search = String(batchCode || '').trim().toUpperCase();
    if (!search) return allBatches;
    return allBatches.filter((item) => String(item.batch_code || '').includes(search));
  }, [allBatches, batchCode]);

  const search = async (e) => {
    e.preventDefault();
    await loadTrace(batchCode);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Batch Tracking</h1>
        <p>View all cocoa batches, check whether they are still in progress or completed, and open full traceability for any batch.</p>
      </div>

      <div className="card">
        <form onSubmit={search}>
          <div className="form-group">
            <label>Batch Code</label>
            <input value={batchCode} onChange={(e) => setBatchCode(e.target.value.toUpperCase())} placeholder="Example: B001" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !batchCode}>
            {loading ? 'Searching...' : 'Open Batch Trace'}
          </button>
        </form>
        {error ? <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div> : null}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2>All Cocoa Processing Batches</h2>
          <p>Use this list to trace incomplete or completed batches at any time.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch Code</th>
                <th>Weight</th>
                <th>Roasting</th>
                <th>Winnowing</th>
                <th>Cleaning</th>
                <th>Nibs Packing</th>
                <th>Chocolate Runs</th>
                <th>Inventory</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={9} style={{ color: 'var(--text-muted)' }}>Loading batch list...</td></tr>
              ) : filteredBatches.length === 0 ? (
                <tr><td colSpan={9} style={{ color: 'var(--text-muted)' }}>No batches found</td></tr>
              ) : filteredBatches.map((item) => (
                <tr key={item.batch_code}>
                  <td><strong>{item.batch_code}</strong></td>
                  <td>{formatNum(item.weight_kg)} kg</td>
                  <td>{item.roast_lot_count || 0} lots / {formatNum(item.total_roasted_kg)} kg</td>
                  <td><StepState done={Boolean(item.has_winnowing)} label={item.has_winnowing ? 'Done' : 'Pending'} /></td>
                  <td><StepState done={Boolean(item.has_cleaning_nibs)} label={item.has_cleaning_nibs ? 'Done' : 'Pending'} /></td>
                  <td><StepState done={Boolean(item.has_nibs_packing)} label={item.has_nibs_packing ? 'Done' : 'Pending'} /></td>
                  <td>{item.chocolate_completed_run_count || 0}/{item.chocolate_run_count || 0} completed</td>
                  <td>{item.inventory_status || 'Not recorded'}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" type="button" onClick={() => loadTrace(item.batch_code)}>
                      View Trace
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data ? (
        <div className="card">
          <h2>Traceability Flow - {data.batch_code}</h2>
          <div className="timeline" style={{ marginTop: 16 }}>
            <div className="timeline-item">
              <h4>Beans Arrival</h4>
              <p>Total Weight: {formatNum(data.beans_arrival.weight_kg)} kg</p>
              <p>
                Bags: {Array.isArray(data.beans_arrival.bag_details) ? data.beans_arrival.bag_details.length : 0}
                {Array.isArray(data.beans_arrival.bag_details) && data.beans_arrival.bag_details.length > 0
                  ? ` | ${data.beans_arrival.bag_details.map((bag) => `${bag.bag_label}: ${formatNum(bag.weight_kg)} kg @ ${formatNum(bag.moisture_pct)}%`).join(' ; ')}`
                  : ''}
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
                Status: <StepState done={Boolean(data.winnowing)} label={data.winnowing ? 'Recorded' : 'Pending'} />
              </p>
              <p>
                Before: {data.winnowing ? `${formatNum(data.winnowing.weight_before_kg)} kg` : 'Not recorded'}
                {' | '}
                After: {data.winnowing ? `${formatNum(data.winnowing.weight_after_kg)} kg` : 'Not recorded'}
              </p>
            </div>

            <div className="timeline-item">
              <h4>Cleaning Nibs</h4>
              <p>
                Status: <StepState done={Boolean(data.cleaning_nibs)} label={data.cleaning_nibs ? 'Recorded' : 'Pending'} />
              </p>
              <p>
                Before: {data.cleaning_nibs ? `${formatNum(data.cleaning_nibs.weight_before_kg)} kg` : 'Not recorded'}
                {' | '}
                After: {data.cleaning_nibs ? `${formatNum(data.cleaning_nibs.weight_after_kg)} kg` : 'Not recorded'}
              </p>
              <p>
                Workers: {formatWorkerEntries(data.cleaning_nibs?.workers_involved)}
                {' | '}
                Remarks: {data.cleaning_nibs?.remarks || 'Not recorded'}
              </p>
            </div>

            <div className="timeline-item">
              <h4>Nibs Packing</h4>
              <p>
                Status: <StepState done={Boolean(data.nibs_packing)} label={data.nibs_packing ? 'Recorded' : 'Pending'} />
              </p>
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
                <div key={run.id} style={{ marginBottom: 14 }}>
                  <p>
                    <strong>{run.production_batch_number}</strong>
                    {' | '}Recipe: {run.recipe_name || 'N/A'}
                    {' | '}Used {formatNum(run.nibs_quantity_used_kg)} kg
                    {' | '}Status: {run.status}
                  </p>
                  <p>
                    <StepState done={true} label="Grinding" />
                    {' '}
                    <StepState done={Boolean(run.has_couverture_packing)} label="Couverture" />
                    {' '}
                    <StepState done={Boolean(run.has_tempering)} label="Tempering" />
                    {' '}
                    <StepState done={Boolean(run.has_moulding_weighing)} label="Moulding" />
                    {' '}
                    <StepState done={Boolean(run.has_demoulding)} label="De-Moulding" />
                    {' '}
                    <StepState done={Boolean(run.has_packing)} label="Packing" />
                    {' '}
                    <StepState done={Boolean(run.has_sample_retention)} label="Sample" />
                  </p>
                  <p>
                    Couverture Packs: {run.number_of_couverture_packs || 'Not recorded'}
                    {' | '}Tempering: {run.tempering_temperature_c != null ? `${formatNum(run.tempering_temperature_c)} C` : 'Not recorded'}
                    {' | '}Packed Bars: {run.packed_bars || 0}
                    {' | '}Sample Saved: {run.sample_saved ? 'Yes' : 'No'}
                  </p>
                </div>
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
