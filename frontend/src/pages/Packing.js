import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function Packing() {
  const [batches, setBatches] = useState([]);
  const [bags, setBags] = useState(['']);
  const [form, setForm] = useState({ batch_id: '', packing_date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/batches').then(r => setBatches(r.data)); }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const setBag = (i, v) => { const n = [...bags]; n[i] = v; setBags(n); };
  const addBag = () => setBags([...bags, '']);
  const removeBag = (i) => setBags(bags.filter((_, idx) => idx !== i));
  const total = bags.reduce((s, w) => s + (parseFloat(w) || 0), 0).toFixed(2);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    const bag_weights = bags.map(Number).filter(w => w > 0);
    if (!bag_weights.length) { setError('Add at least one bag weight'); setLoading(false); return; }
    try {
      const res = await api.post('/packing', { ...form, bag_weights });
      setSuccess(`Packing recorded! Final weight: ${res.data.final_weight} kg`);
      setForm({ batch_id: '', packing_date: '' }); setBags(['']);
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>📫 Packing Stage</h1>
        <p>Record final packing weights for completed batches</p>
      </div>
      <div style={{ maxWidth: 520 }}>
        <div className="card">
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
              <label>Packing Date *</label>
              <input name="packing_date" type="date" value={form.packing_date} onChange={handle} required />
            </div>
            <div className="form-group">
              <label>Final Bag Weights (kg)</label>
              {bags.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input type="number" step="0.01" min="0" placeholder={`Bag ${i+1}`}
                    value={b} onChange={e => setBag(i, e.target.value)} style={{ flex: 1 }} />
                  {bags.length > 1 &&
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBag(i)}>✕</button>}
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-secondary" onClick={addBag}>+ Add Bag</button>
              <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Total final weight: {total} kg ({bags.filter(b => b).length} bags)
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : '📦 Record Packing'}
            </button>
          </form>
        </div>

        {form.batch_id && (
          <div className="card">
            <h2>📱 QR Code</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Scan to view full traceability for this batch
            </p>
            <img
              src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/trace/${form.batch_id}/qrcode`}
              alt="QR Code"
              style={{ width: 200, height: 200, border: '1px solid var(--border)', borderRadius: 8 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
