import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const emptyBag = () => ({ weight: '', bag_weight: '' });

export default function Batches() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [goodBags, setGoodBags] = useState([emptyBag()]);
  const [badBags, setBadBags] = useState([emptyBag()]);
  const [form, setForm] = useState({ farmer_id: '', pod_date: '' });
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
      setForm({ farmer_id: '', pod_date: '' });
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
        <div key={`${type}-${index}`} className="bucket-row">
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
        <p>Record cocoa pod collection batches from farmers using net bag weight after subtracting the empty bag weight.</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>New Batch</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
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
            <div className="form-group">
              <label>Good Bag Weights (kg)</label>
              {renderBagInputs(goodBags, 'good')}
              <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Good total: {formatWeight(goodTotal)} ({countFilledBags(goodBags)} bags)
              </div>
            </div>
            <div className="form-group">
              <label>Bad Bag Weights (kg)</label>
              {renderBagInputs(badBags, 'bad')}
              <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Bad total: {formatWeight(badTotal)} ({countFilledBags(badBags)} bags)
              </div>
              <div style={{ marginTop: 8, fontSize: '0.95rem', color: 'var(--primary-dark)', fontWeight: 700 }}>
                Grand total: {total} kg ({countFilledBags(goodBags) + countFilledBags(badBags)} bags)
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Batch'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>All Batches ({batches.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Farmer</th>
                  <th>Good/Bad Bags</th>
                  <th>Good/Bad Weight</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No batches yet
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id}>
                      <td><strong>{batch.batch_code}</strong></td>
                      <td>{batch.farmer_name}</td>
                      <td>{batch.bag_count} / {batch.bad_bag_count || 0}</td>
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
