import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Batches() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [goodBags, setGoodBags] = useState(['']);
  const [badBags, setBadBags] = useState(['']);
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
  const sumWeights = (weights) => weights.reduce((sum, weight) => sum + (parseFloat(weight) || 0), 0);
  const setBag = (type, i, v) => {
    const source = type === 'bad' ? badBags : goodBags;
    const setter = type === 'bad' ? setBadBags : setGoodBags;
    const next = [...source];
    next[i] = v;
    setter(next);
  };
  const addBag = (type) => {
    if (type === 'bad') setBadBags([...badBags, '']);
    else setGoodBags([...goodBags, '']);
  };
  const removeBag = (type, i) => {
    const source = type === 'bad' ? badBags : goodBags;
    const setter = type === 'bad' ? setBadBags : setGoodBags;
    setter(source.filter((_, idx) => idx !== i));
  };
  const goodTotal = sumWeights(goodBags);
  const badTotal = sumWeights(badBags);
  const total = (goodTotal + badTotal).toFixed(2);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const good_bag_weights = goodBags.map(Number).filter((weight) => weight > 0);
    const bad_bag_weights = badBags.map(Number).filter((weight) => weight > 0);
    if (good_bag_weights.length === 0 && bad_bag_weights.length === 0) {
      setError('Add at least one good bag or bad bag weight');
      setLoading(false);
      return;
    }

    try {
      const res = await api.post('/batches', { ...form, good_bag_weights, bad_bag_weights });
      setSuccess(`Batch ${res.data.batch_code} created!`);
      setForm({ farmer_id: '', pod_date: '' });
      setGoodBags(['']);
      setBadBags(['']);
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

  return (
    <div>
      <div className="page-header">
        <h1>Pod Collection</h1>
        <p>Record cocoa pod collection batches from farmers</p>
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
              {goodBags.map((bag, i) => (
                <div key={i} className="input-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Good bag ${i + 1} weight`}
                    value={bag}
                    onChange={(e) => setBag('good', i, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {goodBags.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBag('good', i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => addBag('good')}>
                Add Good Bag
              </button>
              <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Good total: {formatWeight(goodTotal)} ({goodBags.filter((bag) => bag).length} bags)
              </div>
            </div>
            <div className="form-group">
              <label>Bad Bag Weights (kg)</label>
              {badBags.map((bag, i) => (
                <div key={i} className="input-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Bad bag ${i + 1} weight`}
                    value={bag}
                    onChange={(e) => setBag('bad', i, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {badBags.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBag('bad', i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => addBag('bad')}>
                Add Bad Bag
              </button>
              <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Bad total: {formatWeight(badTotal)} ({badBags.filter((bag) => bag).length} bags)
              </div>
              <div style={{ marginTop: 8, fontSize: '0.95rem', color: 'var(--primary-dark)', fontWeight: 700 }}>
                Grand total: {total} kg ({goodBags.filter((bag) => bag).length + badBags.filter((bag) => bag).length} bags)
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
