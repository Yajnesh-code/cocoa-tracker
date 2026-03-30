import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const emptyBucket = () => ({ type: 'good', weight: '' });

export default function Breaking() {
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ batch_id: '', breaking_date: '', buckets: [emptyBucket()] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/batches').then(r => setBatches(r.data)); }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleBucketChange = (index, field, value) => {
    const buckets = [...form.buckets];
    buckets[index] = { ...buckets[index], [field]: value };
    if (field === 'type') {
      buckets[index].weight = '';
    }
    setForm({ ...form, buckets });
  };

  const addBucket = () => setForm({ ...form, buckets: [...form.buckets, emptyBucket()] });
  const removeBucket = (index) => {
    const buckets = form.buckets.filter((_, i) => i !== index);
    setForm({ ...form, buckets: buckets.length ? buckets : [emptyBucket()] });
  };

  const totals = form.buckets.reduce((acc, bucket) => {
    const weight = bucket.weight !== '' ? Number(bucket.weight) : 0;
    if (bucket.type === 'good') {
      return { good: acc.good + (Number.isNaN(weight) ? 0 : weight), bad: acc.bad };
    }
    return { good: acc.good, bad: acc.bad + (Number.isNaN(weight) ? 0 : weight) };
  }, { good: 0, bad: 0 });
  const totalWet = totals.good + totals.bad;

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);

    const bucketRows = form.buckets.map(bucket => {
      const weight = bucket.weight !== '' ? Number(bucket.weight) : null;
      return bucket.type === 'good'
        ? { good_weight: weight, bad_weight: null }
        : { good_weight: null, bad_weight: weight };
    }).filter(row => row.good_weight != null || row.bad_weight != null);

    if (bucketRows.length === 0) {
      setError('Please provide at least one bucket entry');
      setLoading(false);
      return;
    }

    if (bucketRows.some(row => (row.good_weight != null && Number.isNaN(row.good_weight)) || (row.bad_weight != null && Number.isNaN(row.bad_weight)))) {
      setError('Please enter valid weights for all buckets');
      setLoading(false);
      return;
    }

    if (bucketRows.some(row => (row.good_weight != null && row.good_weight <= 0) || (row.bad_weight != null && row.bad_weight <= 0))) {
      setError('Bucket weight must be greater than zero');
      setLoading(false);
      return;
    }

    try {
      await api.post('/breaking', {
        batch_id: form.batch_id,
        breaking_date: form.breaking_date,
        buckets: bucketRows,
      });
      setSuccess('Breaking stage recorded!');
      setForm({ batch_id: '', breaking_date: '', buckets: [emptyBucket()] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>🔨 Breaking Stage</h1>
        <p>Record bucket-level good and bad bean weights after pod breaking</p>
      </div>
      <div style={{ maxWidth: 640 }}>
        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Select Batch *</label>
              <select name="batch_id" value={form.batch_id} onChange={handle} required>
                <option value="">Select batch…</option>
                {batches.filter(b => !b.packed).map(b => <option key={b.id} value={b.id}>{b.batch_code} — {b.farmer_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Breaking Date *</label>
              <input name="breaking_date" type="date" value={form.breaking_date} onChange={handle} required />
            </div>
            <div className="form-group">
              <label>Bucket weights</label>
              {form.buckets.map((bucket, index) => (
                <div key={index} className="bucket-row">
                  <div>
                    <label>Bucket type</label>
                    <select
                      value={bucket.type}
                      onChange={(e) => handleBucketChange(index, 'type', e.target.value)}
                    >
                      <option value="good">Good beans</option>
                      <option value="bad">Bad beans</option>
                    </select>
                  </div>
                  <div>
                    <label>Bucket weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bucket.weight}
                      onChange={(e) => handleBucketChange(index, 'weight', e.target.value)}
                      placeholder="e.g. 15.00"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => removeBucket(index)}
                      disabled={form.buckets.length === 1}
                    >Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-outline" onClick={addBucket} style={{ marginTop: 8 }}>
                + Add another bucket
              </button>
            </div>
            <div style={{ marginBottom: 20, color: '#333' }}>
              <strong>Totals:</strong> Good {totals.good.toFixed(2)} kg · Bad {totals.bad.toFixed(2)} kg · Wet {totalWet.toFixed(2)} kg
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : '💾 Record Breaking'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
