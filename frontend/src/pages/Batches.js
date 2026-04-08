import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const emptyBag = () => ({ weight: '', bag_weight: '' });

export default function Batches() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [exportBatchId, setExportBatchId] = useState('');
  const [goodBags, setGoodBags] = useState([emptyBag()]);
  const [badBags, setBadBags] = useState([emptyBag()]);
  const [form, setForm] = useState({
    farmer_id: '',
    pod_date: '',
    farmer_pod_weight: '',
    farmer_bad_pod_weight: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = () =>
    Promise.all([api.get('/batches'), api.get('/farmers')]).then(([b, f]) => {
      setBatches(b.data);
      setFarmers(f.data);
    });

  useEffect(() => {
    load();
  }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const formatWeight = (value) => `${(parseFloat(value) || 0).toFixed(2)} kg`;
  const countFilledBags = (bags) => bags.filter((bag) => bag.weight !== '').length;
  const sumNetWeights = (bags) =>
    bags.reduce((sum, bag) => {
      const gross = bag.weight !== '' ? Number(bag.weight) : 0;
      const tare = bag.bag_weight !== '' ? Number(bag.bag_weight) : 0;
      if (Number.isNaN(gross) || Number.isNaN(tare)) return sum;
      return sum + Math.max(0, gross - tare);
    }, 0);

  const setBag = (type, index, field, value) => {
    const source = type === 'bad' ? badBags : goodBags;
    const setter = type === 'bad' ? setBadBags : setGoodBags;
    const next = [...source];
    next[index] = { ...next[index], [field]: value };
    setter(next);
  };

  const addBag = (type) => {
    if (type === 'bad') setBadBags([...badBags, emptyBag()]);
    else setGoodBags([...goodBags, emptyBag()]);
  };

  const removeBag = (type, index) => {
    const source = type === 'bad' ? badBags : goodBags;
    const setter = type === 'bad' ? setBadBags : setGoodBags;
    const next = source.filter((_, idx) => idx !== index);
    setter(next.length ? next : [emptyBag()]);
  };

  const goodTotal = sumNetWeights(goodBags);
  const badTotal = sumNetWeights(badBags);
  const total = (goodTotal + badTotal).toFixed(2);
  const farmerGoodTotal = Number(form.farmer_pod_weight || 0);
  const farmerBadTotal = Number(form.farmer_bad_pod_weight || 0);
  const farmerGrandTotal = (farmerGoodTotal + farmerBadTotal).toFixed(2);
  const selectedExportBatch = batches.find((batch) => String(batch.id) === String(exportBatchId));
  const exportUrl = selectedExportBatch
    ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/trace/${selectedExportBatch.id}/export`
    : '';

  const buildBagPayload = (bags) =>
    bags
      .map((bag) => ({
        weight: bag.weight !== '' ? Number(bag.weight) : null,
        bag_weight: bag.bag_weight !== '' ? Number(bag.bag_weight) : 0,
      }))
      .filter((bag) => bag.weight != null);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const good_bag_weights = buildBagPayload(goodBags);
    const bad_bag_weights = buildBagPayload(badBags);

    if (good_bag_weights.length === 0 && bad_bag_weights.length === 0) {
      setError('Add at least one good bag or bad bag weight');
      setLoading(false);
      return;
    }

    const invalidBag = [...good_bag_weights, ...bad_bag_weights].find(
      (bag) => Number.isNaN(bag.weight) || Number.isNaN(bag.bag_weight) || bag.weight <= 0 || bag.bag_weight < 0 || bag.bag_weight >= bag.weight
    );

    if (invalidBag) {
      setError('Each bag must have a valid gross weight, and empty bag weight must be less than gross weight');
      setLoading(false);
      return;
    }

    try {
      const res = await api.post('/batches', { ...form, good_bag_weights, bad_bag_weights });
      setSuccess(`Batch ${res.data.batch_code} created!`);
      setForm({ farmer_id: '', pod_date: '', farmer_pod_weight: '', farmer_bad_pod_weight: '' });
      setGoodBags([emptyBag()]);
      setBadBags([emptyBag()]);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const removeBatch = async (batch) => {
    if (user?.role !== 'admin' || !batch.packed) return;

    const confirmed = window.confirm(`Delete batch ${batch.batch_code}? This action cannot be undone.`);
    if (!confirmed) return;

    setError('');
    setSuccess('');
    setDeletingId(batch.id);

    try {
      const res = await api.delete(`/batches/${batch.id}`);
      setSuccess(res.data.message || `Batch ${batch.batch_code} deleted successfully`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  const renderBagInputs = (bags, type) => (
    <>
      {bags.map((bag, index) => (
        <div key={`${type}-${index}`} className="bucket-row" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 14, background: '#fff' }}>
          <div>
            <label>Gross bag weight (kg)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={`${type === 'good' ? 'Good' : 'Bad'} bag ${index + 1} gross weight`}
              value={bag.weight}
              onChange={(e) => setBag(type, index, 'weight', e.target.value)}
            />
          </div>
          <div>
            <label>Empty bag weight (kg)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 0.20"
              value={bag.bag_weight}
              onChange={(e) => setBag(type, index, 'bag_weight', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            {bags.length > 1 ? (
              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBag(type, index)}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => addBag(type)}>
        Add {type === 'good' ? 'Good' : 'Bad'} Bag
      </button>
    </>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Pod Collection</h1>
        <p>Record both farmer-reported pod weights and company-verified net bag weights for good and bad pods in one clean collection flow.</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>New Batch</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit} className="collection-shell">
            <div className="form-group">
              <label>Farmer *</label>
              <select name="farmer_id" value={form.farmer_id} onChange={handle} required>
                <option value="">Select farmer...</option>
                {farmers.map((farmer) => (
                  <option key={farmer.id} value={farmer.id}>
                    {farmer.farmer_code} - {farmer.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Pod Collection Date *</label>
              <input name="pod_date" type="date" value={form.pod_date} onChange={handle} required />
            </div>
            <div className="collection-section collection-section--tinted">
              <div className="collection-section-header">
                <div>
                  <h3>Farmer Recorded Weight</h3>
                  <p>
                    Enter the weight noted at the farm before the company rechecks the bags.
                  </p>
                </div>
                <div className="collection-total-pill">
                  Farmer total: {farmerGrandTotal} kg
                </div>
              </div>
              <div className="bucket-row">
                <div>
                  <label>Farmer good pod weight (kg)</label>
                  <input
                    name="farmer_pod_weight"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 420.50"
                    value={form.farmer_pod_weight}
                    onChange={handle}
                  />
                </div>
                <div>
                  <label>Farmer bad pod weight (kg)</label>
                  <input
                    name="farmer_bad_pod_weight"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 25.20"
                    value={form.farmer_bad_pod_weight}
                    onChange={handle}
                  />
                </div>
              </div>
            </div>
            <div className="collection-section">
              <div className="collection-section-header">
                <div>
                  <h3>Company Verified Good Bags</h3>
                  <p>Use the company recheck values here. Net weight is calculated from gross bag weight minus empty bag weight.</p>
                </div>
                <span className="collection-total-pill">
                  Company good total: {formatWeight(goodTotal)} ({countFilledBags(goodBags)} bags)
                </span>
              </div>
              <div className="compact-help" style={{ marginBottom: 12 }}>
                  Net after subtracting empty bag weight
              </div>
              {renderBagInputs(goodBags, 'good')}
            </div>
            <div className="collection-section">
              <div className="collection-section-header">
                <div>
                  <h3>Company Verified Bad Bags</h3>
                  <p>Record the rejected or damaged pod bags separately so the verified totals stay accurate everywhere.</p>
                </div>
                <span className="collection-total-pill">
                  Company bad total: {formatWeight(badTotal)} ({countFilledBags(badBags)} bags)
                </span>
              </div>
              <div className="compact-help" style={{ marginBottom: 12 }}>
                  Net after subtracting empty bag weight
              </div>
              {renderBagInputs(badBags, 'bad')}
            </div>
            <div className="collection-summary-grid">
              <div className="collection-summary-card">
                <div className="label">Farmer good</div>
                <div className="value">{formatWeight(farmerGoodTotal)}</div>
              </div>
              <div className="collection-summary-card">
                <div className="label">Farmer bad</div>
                <div className="value">{formatWeight(farmerBadTotal)}</div>
              </div>
              <div className="collection-summary-card collection-summary-card--accent">
                <div className="label">Company good</div>
                <div className="value">{formatWeight(goodTotal)}</div>
              </div>
              <div className="collection-summary-card collection-summary-card--accent">
                <div className="label">Company bad</div>
                <div className="value">{formatWeight(badTotal)}</div>
              </div>
              <div className="collection-summary-card collection-summary-card--accent">
                <div className="label">Company grand total</div>
                <div className="value">{total} kg</div>
              </div>
              <div className="collection-summary-card">
                <div className="label">Total bags</div>
                <div className="value">{countFilledBags(goodBags) + countFilledBags(badBags)}</div>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Batch'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>All Batches ({batches.length})</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ flex: '1 1 280px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Select Batch Code For Excel
              </label>
              <select value={exportBatchId} onChange={(e) => setExportBatchId(e.target.value)}>
                <option value="">Choose batch code...</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batch_code} - {batch.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {selectedExportBatch ? (
                <a className="btn btn-secondary" href={exportUrl} target="_blank" rel="noreferrer">
                  Download Excel Sheet
                </a>
              ) : (
                <button type="button" className="btn btn-secondary" disabled>
                  Download Excel Sheet
                </button>
              )}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Farmer</th>
                  <th>Bags</th>
                  <th>Farmer Weight</th>
                  <th>Company Weight</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No batches yet
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id}>
                      <td><strong>{batch.batch_code}</strong></td>
                      <td>{batch.farmer_name}</td>
                      <td>{batch.bag_count} good / {batch.bad_bag_count || 0} bad</td>
                      <td>{formatWeight(batch.farmer_pod_weight)} / {formatWeight(batch.farmer_bad_pod_weight)}</td>
                      <td>{formatWeight(batch.pod_weight)} / {formatWeight(batch.bad_pod_weight)}</td>
                      <td>{batch.pod_date?.slice(0, 10)}</td>
                      <td>
                        <span className={`badge ${batch.packed ? 'badge-completed' : 'badge-pending'}`}>
                          {batch.packed ? 'Done' : 'In Progress'}
                        </span>
                      </td>
                      <td>
                        {user?.role === 'admin' && batch.packed ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => removeBatch(batch)}
                            disabled={deletingId === batch.id}
                          >
                            {deletingId === batch.id ? 'Deleting...' : 'Delete'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            {user?.role === 'admin' ? 'Available when done' : 'Admin only'}
                          </span>
                        )}
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
  );
}
