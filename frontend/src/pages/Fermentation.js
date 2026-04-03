import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap((letter) => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

const MAX_ACTIVE_BATCHES_PER_BOX = 2;

function normalizeFermentation(record) {
  return {
    ...record,
    good_box_id: record.good_box_id || (!record.bad_box_id ? record.box_id : ''),
    bad_box_id: record.bad_box_id || '',
  };
}

export default function Fermentation() {
  const [batches, setBatches] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [form, setForm] = useState({ batch_id: '', good_box_id: '', bad_box_id: '', start_date: '' });
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
      setFermentations(fermentationRes.data.map(normalizeFermentation));
    } catch (_) {
      setError('Unable to load fermentation data');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleC = (e) => setCompleteForm({ ...completeForm, [e.target.name]: e.target.value });

  const activeBoxes = useMemo(
    () => fermentations
      .filter((item) => item.status === 'active')
      .reduce((map, item) => {
        [
          item.good_box_id ? { box: item.good_box_id, label: 'Good beans' } : null,
          item.bad_box_id ? { box: item.bad_box_id, label: 'Bad beans' } : null,
        ]
          .filter(Boolean)
          .forEach((entry) => {
            if (!map[entry.box]) map[entry.box] = [];
            map[entry.box].push({ ...item, beanLabel: entry.label });
          });
        return map;
      }, {}),
    [fermentations]
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/fermentation', {
        batch_id: form.batch_id,
        good_box_id: form.good_box_id || null,
        bad_box_id: form.bad_box_id || null,
        start_date: form.start_date,
      });
      setSuccess('Fermentation started!');
      setForm({ batch_id: '', good_box_id: '', bad_box_id: '', start_date: '' });
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
      await api.patch(`/fermentation/${completeForm.batch_id}/complete`, { end_date: completeForm.end_date });
      setSuccess('Fermentation completed!');
      setCompleteForm({ batch_id: '', end_date: '' });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const renderBoxOptions = (selectedOtherBox) => (
    BOXES.map((box) => {
      const activeAssignments = activeBoxes[box] || [];
      const occupiedCount = new Set(activeAssignments.map((item) => item.batch_id)).size;
      const disabled = occupiedCount >= MAX_ACTIVE_BATCHES_PER_BOX && box !== selectedOtherBox;

      return (
        <option key={box} value={box} disabled={disabled}>
          {box}
          {occupiedCount > 0 ? ` - ${occupiedCount}/${MAX_ACTIVE_BATCHES_PER_BOX} used` : ''}
          {activeAssignments.length > 0
            ? ` (${activeAssignments.map((item) => `${item.batch_code} ${item.beanLabel}`).join(', ')})`
            : ''}
        </option>
      );
    })
  );

  return (
    <div>
      <div className="page-header">
        <h1>Fermentation</h1>
        <p>Assign good beans and bad beans for the same batch into fermentation boxes A1-E12. Each box can hold up to two active batches.</p>
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
              <label>Good Beans Box</label>
              <select name="good_box_id" value={form.good_box_id} onChange={handle}>
                <option value="">Not assigned</option>
                {renderBoxOptions(form.bad_box_id)}
              </select>
            </div>
            <div className="form-group">
              <label>Bad Beans Box</label>
              <select name="bad_box_id" value={form.bad_box_id} onChange={handle}>
                <option value="">Not assigned</option>
                {renderBoxOptions(form.good_box_id)}
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
                const activeAssignments = activeBoxes[box] || [];
                const occupiedCount = new Set(activeAssignments.map((item) => item.batch_id)).size;
                const isFull = occupiedCount >= MAX_ACTIVE_BATCHES_PER_BOX;
                const isPartiallyUsed = occupiedCount > 0 && !isFull;

                return (
                  <div
                    key={box}
                    style={{
                      background: isFull ? '#f8d7da' : isPartiallyUsed ? '#fff3cd' : '#d4edda',
                      color: isFull ? '#842029' : isPartiallyUsed ? '#856404' : '#0f5132',
                      borderRadius: 6,
                      padding: '10px 8px',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      minHeight: 108,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <div>{box}</div>
                    <div style={{ fontSize: '0.72rem' }}>
                      {occupiedCount === 0 ? 'Free' : `${occupiedCount}/${MAX_ACTIVE_BATCHES_PER_BOX} used`}
                    </div>
                    {activeAssignments.map((item) => (
                      <div key={`${item.id}-${item.beanLabel}`} style={{ fontSize: '0.68rem', wordBreak: 'break-word' }}>
                        {item.batch_code} ({item.beanLabel === 'Good beans' ? 'Good' : 'Bad'})
                      </div>
                    ))}
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
