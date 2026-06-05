import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

export default function CocoaProcessing() {
  const [batches, setBatches] = useState([]);
  const [sourceBatches, setSourceBatches] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [roastLots, setRoastLots] = useState([]);
  const [roastingBatchLots, setRoastingBatchLots] = useState([]);
  const [selectedBatchCodeForRoast, setSelectedBatchCodeForRoast] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');

  const [beansArrival, setBeansArrival] = useState({ batch_code: '', weight_kg: '', moisture_pct: '' });
  const [roasting, setRoasting] = useState({
    batch_code: '',
    roast_lot_number: '',
    quantity_roasted_kg: '',
    weight_after_roasting_kg: '',
    moisture_after_roasting_pct: '',
  });
  const [winnowing, setWinnowing] = useState({ batch_code: '', weight_before_kg: '', weight_after_kg: '' });
  const [cleaning, setCleaning] = useState({
    batch_code: '',
    weight_before_kg: '',
    weight_after_kg: '',
    selected_worker: '',
    workers_involved: [],
    remarks: '',
  });
  const [nibsPacking, setNibsPacking] = useState({
    batch_code: '',
    total_nibs_weight_kg: '',
    number_of_bags: '',
  });

  const refresh = async () => {
    try {
      const [sourceBatchesRes, batchesRes, workersRes, inventoryRes] = await Promise.all([
        api.get('/batches'),
        api.get('/cocoa-processing/batches'),
        api.get('/cocoa-processing/workers'),
        api.get('/cocoa-processing/inventory'),
      ]);
      setSourceBatches(sourceBatchesRes.data || []);
      setBatches(batchesRes.data);
      setWorkers(workersRes.data || []);
      setInventory(inventoryRes.data);
    } catch (err) {
      setError(normalizeError(err, 'Failed to load cocoa processing data'));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selectedBatchCodeForRoast) {
      setRoastLots([]);
      return;
    }
    api.get(`/cocoa-processing/roast-lots/${selectedBatchCodeForRoast}`)
      .then((res) => setRoastLots(res.data))
      .catch(() => setRoastLots([]));
  }, [selectedBatchCodeForRoast]);

  useEffect(() => {
    const batchCode = String(roasting.batch_code || '').toUpperCase();
    if (!batchCode) {
      setRoastingBatchLots([]);
      setRoasting((current) => ({ ...current, roast_lot_number: '' }));
      return;
    }

    api.get(`/cocoa-processing/roast-lots/${batchCode}`)
      .then((res) => {
        const lots = res.data || [];
        setRoastingBatchLots(lots);
        setRoasting((current) => ({
          ...current,
          roast_lot_number: `LOT-${String(lots.length + 1).padStart(3, '0')}`,
        }));
      })
      .catch(() => {
        setRoastingBatchLots([]);
        setRoasting((current) => ({ ...current, roast_lot_number: 'LOT-001' }));
      });
  }, [roasting.batch_code]);

  const batchCodes = useMemo(
    () => Array.from(new Set(batches.map((item) => item.batch_code).filter(Boolean))),
    [batches]
  );

  const sourceBatchCodes = useMemo(
    () => Array.from(new Set(sourceBatches.map((item) => item.batch_code).filter(Boolean))),
    [sourceBatches]
  );

  const addCleaningWorker = () => {
    const selectedWorker = String(cleaning.selected_worker || '').trim();
    if (!selectedWorker || cleaning.workers_involved.includes(selectedWorker)) {
      setCleaning((current) => ({ ...current, selected_worker: '' }));
      return;
    }
    setCleaning((current) => ({
      ...current,
      selected_worker: '',
      workers_involved: [...current.workers_involved, selectedWorker],
    }));
  };

  const removeCleaningWorker = (workerName) => {
    setCleaning((current) => ({
      ...current,
      workers_involved: current.workers_involved.filter((item) => item !== workerName),
    }));
  };

  const saveWorker = async () => {
    const workerName = String(newWorkerName || '').trim();
    if (!workerName) return;

    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/cocoa-processing/workers', { worker_name: workerName });
      setSuccess('Worker name added to the list');
      setNewWorkerName('');
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save worker name'));
    } finally {
      setLoading(false);
    }
  };

  const saveBeansArrival = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await api.post('/cocoa-processing/beans-arrival', {
        ...beansArrival,
        batch_code: String(beansArrival.batch_code || '').toUpperCase(),
      });
      setSuccess('Beans Arrival + Moisture saved');
      const savedBatchCode = String(response.data?.batch_code || beansArrival.batch_code || '').toUpperCase();
      setBeansArrival({ batch_code: '', weight_kg: '', moisture_pct: '' });
      setRoasting((current) => ({ ...current, batch_code: savedBatchCode }));
      setWinnowing((current) => ({ ...current, batch_code: savedBatchCode }));
      setCleaning((current) => ({ ...current, batch_code: savedBatchCode }));
      setNibsPacking((current) => ({ ...current, batch_code: savedBatchCode }));
      setSelectedBatchCodeForRoast(savedBatchCode);
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save beans arrival'));
    } finally {
      setLoading(false);
    }
  };

  const saveRoastLot = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/cocoa-processing/roasting-lots', {
        ...roasting,
        batch_code: String(roasting.batch_code || '').toUpperCase(),
      });
      setSuccess('Roast lot saved');
      setRoasting({
        batch_code: roasting.batch_code,
        roast_lot_number: '',
        quantity_roasted_kg: '',
        weight_after_roasting_kg: '',
        moisture_after_roasting_pct: '',
      });
      setWinnowing((current) => ({ ...current, batch_code: String(roasting.batch_code || '').toUpperCase() }));
      setCleaning((current) => ({ ...current, batch_code: String(roasting.batch_code || '').toUpperCase() }));
      setNibsPacking((current) => ({ ...current, batch_code: String(roasting.batch_code || '').toUpperCase() }));
      setSelectedBatchCodeForRoast(String(roasting.batch_code || '').toUpperCase());
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save roast lot'));
    } finally {
      setLoading(false);
    }
  };

  const saveWinnowing = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await api.post('/cocoa-processing/winnowing', {
        ...winnowing,
        batch_code: String(winnowing.batch_code || '').toUpperCase(),
      });
      setSuccess('Winnowing saved');
      const savedBatchCode = String(response.data?.batch_code || winnowing.batch_code || '').toUpperCase();
      setWinnowing({ batch_code: '', weight_before_kg: '', weight_after_kg: '' });
      setCleaning((current) => ({ ...current, batch_code: savedBatchCode }));
      setNibsPacking((current) => ({ ...current, batch_code: savedBatchCode }));
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save winnowing'));
    } finally {
      setLoading(false);
    }
  };

  const saveCleaning = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const assignedWorkers = cleaning.workers_involved;

      await api.post('/cocoa-processing/cleaning-nibs', {
        batch_code: String(cleaning.batch_code || '').toUpperCase(),
        weight_before_kg: cleaning.weight_before_kg,
        weight_after_kg: cleaning.weight_after_kg,
        workers_involved: assignedWorkers,
        remarks: cleaning.remarks,
      });
      setSuccess('Cleaning Nibs saved');
      setCleaning({
        batch_code: '',
        weight_before_kg: '',
        weight_after_kg: '',
        selected_worker: '',
        workers_involved: [],
        remarks: '',
      });
      setNibsPacking((current) => ({ ...current, batch_code: String(cleaning.batch_code || '').toUpperCase() }));
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save cleaning nibs'));
    } finally {
      setLoading(false);
    }
  };

  const saveNibsPacking = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/cocoa-processing/nibs-packing', {
        ...nibsPacking,
        batch_code: String(nibsPacking.batch_code || '').toUpperCase(),
      });
      setSuccess('Nibs Packing saved and inventory updated');
      setNibsPacking({ batch_code: '', total_nibs_weight_kg: '', number_of_bags: '' });
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save nibs packing'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Cocoa Processing</h1>
        <p>Manage Beans Arrival, Roasting, Winnowing, Cleaning, Nibs Packing, and live inventory in one workflow.</p>
      </div>

      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
        <div className="grid-2">
          <form onSubmit={saveBeansArrival}>
            <h2>Step 1 - Beans Arrival + Moisture</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <select value={beansArrival.batch_code} onChange={(e) => setBeansArrival({ ...beansArrival, batch_code: e.target.value })} required>
                <option value="">Select source batch...</option>
                {sourceBatchCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Weight (kg) *</label>
              <input type="number" step="0.01" value={beansArrival.weight_kg} onChange={(e) => setBeansArrival({ ...beansArrival, weight_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Moisture (%) *</label>
              <input type="number" step="0.01" value={beansArrival.moisture_pct} onChange={(e) => setBeansArrival({ ...beansArrival, moisture_pct: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>

          <form onSubmit={saveRoastLot}>
            <h2>Step 2 - Roasting (Max 10kg per lot)</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <select value={roasting.batch_code} onChange={(e) => setRoasting({ ...roasting, batch_code: e.target.value })} required>
                <option value="">Select processing batch...</option>
                {batchCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Roast Lot Number *</label>
              <input value={roasting.roast_lot_number} readOnly required />
            </div>
            <div className="form-group">
              <label>Quantity Roasted (kg) *</label>
              <input type="number" step="0.01" max="10" value={roasting.quantity_roasted_kg} onChange={(e) => setRoasting({ ...roasting, quantity_roasted_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Weight After Roasting *</label>
              <input type="number" step="0.01" value={roasting.weight_after_roasting_kg} onChange={(e) => setRoasting({ ...roasting, weight_after_roasting_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Moisture After Roasting (%) *</label>
              <input type="number" step="0.01" value={roasting.moisture_after_roasting_pct} onChange={(e) => setRoasting({ ...roasting, moisture_after_roasting_pct: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Add Roast Lot'}</button>
            <div className="compact-help" style={{ marginTop: 8 }}>
              Roast lot number is generated automatically. Existing lots for this batch: {roastingBatchLots.length}
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={saveWinnowing}>
            <h2>Step 3 - Winnowing</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <select value={winnowing.batch_code} onChange={(e) => setWinnowing({ ...winnowing, batch_code: e.target.value })} required>
                <option value="">Select processing batch...</option>
                {batchCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Weight Before Winnowing *</label>
              <input type="number" step="0.01" value={winnowing.weight_before_kg} onChange={(e) => setWinnowing({ ...winnowing, weight_before_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Weight After Winnowing *</label>
              <input type="number" step="0.01" value={winnowing.weight_after_kg} onChange={(e) => setWinnowing({ ...winnowing, weight_after_kg: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>

          <form onSubmit={saveCleaning}>
            <h2>Step 4 - Cleaning Nibs</h2>
            <div className="form-group">
              <label>Add Worker Name</label>
              <div className="fermentation-picker-row">
                <input
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  placeholder="Enter worker name"
                />
                <button className="btn btn-secondary fermentation-picker-button" type="button" onClick={saveWorker} disabled={loading}>
                  Save Name
                </button>
              </div>
              <div className="compact-help">Add a worker name once, then select it below whenever needed.</div>
            </div>
            <div className="form-group">
              <label>Batch Code *</label>
              <select value={cleaning.batch_code} onChange={(e) => setCleaning({ ...cleaning, batch_code: e.target.value })} required>
                <option value="">Select processing batch...</option>
                {batchCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Weight Before Cleaning *</label>
              <input type="number" step="0.01" value={cleaning.weight_before_kg} onChange={(e) => setCleaning({ ...cleaning, weight_before_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Weight After Cleaning *</label>
              <input type="number" step="0.01" value={cleaning.weight_after_kg} onChange={(e) => setCleaning({ ...cleaning, weight_after_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Workers Involved</label>
              <div className="fermentation-picker-row">
                <select value={cleaning.selected_worker} onChange={(e) => setCleaning({ ...cleaning, selected_worker: e.target.value })}>
                  <option value="">Select worker...</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.worker_name}>
                      {worker.worker_name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary fermentation-picker-button" type="button" onClick={addCleaningWorker}>
                  Add Worker
                </button>
              </div>
              {cleaning.workers_involved.length === 0 ? (
                <div className="fermentation-empty-selection">No workers selected yet</div>
              ) : (
                <div className="fermentation-selected-boxes">
                  {cleaning.workers_involved.map((workerName) => (
                    <span key={workerName} className="fermentation-selected-chip fermentation-selected-chip-good">
                      {workerName}
                      <button
                        type="button"
                        onClick={() => removeCleaningWorker(workerName)}
                        className="fermentation-selected-chip-remove"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea value={cleaning.remarks} onChange={(e) => setCleaning({ ...cleaning, remarks: e.target.value })} rows={3} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={saveNibsPacking}>
            <h2>Step 5 - Nibs Packing</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <select value={nibsPacking.batch_code} onChange={(e) => setNibsPacking({ ...nibsPacking, batch_code: e.target.value })} required>
                <option value="">Select processing batch...</option>
                {batchCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Total Nibs Weight (kg) *</label>
              <input type="number" step="0.01" value={nibsPacking.total_nibs_weight_kg} onChange={(e) => setNibsPacking({ ...nibsPacking, total_nibs_weight_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Number Of Bags *</label>
              <input type="number" value={nibsPacking.number_of_bags} onChange={(e) => setNibsPacking({ ...nibsPacking, number_of_bags: e.target.value })} required />
            </div>
            <button className="btn btn-accent" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Complete Batch'}</button>
          </form>

          <div>
            <h2>Roast Lots Lookup</h2>
            <div className="form-group">
              <label>Batch Code</label>
              <select value={selectedBatchCodeForRoast} onChange={(e) => setSelectedBatchCodeForRoast(e.target.value)}>
                <option value="">Select batch...</option>
                {batchCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Qty Roasted</th>
                    <th>Weight After</th>
                    <th>Moisture After</th>
                  </tr>
                </thead>
                <tbody>
                  {roastLots.length === 0 ? (
                    <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No roast lots</td></tr>
                  ) : roastLots.map((lot) => (
                    <tr key={lot.id}>
                      <td>{lot.roast_lot_number}</td>
                      <td>{lot.quantity_roasted_kg}</td>
                      <td>{lot.weight_after_roasting_kg}</td>
                      <td>{lot.moisture_after_roasting_pct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Nibs Inventory</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch Code</th>
                <th>Available Nibs Stock (kg)</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No nib inventory yet</td></tr>
              ) : inventory.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.batch_code}</strong></td>
                  <td>{Number(row.available_nibs_stock_kg || 0).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${row.status === 'Fully Consumed' ? 'badge-pending' : 'badge-active'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{String(row.updated_at || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
