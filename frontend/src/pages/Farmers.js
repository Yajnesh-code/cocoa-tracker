import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function Farmers() {
  const [farmers, setFarmers] = useState([]);
  const [form, setForm] = useState({ farmer_code: '', name: '', location: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api.get('/farmers').then(r => setFarmers(r.data));
  useEffect(() => { load(); }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      await api.post('/farmers', form);
      setSuccess('Farmer registered successfully!');
      setForm({ farmer_code: '', name: '', location: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register farmer');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>🌱 Farmer Registration</h1>
        <p>Register and manage cocoa farmers</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Register New Farmer</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Farmer Code *</label>
              <input name="farmer_code" placeholder="e.g. FRM-001" value={form.farmer_code} onChange={handle} required />
            </div>
            <div className="form-group">
              <label>Full Name *</label>
              <input name="name" placeholder="e.g. Ahmad bin Ismail" value={form.name} onChange={handle} required />
            </div>
            <div className="form-group">
              <label>Location *</label>
              <input name="location" placeholder="e.g. Tawau, Sabah" value={form.location} onChange={handle} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : '+ Register Farmer'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>All Farmers ({farmers.length})</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Location</th></tr></thead>
              <tbody>
                {farmers.length === 0
                  ? <tr><td colSpan={3} style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No farmers yet</td></tr>
                  : farmers.map(f => (
                    <tr key={f.id}>
                      <td><strong>{f.farmer_code}</strong></td>
                      <td>{f.name}</td>
                      <td>{f.location}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
