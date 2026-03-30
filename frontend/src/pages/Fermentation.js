import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap(letter => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

export default function Fermentation() {
  const [batches, setBatches] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [form, setForm] = useState({ batch_id: '', box_id: '', start_date: '' });
  const [completeForm, setCompleteForm] = useState({ batch_id: '', end_date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const [batchRes, fermentationRes] = await Promise.all([
        api.get('/batches'),
        api.get('/fermentation'),
      ]);
      setBatches(batchRes.data);
      setFermentations(fermentationRes.data);
    } catch (err) {
      setError('Unable to load fermentation data');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleC = (e) => setCompleteForm({ ...completeForm, [e.target.name]: e.target.value });

  const activeBoxes = fermentations
    .filter((f) => f.status === 'active')
    .reduce((map, f) => {
      map[f.box_id] = f;
      return map;
    }, {});

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/fermentation', {
        batch_id: form.batch_id,
        box_id: form.box_id,
        start_date: form.start_date,
      });
      setSuccess('Fermentation started!');
      setForm({ batch_id: '', box_id: '', start_date: '' });
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const complete = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.patch(`/fermentation/${completeForm.batch_id}/complete`, { end_date: completeForm.end_date });
      setSuccess('Fermentation completed!');
      setCompleteForm({ batch_id: '', end_date: '' });
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Fermentation</h1>
        <p>Assign cocoa to fermentation boxes A1-E12 and track good/bad bean weights.</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Start Fermentation</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Batch *</label>
              <select name="batch_id" value={form.batch_id} onChange={handle} required>
                <option value="">Select batch...</option>
                {batches.filter((b) => !b.packed).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Box ID (A1-E12) *</label>
              <select name="box_id" value={form.box_id} onChange={handle} required>
                <option value="">Select box...</option>
                {BOXES.map((box) => {
                  const occupied = activeBoxes[box];
                  return (
                    <option key={box} value={box} disabled={Boolean(occupied)}>
                      {box}
                      {occupied ? ` - occupied by ${occupied.batch_code}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="form-group">
              <label>Start Date *</label>
              <input name="start_date" type="date" value={form.start_date} onChange={handle} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Start Fermentation'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Complete Fermentation</h2>
          <form onSubmit={complete}>
            <div className="form-group">
              <label>Batch *</label>
              <select name="batch_id" value={completeForm.batch_id} onChange={handleC} required>
                <option value="">Select batch...</option>
                {batches.filter((b) => !b.packed).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>End Date *</label>
              <input name="end_date" type="date" value={completeForm.end_date} onChange={handleC} required />
            </div>
            <button className="btn btn-accent" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Complete Fermentation'}
            </button>
          </form>

          <div style={{ marginTop: 20 }}>
            <h2>Box Grid</h2>
            <div className="box-grid box-grid-12">
              {BOXES.map((box) => {
                const active = activeBoxes[box];
                return (
                  <div
                    key={box}
                    style={{
                      background: active ? '#f8d7da' : '#d4edda',
                      color: active ? '#842029' : '#0f5132',
                      borderRadius: 6,
                      padding: '10px 8px',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      minHeight: 72,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    <div>{box}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                      {active ? `${active.batch_code}` : 'Free'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
