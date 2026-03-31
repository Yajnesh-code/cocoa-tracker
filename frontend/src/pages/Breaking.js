import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const emptyBucket = () => ({ type: 'good', weight: '', bucket_weight: '' });

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
      buckets[index].bucket_weight = '';
    }
    setForm({ ...form, buckets });
  };

  const addBucket = () => setForm({ ...form, buckets: [...form.buckets, emptyBucket()] });
  const removeBucket = (index) => {
    const buckets = form.buckets.filter((_, i) => i !== index);
    setForm({ ...form, buckets: buckets.length ? buckets : [emptyBucket()] });
  };

  const totals = form.buckets.reduce((acc, bucket) => {
    const grossWeight = bucket.weight !== '' ? Number(bucket.weight) : 0;
    const bucketWeight = bucket.bucket_weight !== '' ? Number(bucket.bucket_weight) : 0;
    const safeGross = Number.isNaN(grossWeight) ? 0 : grossWeight;
    const safeBucketWeight = Number.isNaN(bucketWeight) ? 0 : bucketWeight;
    const netWeight = Math.max(0, safeGross - safeBucketWeight);

    if (bucket.type === 'good') {
      return { good: acc.good + netWeight, bad: acc.bad };
    }
    return { good: acc.good, bad: acc.bad + netWeight };
  }, { good: 0, bad: 0 });
  const totalWet = totals.good + totals.bad;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const bucketRows = form.buckets
      .map((bucket) => ({
        type: bucket.type,
        weight: bucket.weight !== '' ? Number(bucket.weight) : null,
        bucket_weight: bucket.bucket_weight !== '' ? Number(bucket.bucket_weight) : 0,
      }))
      .filter((row) => row.weight != null);

    if (bucketRows.length === 0) {
      setError('Please provide at least one bucket entry');
      setLoading(false);
      return;
    }

    if (bucketRows.some((row) => Number.isNaN(row.weight) || Number.isNaN(row.bucket_weight))) {
      setError('Please enter valid weights for all buckets');
      setLoading(false);
      return;
    }

    if (bucketRows.some((row) => row.weight <= 0)) {
      setError('Bucket gross weight must be greater than zero');
      setLoading(false);
      return;
    }

    if (bucketRows.some((row) => row.bucket_weight < 0)) {
      setError('Empty bucket weight cannot be negative');
      setLoading(false);
      return;
    }

    if (bucketRows.some((row) => row.bucket_weight >= row.weight)) {
      setError('Empty bucket weight must be less than gross bucket weight');
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Breaking Stage</h1>
        <p>Record gross bucket weight, subtract the empty bucket weight, and save the net good and bad bean totals.</p>
      </div>
      <div style={{ maxWidth: 760 }}>
        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Select Batch *</label>
              <select name="batch_id" value={form.batch_id} onChange={handle} required>
                <option value="">Select batch...</option>
                {batches.filter((b) => !b.packed).map((b) => (
                  <option key={b.id} value={b.id}>{b.batch_code} - {b.farmer_name}</option>
                ))}
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
                    <label>Gross bucket weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bucket.weight}
                      onChange={(e) => handleBucketChange(index, 'weight', e.target.value)}
                      placeholder="e.g. 15.00"
                    />
                  </div>
                  <div>
                    <label>Empty bucket weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bucket.bucket_weight}
                      onChange={(e) => handleBucketChange(index, 'bucket_weight', e.target.value)}
                      placeholder="e.g. 1.20"
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
              <strong>Net totals after bucket weight:</strong> Good {totals.good.toFixed(2)} kg | Bad {totals.bad.toFixed(2)} kg | Wet {totalWet.toFixed(2)} kg
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Record Breaking'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
