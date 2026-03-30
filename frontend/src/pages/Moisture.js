import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function Moisture() {
  const [batches, setBatches] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ batch_id: '', moisture_pct: '', log_date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/batches').then(r => setBatches(r.data)); }, []);

  const handle = (e) => {
    const updated = { ...form, [e.target.name]: e.target.value };
    setForm(updated);
    if (e.target.name === 'batch_id' && e.target.value) {
      api.get(`/moisture/${e.target.value}`).then(r => setLogs(r.data)).catch(() => setLogs([]));
    }
  };

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      await api.post('/moisture', form);
      setSuccess('Moisture log added!');
      api.get(`/moisture/${form.batch_id}`).then(r => setLogs(r.data));
      setForm(f => ({ ...f, moisture_pct: '', log_date: '' }));
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>💧 Moisture Tracking</h1>
        <p>Log daily moisture readings during drying</p>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>Add Moisture Log</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Batch *</label>
              <select name="batch_id" value={form.batch_id} onChange={handle} required>
                <option value="">Select batch…</option>
                {batches.filter(b => !b.packed).map(b => <option key={b.id} value={b.id}>{b.batch_code} — {b.farmer_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Moisture % *</label>
              <input name="moisture_pct" type="number" step="0.1" min="0" max="100"
                placeholder="e.g. 18.5" value={form.moisture_pct} onChange={handle} required />
            </div>
            <div className="form-group">
              <label>Log Date *</label>
              <input name="log_date" type="date" value={form.log_date} onChange={handle} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : '💧 Add Log'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Moisture History</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Day</th><th>Date</th><th>Moisture %</th></tr></thead>
              <tbody>
                {logs.length === 0
                  ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Select a batch to view logs</td></tr>
                  : logs.map((l, i) => (
                    <tr key={l.id}>
                      <td>Day {i + 1}</td>
                      <td>{l.log_date?.slice(0,10)}</td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: l.moisture_pct > 15 ? 'var(--warning)' : 'var(--success)'
                        }}>{l.moisture_pct}%</span>
                      </td>
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
