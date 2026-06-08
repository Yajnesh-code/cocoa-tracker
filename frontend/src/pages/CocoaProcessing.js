import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

  const [beansArrival, setBeansArrival] = useState({
    batch_code: '',
    bag_label: '',
    bag_weight_kg: '',
    bag_moisture_pct: '',
    bag_details: [],
  });
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
    selected_worker: '',
    worker_cleaned_kg: '',
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
      setBatches(batchesRes.data || []);
      setWorkers(workersRes.data || []);
      setInventory(inventoryRes.data || []);
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
      .then((res) => setRoastLots(res.data || []))
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

  const beansArrivalTotalWeightKg = useMemo(
    () => beansArrival.bag_details.reduce((sum, bag) => sum + toNumber(bag.weight_kg), 0),
    [beansArrival.bag_details]
  );

  const beansArrivalAverageMoisturePct = useMemo(() => {
    if (beansArrivalTotalWeightKg <= 0) return 0;
    const moistureTotal = beansArrival.bag_details.reduce(
      (sum, bag) => sum + (toNumber(bag.weight_kg) * toNumber(bag.moisture_pct)),
      0
    );
    return Number((moistureTotal / beansArrivalTotalWeightKg).toFixed(2));
  }, [beansArrival.bag_details, beansArrivalTotalWeightKg]);

  const selectedRoastingBatch = useMemo(
    () => batches.find((item) => item.batch_code === String(roasting.batch_code || '').toUpperCase()) || null,
    [batches, roasting.batch_code]
  );

  const remainingToRoastKg = useMemo(() => {
    if (!selectedRoastingBatch) return 0;
    const totalWeight = toNumber(selectedRoastingBatch.weight_kg);
    const totalRoasted = toNumber(selectedRoastingBatch.total_roasted_kg);
    return Number(Math.max(totalWeight - totalRoasted, 0).toFixed(2));
  }, [selectedRoastingBatch]);

  const roastingQuantityMax = remainingToRoastKg > 0
    ? Math.min(10, remainingToRoastKg)
    : 10;

  const cleaningTotalKg = useMemo(
    () => cleaning.workers_involved.reduce((sum, worker) => sum + toNumber(worker.cleaned_nibs_kg), 0),
    [cleaning.workers_involved]
  );

  const addBeansArrivalBag = () => {
    const bagWeightKg = Number(beansArrival.bag_weight_kg);
    const bagMoisturePct = Number(beansArrival.bag_moisture_pct);
    if (!Number.isFinite(bagWeightKg) || !Number.isFinite(bagMoisturePct) || bagWeightKg <= 0) {
      return;
    }

    const nextBagNumber = beansArrival.bag_details.length + 1;
    const bagLabel = String(beansArrival.bag_label || `Bag ${nextBagNumber}`).trim() || `Bag ${nextBagNumber}`;

    setBeansArrival((current) => ({
      ...current,
      bag_label: '',
      bag_weight_kg: '',
      bag_moisture_pct: '',
      bag_details: [
        ...current.bag_details,
        {
          bag_label: bagLabel,
          weight_kg: bagWeightKg,
          moisture_pct: bagMoisturePct,
        },
      ],
    }));
  };

  const removeBeansArrivalBag = (indexToRemove) => {
    setBeansArrival((current) => ({
      ...current,
      bag_details: current.bag_details.filter((_, index) => index !== indexToRemove),
    }));
  };

  const addCleaningWorker = () => {
    const selectedWorker = String(cleaning.selected_worker || '').trim();
    const cleanedNibsKg = Number(cleaning.worker_cleaned_kg);
    if (!selectedWorker || !Number.isFinite(cleanedNibsKg) || cleanedNibsKg <= 0) {
      return;
    }

    setCleaning((current) => ({
      ...current,
      selected_worker: '',
      worker_cleaned_kg: '',
      workers_involved: [
        ...current.workers_involved,
        {
          worker_name: selectedWorker,
          cleaned_nibs_kg: cleanedNibsKg,
        },
      ],
    }));
  };

  const removeCleaningWorker = (indexToRemove) => {
    setCleaning((current) => ({
      ...current,
      workers_involved: current.workers_involved.filter((_, index) => index !== indexToRemove),
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
      const batchCode = String(beansArrival.batch_code || '').toUpperCase();
      const response = await api.post('/cocoa-processing/beans-arrival', {
        batch_code: batchCode,
        bag_details: beansArrival.bag_details,
      });
      setSuccess('Beans Arrival saved with bag-wise totals');
      const savedBatchCode = String(response.data?.batch_code || batchCode).toUpperCase();
      setBeansArrival({
        batch_code: '',
        bag_label: '',
        bag_weight_kg: '',
        bag_moisture_pct: '',
        bag_details: [],
      });
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
      const batchCode = String(roasting.batch_code || '').toUpperCase();
      await api.post('/cocoa-processing/roasting-lots', {
        ...roasting,
        batch_code: batchCode,
      });
      setSuccess('Roasting entry saved');
      setRoasting({
        batch_code: batchCode,
        roast_lot_number: '',
        quantity_roasted_kg: '',
        weight_after_roasting_kg: '',
        moisture_after_roasting_pct: '',
      });
      setWinnowing((current) => ({ ...current, batch_code: batchCode }));
      setCleaning((current) => ({ ...current, batch_code: batchCode }));
      setNibsPacking((current) => ({ ...current, batch_code: batchCode }));
      setSelectedBatchCodeForRoast(batchCode);
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save roasting entry'));
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
      const batchCode = String(cleaning.batch_code || '').toUpperCase();
      await api.post('/cocoa-processing/cleaning-nibs', {
        batch_code: batchCode,
        weight_before_kg: cleaning.weight_before_kg,
        weight_after_kg: cleaningTotalKg,
        workers_involved: cleaning.workers_involved,
        remarks: cleaning.remarks,
      });
      setSuccess('Cleaning Nibs saved with worker totals');
      setCleaning({
        batch_code: '',
        weight_before_kg: '',
        selected_worker: '',
        worker_cleaned_kg: '',
        workers_involved: [],
        remarks: '',
      });
      setNibsPacking((current) => ({ ...current, batch_code: batchCode }));
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
        <p>Use simple bag-wise entry, automatic totals, and worker-wise cleaned nib tracking for a smoother factory workflow.</p>
      </div>

      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
        <div className="grid-2">
          <form onSubmit={saveBeansArrival}>
            <h2>Step 1 - Beans Arrival + Moisture</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <input
                list="source-batch-codes"
                value={beansArrival.batch_code}
                onChange={(e) => setBeansArrival({ ...beansArrival, batch_code: e.target.value.toUpperCase() })}
                placeholder="Select or type batch code"
                required
              />
              <datalist id="source-batch-codes">
                {sourceBatchCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </div>

            <div className="soft-panel" style={{ marginBottom: 16 }}>
              <div className="soft-panel-title">
                <div>
                  <h3>Add Bag</h3>
                  <p>Enter each bag weight and moisture. The system will total everything for you.</p>
                </div>
              </div>
              <div className="form-group">
                <label>Bag Name</label>
                <input
                  value={beansArrival.bag_label}
                  onChange={(e) => setBeansArrival({ ...beansArrival, bag_label: e.target.value })}
                  placeholder={`Bag ${beansArrival.bag_details.length + 1}`}
                />
              </div>
              <div className="form-group">
                <label>Bag Weight (kg) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={beansArrival.bag_weight_kg}
                  onChange={(e) => setBeansArrival({ ...beansArrival, bag_weight_kg: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Bag Moisture (%) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={beansArrival.bag_moisture_pct}
                  onChange={(e) => setBeansArrival({ ...beansArrival, bag_moisture_pct: e.target.value })}
                />
              </div>
              <button className="btn btn-secondary" type="button" onClick={addBeansArrivalBag}>
                Add Bag
              </button>
            </div>

            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Bag</th>
                    <th>Weight (kg)</th>
                    <th>Moisture (%)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {beansArrival.bag_details.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--text-muted)' }}>No bags added yet</td>
                    </tr>
                  ) : (
                    beansArrival.bag_details.map((bag, index) => (
                      <tr key={`${bag.bag_label}-${index}`}>
                        <td>{bag.bag_label}</td>
                        <td>{Number(bag.weight_kg).toFixed(2)}</td>
                        <td>{Number(bag.moisture_pct).toFixed(2)}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => removeBeansArrivalBag(index)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="stat-chip-grid" style={{ marginBottom: 16 }}>
              <div className="stat-chip">
                <div className="stat-chip-label">Bag Count</div>
                <div className="stat-chip-value">{beansArrival.bag_details.length}</div>
              </div>
              <div className="stat-chip">
                <div className="stat-chip-label">Total Weight</div>
                <div className="stat-chip-value">{beansArrivalTotalWeightKg.toFixed(2)} kg</div>
              </div>
              <div className="stat-chip">
                <div className="stat-chip-label">Average Moisture</div>
                <div className="stat-chip-value">{beansArrivalAverageMoisturePct.toFixed(2)}%</div>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading || beansArrival.bag_details.length === 0}>
              {loading ? 'Saving...' : 'Save Beans Arrival'}
            </button>
          </form>

          <form onSubmit={saveRoastLot}>
            <h2>Step 2 - Roasting</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <input
                list="processing-batch-codes"
                value={roasting.batch_code}
                onChange={(e) => setRoasting({ ...roasting, batch_code: e.target.value.toUpperCase() })}
                placeholder="Select or type processing batch"
                required
              />
              <datalist id="processing-batch-codes">
                {batchCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </div>

            <div className="stat-chip-grid" style={{ marginBottom: 16 }}>
              <div className="stat-chip">
                <div className="stat-chip-label">Beans Arrival</div>
                <div className="stat-chip-value">{selectedRoastingBatch ? `${toNumber(selectedRoastingBatch.weight_kg).toFixed(2)} kg` : '0.00 kg'}</div>
              </div>
              <div className="stat-chip">
                <div className="stat-chip-label">Already Roasted</div>
                <div className="stat-chip-value">{selectedRoastingBatch ? `${toNumber(selectedRoastingBatch.total_roasted_kg).toFixed(2)} kg` : '0.00 kg'}</div>
              </div>
              <div className="stat-chip">
                <div className="stat-chip-label">Remaining</div>
                <div className="stat-chip-value">{remainingToRoastKg.toFixed(2)} kg</div>
              </div>
            </div>

            <div className="compact-help" style={{ marginBottom: 12 }}>
              Roasting entry number is created automatically in the background. Staff only need to enter roasting values.
            </div>

            <div className="form-group">
              <label>Quantity Roasted (kg) *</label>
              <input
                type="number"
                step="0.01"
                max={roastingQuantityMax}
                value={roasting.quantity_roasted_kg}
                onChange={(e) => setRoasting({ ...roasting, quantity_roasted_kg: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Weight After Roasting *</label>
              <input
                type="number"
                step="0.01"
                value={roasting.weight_after_roasting_kg}
                onChange={(e) => setRoasting({ ...roasting, weight_after_roasting_kg: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Moisture After Roasting (%) *</label>
              <input
                type="number"
                step="0.01"
                value={roasting.moisture_after_roasting_pct}
                onChange={(e) => setRoasting({ ...roasting, moisture_after_roasting_pct: e.target.value })}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Roasting'}
            </button>
            <div className="compact-help" style={{ marginTop: 8 }}>
              Existing roasting entries for this batch: {roastingBatchLots.length}
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
              <input
                list="processing-batch-codes"
                value={winnowing.batch_code}
                onChange={(e) => setWinnowing({ ...winnowing, batch_code: e.target.value.toUpperCase() })}
                placeholder="Select or type processing batch"
                required
              />
            </div>
            <div className="form-group">
              <label>Weight Before Winnowing *</label>
              <input type="number" step="0.01" value={winnowing.weight_before_kg} onChange={(e) => setWinnowing({ ...winnowing, weight_before_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Weight After Winnowing *</label>
              <input type="number" step="0.01" value={winnowing.weight_after_kg} onChange={(e) => setWinnowing({ ...winnowing, weight_after_kg: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Winnowing'}</button>
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
              <div className="compact-help">Save worker names once, then select them below with cleaned quantity.</div>
            </div>
            <div className="form-group">
              <label>Batch Code *</label>
              <input
                list="processing-batch-codes"
                value={cleaning.batch_code}
                onChange={(e) => setCleaning({ ...cleaning, batch_code: e.target.value.toUpperCase() })}
                placeholder="Select or type processing batch"
                required
              />
            </div>
            <div className="form-group">
              <label>Weight Before Cleaning *</label>
              <input type="number" step="0.01" value={cleaning.weight_before_kg} onChange={(e) => setCleaning({ ...cleaning, weight_before_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Worker</label>
              <select value={cleaning.selected_worker} onChange={(e) => setCleaning({ ...cleaning, selected_worker: e.target.value })}>
                <option value="">Select worker...</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.worker_name}>
                    {worker.worker_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Cleaned Nibs (kg)</label>
              <input
                type="number"
                step="0.01"
                value={cleaning.worker_cleaned_kg}
                onChange={(e) => setCleaning({ ...cleaning, worker_cleaned_kg: e.target.value })}
              />
            </div>
            <button className="btn btn-secondary" type="button" onClick={addCleaningWorker}>
              Add Worker Entry
            </button>

            <div className="table-wrap" style={{ marginTop: 16, marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Cleaned Nibs (kg)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cleaning.workers_involved.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: 'var(--text-muted)' }}>No worker entries yet</td>
                    </tr>
                  ) : (
                    cleaning.workers_involved.map((worker, index) => (
                      <tr key={`${worker.worker_name}-${index}`}>
                        <td>{worker.worker_name}</td>
                        <td>{toNumber(worker.cleaned_nibs_kg).toFixed(2)}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => removeCleaningWorker(index)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="form-group">
              <label>Total Cleaned Nibs (kg)</label>
              <input value={cleaningTotalKg.toFixed(2)} readOnly />
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea value={cleaning.remarks} onChange={(e) => setCleaning({ ...cleaning, remarks: e.target.value })} rows={3} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || cleaning.workers_involved.length === 0}>
              {loading ? 'Saving...' : 'Save Cleaning Nibs'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={saveNibsPacking}>
            <h2>Step 5 - Nibs Packing</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <input
                list="processing-batch-codes"
                value={nibsPacking.batch_code}
                onChange={(e) => setNibsPacking({ ...nibsPacking, batch_code: e.target.value.toUpperCase() })}
                placeholder="Select or type processing batch"
                required
              />
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
            <h2>Roasting Lookup</h2>
            <div className="form-group">
              <label>Batch Code</label>
              <input
                list="processing-batch-codes"
                value={selectedBatchCodeForRoast}
                onChange={(e) => setSelectedBatchCodeForRoast(e.target.value.toUpperCase())}
                placeholder="Select or type processing batch"
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Qty Roasted</th>
                    <th>Weight After</th>
                    <th>Moisture After</th>
                  </tr>
                </thead>
                <tbody>
                  {roastLots.length === 0 ? (
                    <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No roasting entries</td></tr>
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
