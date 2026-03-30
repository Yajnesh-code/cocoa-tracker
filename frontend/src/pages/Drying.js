import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function Drying() {
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ batch_id: '', shelf_id: '', start_date: '' });
  const [completeForm, setCompleteForm] = useState({ batch_id: '', end_date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/batches').then(r => setBatches(r.data)); }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleC = (e) => setCompleteForm({ ...completeForm, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      await api.post('/drying', form);
      setSuccess('Drying started!');
      setForm({ batch_id: '', shelf_id: '', start_date: '' });
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const complete = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      await api.patch(`/drying/${completeForm.batch_id}/complete`, { end_date: completeForm.end_date });
      setSuccess('Drying completed!');
      setCompleteForm({ batch_id: '', end_date: '' });
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>☀️ Drying Stage</h1>
        <p>Assign cocoa to drying shelves and track completion</p>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>Start Drying</h2>
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
              <label>Shelf ID *</label>
              <input name="shelf_id" placeholder="e.g. SHELF-A1" value={form.shelf_id} onChange={handle} required />
            </div>
            <div className="form-group">
              <label>Drying Start Date *</label>
              <input name="start_date" type="date" value={form.start_date} onChange={handle} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : '☀️ Start Drying'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Complete Drying</h2>
          <form onSubmit={complete}>
            <div className="form-group">
              <label>Batch *</label>
              <select name="batch_id" value={completeForm.batch_id} onChange={handleC} required>
                <option value="">Select batch…</option>
                {batches.filter(b => !b.packed).map(b => <option key={b.id} value={b.id}>{b.batch_code} — {b.farmer_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Drying End Date *</label>
              <input name="end_date" type="date" value={completeForm.end_date} onChange={handleC} required />
            </div>
            <button className="btn btn-accent" type="submit" disabled={loading}>
              {loading ? 'Saving…' : '✔ Complete Drying'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
