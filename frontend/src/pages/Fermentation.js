import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap((letter) => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

const MAX_ACTIVE_BATCHES_PER_BOX = 2;

function parseBoxList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeFermentation(record) {
  const goodBoxes = parseBoxList(record.good_box_ids || record.good_box_id || (!record.bad_box_id ? record.box_id : ''));
  const badBoxes = parseBoxList(record.bad_box_ids || record.bad_box_id);
  return {
    ...record,
    good_box_id: goodBoxes.join(', '),
    bad_box_id: badBoxes.join(', '),
    good_box_ids: goodBoxes,
    bad_box_ids: badBoxes,
  };
}

function readMultiSelectValues(event) {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

export default function Fermentation() {
  const [batches, setBatches] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [dryingRecords, setDryingRecords] = useState([]);
  const [form, setForm] = useState({ batch_id: '', good_box_ids: [], bad_box_ids: [], start_date: '' });
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
      try {
        const dryingRes = await api.get('/drying');
        setDryingRecords(dryingRes.data);
      } catch (_) {
        setDryingRecords([]);
      }
    } catch (_) {
      setError('Unable to load fermentation data');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleMulti = (e) => setForm({ ...form, [e.target.name]: readMultiSelectValues(e) });
  const handleC = (e) => setCompleteForm({ ...completeForm, [e.target.name]: e.target.value });

  const activeBoxes = useMemo(
    () => fermentations
      .filter((item) => item.status === 'active')
      .reduce((map, item) => {
        item.good_box_ids.forEach((box) => {
          if (!map[box]) map[box] = [];
          map[box].push({ ...item, beanLabel: 'Good beans' });
        });
        item.bad_box_ids.forEach((box) => {
          if (!map[box]) map[box] = [];
          map[box].push({ ...item, beanLabel: 'Bad beans' });
        });
        return map;
      }, {}),
    [fermentations]
  );

  const activeDryingBatchIds = new Set(
    dryingRecords.filter((item) => !item.end_date).map((item) => String(item.batch_id))
  );
  const activeFermentationBatchIds = new Set(
    fermentations.filter((item) => item.status === 'active').map((item) => String(item.batch_id))
  );
  const startableBatches = batches.filter(
    (batch) => !batch.packed && !activeDryingBatchIds.has(String(batch.id)) && !activeFermentationBatchIds.has(String(batch.id))
  );
  const completableBatches = batches.filter(
    (batch) => !batch.packed && activeFermentationBatchIds.has(String(batch.id)) && !activeDryingBatchIds.has(String(batch.id))
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/fermentation', {
        batch_id: form.batch_id,
        good_box_ids: form.good_box_ids,
        bad_box_ids: form.bad_box_ids,
        start_date: form.start_date,
      });
      setSuccess('Fermentation started!');
      setForm({ batch_id: '', good_box_ids: [], bad_box_ids: [], start_date: '' });
      await refresh();
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || 'Failed');
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
      setError((err.response && err.response.data && err.response.data.error) || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const renderBoxOptions = () => (
    BOXES.map((box) => {
      const activeAssignments = activeBoxes[box] || [];
      const occupiedCount = new Set(activeAssignments.map((item) => item.batch_id)).size;
      const disabled = occupiedCount >= MAX_ACTIVE_BATCHES_PER_BOX;

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
        <p>Assign one batch into multiple fermentation boxes for good beans and bad beans. Each box can still hold up to two active batches.</p>
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
                {startableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Good Beans Boxes</label>
              <select name="good_box_ids" value={form.good_box_ids} onChange={handleMulti} multiple size={6}>
                {renderBoxOptions()}
              </select>
              <small style={{ color: 'var(--text-muted)' }}>Hold Ctrl or Cmd to choose multiple boxes.</small>
            </div>
            <div className="form-group">
              <label>Bad Beans Boxes</label>
              <select name="bad_box_ids" value={form.bad_box_ids} onChange={handleMulti} multiple size={6}>
                {renderBoxOptions()}
              </select>
              <small style={{ color: 'var(--text-muted)' }}>Leave empty if this batch has no bad beans boxes.</small>
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
                {completableBatches.map((b) => (
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
                      minHeight: 116,
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
                      <div key={`${item.id}-${item.beanLabel}-${box}`} style={{ fontSize: '0.68rem', wordBreak: 'break-word' }}>
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
