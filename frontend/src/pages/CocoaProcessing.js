import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function cloneWorkers(workers) {
  if (!Array.isArray(workers)) return [];
  return workers.map((worker) => ({
    worker_name: worker.worker_name || '',
    cleaned_nibs_kg: worker.cleaned_nibs_kg || '',
  }));
}

export default function CocoaProcessing() {
  const [batches, setBatches] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [roastLots, setRoastLots] = useState([]);
  const [roastingBatchLots, setRoastingBatchLots] = useState([]);
  const [selectedBatchCodeForRoast, setSelectedBatchCodeForRoast] = useState('');
  const [editingRoastId, setEditingRoastId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [currentBatchCode, setCurrentBatchCode] = useState('');

  const [beansArrival, setBeansArrival] = useState({
    batch_code: '',
    bag_weight_kg: '',
    bag_moisture_pct: '',
    bag_details: [],
  });
  const [roasting, setRoasting] = useState({
    batch_code: '',
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
      const [batchesRes, workersRes, inventoryRes] = await Promise.all([
        api.get('/cocoa-processing/batches'),
        api.get('/cocoa-processing/workers'),
        api.get('/cocoa-processing/inventory'),
      ]);
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
      return;
    }

    api.get(`/cocoa-processing/roast-lots/${batchCode}`)
      .then((res) => setRoastingBatchLots(res.data || []))
      .catch(() => setRoastingBatchLots([]));
  }, [roasting.batch_code]);

  const beansArrivalTotalWeightKg = useMemo(
    () => beansArrival.bag_details.reduce((sum, bag) => sum + toNumber(bag.weight_kg), 0),
    [beansArrival.bag_details]
  );

  const selectedBeansArrivalBatch = useMemo(
    () => batches.find((item) => item.batch_code === String(beansArrival.batch_code || '').toUpperCase()) || null,
    [batches, beansArrival.batch_code]
  );

  const selectedRoastingBatch = useMemo(
    () => batches.find((item) => item.batch_code === String(roasting.batch_code || '').toUpperCase()) || null,
    [batches, roasting.batch_code]
  );

  const selectedWinnowingBatch = useMemo(
    () => batches.find((item) => item.batch_code === String(winnowing.batch_code || '').toUpperCase()) || null,
    [batches, winnowing.batch_code]
  );

  const selectedCleaningBatch = useMemo(
    () => batches.find((item) => item.batch_code === String(cleaning.batch_code || '').toUpperCase()) || null,
    [batches, cleaning.batch_code]
  );

  const selectedPackingBatch = useMemo(
    () => batches.find((item) => item.batch_code === String(nibsPacking.batch_code || '').toUpperCase()) || null,
    [batches, nibsPacking.batch_code]
  );

  const remainingToRoastKg = useMemo(() => {
    if (!selectedRoastingBatch) return 0;
    const totalWeight = toNumber(selectedRoastingBatch.weight_kg);
    const totalRoasted = toNumber(selectedRoastingBatch.total_roasted_kg);
    return Number(Math.max(totalWeight - totalRoasted, 0).toFixed(2));
  }, [selectedRoastingBatch]);

  const roastingQuantityMax = editingRoastId
    ? 10
    : (remainingToRoastKg > 0 ? Math.min(10, remainingToRoastKg) : 10);

  const cleaningTotalKg = useMemo(
    () => cleaning.workers_involved.reduce((sum, worker) => sum + toNumber(worker.cleaned_nibs_kg), 0),
    [cleaning.workers_involved]
  );

  const loadBeansArrivalBatch = (batchCode) => {
    const batch = batches.find((item) => item.batch_code === String(batchCode || '').toUpperCase());
    if (!batch) {
      setError('');
      setSuccess('This is a new batch. Add bag details and save Step 1 first.');
      return;
    }
    setError('');
    setSuccess(`Loaded existing Beans Arrival for ${batch.batch_code}`);
    setCurrentBatchCode(batch.batch_code);
    setBeansArrival({
      batch_code: batch.batch_code,
      bag_weight_kg: '',
      bag_moisture_pct: '',
      bag_details: Array.isArray(batch.bag_details)
        ? batch.bag_details.map((bag, index) => ({
            bag_label: bag.bag_label || `Bag ${index + 1}`,
            weight_kg: bag.weight_kg,
            moisture_pct: bag.moisture_pct,
          }))
        : [],
    });
  };

  const clearBeansArrival = () => {
    setBeansArrival({
      batch_code: '',
      bag_weight_kg: '',
      bag_moisture_pct: '',
      bag_details: [],
    });
  };

  const loadRoastingBatch = (batchCode) => {
    const normalizedBatchCode = String(batchCode || '').toUpperCase();
    setError('');
    setEditingRoastId(null);
    setRoasting({
      batch_code: normalizedBatchCode,
      quantity_roasted_kg: '',
      weight_after_roasting_kg: '',
      moisture_after_roasting_pct: '',
    });
    setSelectedBatchCodeForRoast(normalizedBatchCode);
  };

  const loadWinnowingBatch = (batchCode) => {
    const batch = batches.find((item) => item.batch_code === String(batchCode || '').toUpperCase());
    if (!batch) {
      setError('');
      setSuccess('Batch not found in cocoa processing yet. Save Step 1 first.');
      return;
    }
    setError('');
    setSuccess(`Loaded Winnowing for ${batch.batch_code}`);
    setCurrentBatchCode(batch.batch_code);
    setWinnowing({
      batch_code: batch.batch_code,
      weight_before_kg: String(toNumber(batch.total_weight_after_roasting_kg).toFixed(2)),
      weight_after_kg: batch.winnowing_weight_after_kg ?? '',
    });
  };

  const clearWinnowing = () => {
    setWinnowing({ batch_code: '', weight_before_kg: '', weight_after_kg: '' });
  };

  const loadCleaningBatch = (batchCode) => {
    const batch = batches.find((item) => item.batch_code === String(batchCode || '').toUpperCase());
    if (!batch) {
      setError('');
      setSuccess('Batch not found in cocoa processing yet. Save Step 1 first.');
      return;
    }
    setError('');
    setSuccess(`Loaded Cleaning Nibs for ${batch.batch_code}`);
    setCurrentBatchCode(batch.batch_code);
    setCleaning({
      batch_code: batch.batch_code,
      weight_before_kg: batch.cleaning_weight_before_kg ?? '',
      selected_worker: '',
      worker_cleaned_kg: '',
      workers_involved: cloneWorkers(batch.workers_involved),
      remarks: batch.cleaning_remarks || '',
    });
  };

  const clearCleaning = () => {
    setCleaning({
      batch_code: '',
      weight_before_kg: '',
      selected_worker: '',
      worker_cleaned_kg: '',
      workers_involved: [],
      remarks: '',
    });
  };

  const loadPackingBatch = (batchCode) => {
    const batch = batches.find((item) => item.batch_code === String(batchCode || '').toUpperCase());
    if (!batch) {
      setError('');
      setSuccess('Batch not found in cocoa processing yet. Save Step 1 first.');
      return;
    }
    setError('');
    setSuccess(`Loaded Nibs Packing for ${batch.batch_code}`);
    setCurrentBatchCode(batch.batch_code);
    setNibsPacking({
      batch_code: batch.batch_code,
      total_nibs_weight_kg: batch.total_nibs_weight_kg ?? '',
      number_of_bags: batch.number_of_bags ?? '',
    });
  };

  const clearPacking = () => {
    setNibsPacking({ batch_code: '', total_nibs_weight_kg: '', number_of_bags: '' });
  };

  useEffect(() => {
    if (!selectedWinnowingBatch) return;
    setWinnowing((current) => ({
      ...current,
      weight_before_kg: String(toNumber(selectedWinnowingBatch.total_weight_after_roasting_kg).toFixed(2)),
    }));
  }, [selectedWinnowingBatch]);

  const addBeansArrivalBag = () => {
    const bagWeightKg = Number(beansArrival.bag_weight_kg);
    const bagMoisturePct = Number(beansArrival.bag_moisture_pct);
    if (!Number.isFinite(bagWeightKg) || !Number.isFinite(bagMoisturePct) || bagWeightKg <= 0) {
      return;
    }

    const nextBagNumber = beansArrival.bag_details.length + 1;
    setBeansArrival((current) => ({
      ...current,
      bag_weight_kg: '',
      bag_moisture_pct: '',
      bag_details: [
        ...current.bag_details,
        {
          bag_label: `Bag ${nextBagNumber}`,
          weight_kg: bagWeightKg,
          moisture_pct: bagMoisturePct,
        },
      ],
    }));
  };

  const removeBeansArrivalBag = (indexToRemove) => {
    setBeansArrival((current) => ({
      ...current,
      bag_details: current.bag_details
        .filter((_, index) => index !== indexToRemove)
        .map((bag, index) => ({ ...bag, bag_label: `Bag ${index + 1}` })),
    }));
  };

  const startEditingRoast = (lot) => {
    setEditingRoastId(lot.id);
    setRoasting({
      batch_code: String(selectedBatchCodeForRoast || '').toUpperCase(),
      quantity_roasted_kg: lot.quantity_roasted_kg,
      weight_after_roasting_kg: lot.weight_after_roasting_kg,
      moisture_after_roasting_pct: lot.moisture_after_roasting_pct,
    });
  };

  const cancelEditingRoast = () => {
    setEditingRoastId(null);
    setRoasting((current) => ({
      ...current,
      quantity_roasted_kg: '',
      weight_after_roasting_kg: '',
      moisture_after_roasting_pct: '',
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
      setSuccess(selectedBeansArrivalBatch ? 'Beans Arrival updated' : 'Beans Arrival saved with bag-wise details');
      const savedBatchCode = String(response.data?.batch_code || batchCode).toUpperCase();
      setCurrentBatchCode(savedBatchCode);
      clearBeansArrival();
      setRoasting({
        batch_code: savedBatchCode,
        quantity_roasted_kg: '',
        weight_after_roasting_kg: '',
        moisture_after_roasting_pct: '',
      });
      setWinnowing({ batch_code: savedBatchCode, weight_before_kg: '', weight_after_kg: '' });
      setCleaning({
        batch_code: savedBatchCode,
        weight_before_kg: '',
        selected_worker: '',
        worker_cleaned_kg: '',
        workers_involved: [],
        remarks: '',
      });
      setNibsPacking({ batch_code: savedBatchCode, total_nibs_weight_kg: '', number_of_bags: '' });
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
      if (editingRoastId) {
        await api.put(`/cocoa-processing/roasting-lots/${editingRoastId}`, {
          quantity_roasted_kg: roasting.quantity_roasted_kg,
          weight_after_roasting_kg: roasting.weight_after_roasting_kg,
          moisture_after_roasting_pct: roasting.moisture_after_roasting_pct,
        });
        setSuccess('Roasting entry updated');
      } else {
        await api.post('/cocoa-processing/roasting-lots', {
          batch_code: batchCode,
          quantity_roasted_kg: roasting.quantity_roasted_kg,
          weight_after_roasting_kg: roasting.weight_after_roasting_kg,
          moisture_after_roasting_pct: roasting.moisture_after_roasting_pct,
        });
        setSuccess('Roasting entry saved');
      }
      setRoasting({
        batch_code: batchCode,
        quantity_roasted_kg: '',
        weight_after_roasting_kg: '',
        moisture_after_roasting_pct: '',
      });
      setCurrentBatchCode(batchCode);
      setEditingRoastId(null);
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
      const batchCode = String(winnowing.batch_code || '').toUpperCase();
      await api.post('/cocoa-processing/winnowing', {
        ...winnowing,
        batch_code: batchCode,
      });
      setSuccess(selectedWinnowingBatch?.winnowing_weight_after_kg != null ? 'Winnowing updated' : 'Winnowing saved');
      setCurrentBatchCode(batchCode);
      setCleaning((current) => ({ ...current, batch_code: batchCode }));
      setNibsPacking((current) => ({ ...current, batch_code: batchCode }));
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
      setSuccess(selectedCleaningBatch?.cleaning_weight_after_kg != null ? 'Cleaning Nibs updated' : 'Cleaning Nibs saved with worker totals');
      setCurrentBatchCode(batchCode);
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
      setSuccess(selectedPackingBatch?.total_nibs_weight_kg != null ? 'Nibs Packing updated' : 'Nibs Packing saved and inventory updated');
      setCurrentBatchCode(String(nibsPacking.batch_code || '').toUpperCase());
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
        <p>Work on any batch at any time, edit every saved step, and keep bag-wise moisture plus worker-wise cleaning details.</p>
      </div>

      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
        {currentBatchCode ? (
          <div className="compact-help" style={{ marginBottom: 14 }}>
            Current working batch: <strong>{currentBatchCode}</strong>. The next cocoa steps are filled automatically with this batch code.
          </div>
        ) : null}
        <div className="grid-2">
          <form onSubmit={saveBeansArrival}>
            <h2>Step 1 - Beans Arrival + Moisture</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <input
                value={beansArrival.batch_code}
                onChange={(e) => setBeansArrival({ ...beansArrival, batch_code: e.target.value.toUpperCase() })}
                placeholder="Type batch code"
                required
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <button className="btn btn-secondary" type="button" onClick={() => loadBeansArrivalBatch(beansArrival.batch_code)}>
                Load Existing
              </button>
              <button className="btn btn-secondary" type="button" onClick={clearBeansArrival} style={{ marginLeft: 8 }}>
                Clear
              </button>
            </div>

            <div className="soft-panel" style={{ marginBottom: 16 }}>
              <div className="soft-panel-title">
                <div>
                  <h3>Add Bag</h3>
                  <p>Enter bag weight and moisture. The system keeps each bag moisture detail separately.</p>
                </div>
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
              <div className="compact-help" style={{ marginBottom: 8 }}>
                Bag names are created automatically as `Bag 1`, `Bag 2`, `Bag 3`...
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
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading || beansArrival.bag_details.length === 0}>
              {loading ? 'Saving...' : selectedBeansArrivalBatch ? 'Update Beans Arrival' : 'Save Beans Arrival'}
            </button>
          </form>

          <div>
            <form onSubmit={saveRoastLot}>
              <h2>Step 2 - Roasting</h2>
              <div className="form-group">
                <label>Batch Code *</label>
                <input
                  value={roasting.batch_code}
                  onChange={(e) => loadRoastingBatch(e.target.value)}
                  placeholder="Type processing batch code"
                  required
                />
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
                You can open any batch for roasting. New saves create new roast entries, and existing roast entries can be edited below.
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
                {loading ? 'Saving...' : editingRoastId ? 'Update Roasting Entry' : 'Save Roasting Entry'}
              </button>
              {editingRoastId ? (
                <button className="btn btn-secondary" type="button" onClick={cancelEditingRoast} style={{ marginLeft: 8 }}>
                  Cancel Edit
                </button>
              ) : null}
            </form>

            <div className="table-wrap" style={{ marginTop: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Qty Roasted</th>
                    <th>Weight After</th>
                    <th>Moisture After</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {roastingBatchLots.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--text-muted)' }}>No roasting entries yet</td>
                    </tr>
                  ) : (
                    roastingBatchLots.map((lot) => (
                      <tr key={lot.id}>
                        <td>{lot.roast_lot_number}</td>
                        <td>{Number(lot.quantity_roasted_kg).toFixed(2)}</td>
                        <td>{Number(lot.weight_after_roasting_kg).toFixed(2)}</td>
                        <td>{Number(lot.moisture_after_roasting_pct).toFixed(2)}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => startEditingRoast(lot)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={saveWinnowing}>
            <h2>Step 3 - Winnowing</h2>
            <div className="form-group">
              <label>Batch Code *</label>
              <input
                value={winnowing.batch_code}
                onChange={(e) => setWinnowing({ ...winnowing, batch_code: e.target.value.toUpperCase() })}
                placeholder="Type processing batch code"
                required
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <button className="btn btn-secondary" type="button" onClick={() => loadWinnowingBatch(winnowing.batch_code)}>
                Load Existing
              </button>
              <button className="btn btn-secondary" type="button" onClick={clearWinnowing} style={{ marginLeft: 8 }}>
                Clear
              </button>
            </div>
            <div className="compact-help" style={{ marginBottom: 12 }}>
              Weight before winnowing is filled automatically from the total weight after roasting for this batch.
            </div>
            <div className="form-group">
              <label>Weight Before Winnowing *</label>
              <input type="number" step="0.01" value={winnowing.weight_before_kg} readOnly required />
            </div>
            <div className="form-group">
              <label>Weight After Winnowing *</label>
              <input type="number" step="0.01" value={winnowing.weight_after_kg} onChange={(e) => setWinnowing({ ...winnowing, weight_after_kg: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : selectedWinnowingBatch?.winnowing_weight_after_kg != null ? 'Update Winnowing' : 'Save Winnowing'}
            </button>
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
                value={cleaning.batch_code}
                onChange={(e) => setCleaning({ ...cleaning, batch_code: e.target.value.toUpperCase() })}
                placeholder="Type processing batch code"
                required
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <button className="btn btn-secondary" type="button" onClick={() => loadCleaningBatch(cleaning.batch_code)}>
                Load Existing
              </button>
              <button className="btn btn-secondary" type="button" onClick={clearCleaning} style={{ marginLeft: 8 }}>
                Clear
              </button>
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
              {loading ? 'Saving...' : selectedCleaningBatch?.cleaning_weight_after_kg != null ? 'Update Cleaning Nibs' : 'Save Cleaning Nibs'}
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
                value={nibsPacking.batch_code}
                onChange={(e) => setNibsPacking({ ...nibsPacking, batch_code: e.target.value.toUpperCase() })}
                placeholder="Type processing batch code"
                required
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <button className="btn btn-secondary" type="button" onClick={() => loadPackingBatch(nibsPacking.batch_code)}>
                Load Existing
              </button>
              <button className="btn btn-secondary" type="button" onClick={clearPacking} style={{ marginLeft: 8 }}>
                Clear
              </button>
            </div>
            <div className="form-group">
              <label>Total Nibs Weight (kg) *</label>
              <input type="number" step="0.01" value={nibsPacking.total_nibs_weight_kg} onChange={(e) => setNibsPacking({ ...nibsPacking, total_nibs_weight_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Number Of Bags *</label>
              <input type="number" value={nibsPacking.number_of_bags} onChange={(e) => setNibsPacking({ ...nibsPacking, number_of_bags: e.target.value })} required />
            </div>
            <button className="btn btn-accent" type="submit" disabled={loading}>
              {loading ? 'Saving...' : selectedPackingBatch?.total_nibs_weight_kg != null ? 'Update Nibs Packing' : 'Save Nibs Packing'}
            </button>
          </form>

          <div>
            <h2>Processing Batch Quick Edit</h2>
            <div className="compact-help" style={{ marginBottom: 12 }}>
              Open any batch in any step without waiting for another batch to finish first.
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Beans</th>
                    <th>Roasting</th>
                    <th>Winnowing</th>
                    <th>Cleaning</th>
                    <th>Packing</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>No processing batches yet</td></tr>
                  ) : batches.map((batch) => (
                    <tr key={batch.id}>
                      <td><strong>{batch.batch_code}</strong></td>
                      <td><button className="btn btn-sm btn-secondary" type="button" onClick={() => loadBeansArrivalBatch(batch.batch_code)}>Edit</button></td>
                      <td><button className="btn btn-sm btn-secondary" type="button" onClick={() => loadRoastingBatch(batch.batch_code)}>Open</button></td>
                      <td><button className="btn btn-sm btn-secondary" type="button" onClick={() => loadWinnowingBatch(batch.batch_code)}>Edit</button></td>
                      <td><button className="btn btn-sm btn-secondary" type="button" onClick={() => loadCleaningBatch(batch.batch_code)}>Edit</button></td>
                      <td><button className="btn btn-sm btn-secondary" type="button" onClick={() => loadPackingBatch(batch.batch_code)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 22 }}>
              <h2>Roasting Lookup</h2>
              <div className="form-group">
                <label>Batch Code</label>
                <input
                  value={selectedBatchCodeForRoast}
                  onChange={(e) => setSelectedBatchCodeForRoast(e.target.value.toUpperCase())}
                  placeholder="Type processing batch code"
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
