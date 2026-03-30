import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Batches() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [bags, setBags] = useState(['']);
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
  const setBag = (i, v) => {
    const next = [...bags];
    next[i] = v;
    setBags(next);
  };
  const addBag = () => setBags([...bags, '']);
  const removeBag = (i) => setBags(bags.filter((_, idx) => idx !== i));
  const total = bags.reduce((sum, weight) => sum + (parseFloat(weight) || 0), 0).toFixed(2);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const bag_weights = bags.map(Number).filter((weight) => weight > 0);
    if (bag_weights.length === 0) {
      setError('Add at least one bag weight');
      setLoading(false);
      return;
    }

    try {
      const res = await api.post('/batches', { ...form, bag_weights });
      setSuccess(`Batch ${res.data.batch_code} created!`);
      setForm({ farmer_id: '', pod_date: '' });
      setBags(['']);
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
              <label>Bag Weights (kg)</label>
              {bags.map((bag, i) => (
                <div key={i} className="input-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Bag ${i + 1} weight`}
                    value={bag}
                    onChange={(e) => setBag(i, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {bags.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBag(i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-secondary" onClick={addBag}>
                Add Bag
              </button>
              <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Total: {total} kg ({bags.filter((bag) => bag).length} bags)
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
                  <th>Bags</th>
                  <th>Weight</th>
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
                      <td>{batch.bag_count}</td>
                      <td>{batch.pod_weight} kg</td>
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
