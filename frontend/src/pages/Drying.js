import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

export default function Drying() {
  const [batches, setBatches] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [dryingRecords, setDryingRecords] = useState([]);
  const [form, setForm] = useState({ batch_id: '', shelf_id: '', start_date: '' });
  const [completeForm, setCompleteForm] = useState({ batch_id: '', end_date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const [batchRes, fermentationRes, dryingRes] = await Promise.all([
        api.get('/batches'),
        api.get('/fermentation'),
        api.get('/drying'),
      ]);
      setBatches(batchRes.data);
      setFermentations(fermentationRes.data);
      setDryingRecords(dryingRes.data);
    } catch (_) {
      setError('Unable to load drying data');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleC = (e) => setCompleteForm({ ...completeForm, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/drying', form);
      setSuccess('Drying started!');
      setForm({ batch_id: '', shelf_id: '', start_date: '' });
      await refresh();
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
      await api.patch(`/drying/${completeForm.batch_id}/complete`, { end_date: completeForm.end_date });
      setSuccess('Drying completed!');
      setCompleteForm({ batch_id: '', end_date: '' });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const activeDryingRecords = useMemo(
    () => dryingRecords.filter((item) => !item.end_date),
    [dryingRecords]
  );
  const activeDryingBatchIds = new Set(activeDryingRecords.map((item) => String(item.batch_id)));
  const completedFermentationBatchIds = new Set(
    fermentations.filter((item) => item.status === 'completed').map((item) => String(item.batch_id))
  );

  const startableBatches = batches.filter(
    (batch) => !batch.packed && completedFermentationBatchIds.has(String(batch.id)) && !activeDryingBatchIds.has(String(batch.id))
  );
  const completableBatches = batches.filter(
    (batch) => !batch.packed && activeDryingBatchIds.has(String(batch.id))
  );

  return (
    <div>
      <div className="page-header">
        <h1>Drying Stage</h1>
        <p>Move completed fermentation batches into drying and monitor which batches are currently in drying mode.</p>
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
                <option value="">Select batch...</option>
                {startableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
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
              {loading ? 'Saving...' : 'Start Drying'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Complete Drying</h2>
          <form onSubmit={complete}>
            <div className="form-group">
              <label>Batch *</label>
              <select name="batch_id" value={completeForm.batch_id} onChange={handleC} required>
                <option value="">Select batch...</option>
                {completableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Drying End Date *</label>
              <input name="end_date" type="date" value={completeForm.end_date} onChange={handleC} required />
            </div>
            <button className="btn btn-accent" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Complete Drying'}
            </button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Currently In Drying</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch Code</th>
                <th>Farmer</th>
                <th>Shelf</th>
                <th>Start Date</th>
              </tr>
            </thead>
            <tbody>
              {activeDryingRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No batches are currently in drying mode
                  </td>
                </tr>
              ) : (
                activeDryingRecords.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.batch_code}</strong></td>
                    <td>{item.farmer_name}</td>
                    <td>{item.shelf_id}</td>
                    <td>{item.start_date?.slice(0, 10)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
