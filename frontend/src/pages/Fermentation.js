import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap((letter) => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

const MAX_ACTIVE_BATCHES_PER_BOX = 5;

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

export default function Fermentation() {
  const [batches, setBatches] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [dryingRecords, setDryingRecords] = useState([]);
  const [form, setForm] = useState({ batch_id: '', good_box_ids: [], bad_box_ids: [], start_date: '' });
  const [picker, setPicker] = useState({ good_box: '', bad_box: '' });
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
  const handlePicker = (e) => setPicker({ ...picker, [e.target.name]: e.target.value });
  const handleC = (e) => setCompleteForm({ ...completeForm, [e.target.name]: e.target.value });
  const formatDate = (date) => (date ? String(date).slice(0, 10) : 'Not set');

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
      setPicker({ good_box: '', bad_box: '' });
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

  const addBox = (type) => {
    const pickerKey = type === 'good' ? 'good_box' : 'bad_box';
    const formKey = type === 'good' ? 'good_box_ids' : 'bad_box_ids';
    const value = picker[pickerKey];
    if (!value) return;
    if (form[formKey].includes(value)) {
      setPicker({ ...picker, [pickerKey]: '' });
      return;
    }
    setForm({ ...form, [formKey]: [...form[formKey], value] });
    setPicker({ ...picker, [pickerKey]: '' });
  };

  const removeBox = (type, box) => {
    const formKey = type === 'good' ? 'good_box_ids' : 'bad_box_ids';
    setForm({ ...form, [formKey]: form[formKey].filter((item) => item !== box) });
  };

  const renderSelectedBoxes = (type) => {
    const formKey = type === 'good' ? 'good_box_ids' : 'bad_box_ids';
    const items = form[formKey];
    if (items.length === 0) {
      return <div className="fermentation-empty-selection">No boxes selected yet</div>;
    }

    return (
      <div className="fermentation-selected-boxes">
        {items.map((box) => (
          <span key={`${type}-${box}`} className={`fermentation-selected-chip fermentation-selected-chip-${type}`}>
            {box}
            <button
              type="button"
              onClick={() => removeBox(type, box)}
              className="fermentation-selected-chip-remove"
            >
              x
            </button>
          </span>
        ))}
      </div>
    );
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
        <p>Assign one batch into multiple fermentation boxes for good beans and bad beans. Each box can now hold up to five active batches.</p>
      </div>

      <div className="grid-2">
        <div className="card fermentation-card">
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
              <div className="fermentation-picker-row">
                <select name="good_box" value={picker.good_box} onChange={handlePicker} className="fermentation-picker-select">
                  <option value="">Select box...</option>
                  {renderBoxOptions()}
                </select>
                <button className="btn btn-secondary fermentation-picker-button" type="button" onClick={() => addBox('good')}>
                  Add Box
                </button>
              </div>
              <small className="compact-help">Add one or more boxes for good beans.</small>
              {renderSelectedBoxes('good')}
            </div>
            <div className="form-group">
              <label>Bad Beans Boxes</label>
              <div className="fermentation-picker-row">
                <select name="bad_box" value={picker.bad_box} onChange={handlePicker} className="fermentation-picker-select">
                  <option value="">Select box...</option>
                  {renderBoxOptions()}
                </select>
                <button className="btn btn-secondary fermentation-picker-button" type="button" onClick={() => addBox('bad')}>
                  Add Box
                </button>
              </div>
              <small className="compact-help">Leave empty if this batch has no bad beans boxes.</small>
              {renderSelectedBoxes('bad')}
            </div>
            <div className="form-group">
              <label>Starting Fermentation Date *</label>
              <input name="start_date" type="date" value={form.start_date} onChange={handle} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Start Fermentation'}
            </button>
          </form>
        </div>

        <div className="card fermentation-card">
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

          <div className="fermentation-chamber">
            <div className="fermentation-chamber-header">
              <div>
                <h2>Fermentation Chamber</h2>
                <p>Live box occupancy with farmer batches and starting fermentation dates.</p>
              </div>
              <div className="fermentation-legend">
                <span className="fermentation-legend-pill fermentation-legend-pill-free">Free</span>
                <span className="fermentation-legend-pill fermentation-legend-pill-active">In Use</span>
                <span className="fermentation-legend-pill fermentation-legend-pill-full">Full</span>
              </div>
            </div>

            <div className="fermentation-chamber-summary">
              <div className="fermentation-summary-pill">60 total boxes</div>
              <div className="fermentation-summary-pill">Up to 5 active batch entries per box</div>
              <div className="fermentation-summary-pill">Shows farmer, bean type, and start date</div>
            </div>

            <div className="fermentation-chamber-grid">
              {BOXES.map((box) => {
                const activeAssignments = activeBoxes[box] || [];
                const occupiedCount = new Set(activeAssignments.map((item) => item.batch_id)).size;
                const isFull = occupiedCount >= MAX_ACTIVE_BATCHES_PER_BOX;
                const isPartiallyUsed = occupiedCount > 0 && !isFull;
                const stateClass = isFull
                  ? 'fermentation-box-card-full'
                  : isPartiallyUsed
                    ? 'fermentation-box-card-active'
                    : 'fermentation-box-card-free';

                return (
                  <article key={box} className={`fermentation-box-card ${stateClass}`}>
                    <div className="fermentation-box-top">
                      <div>
                        <div className="fermentation-box-name">{box}</div>
                        <div className="fermentation-box-usage">
                          {occupiedCount === 0 ? 'Free now' : `${occupiedCount}/${MAX_ACTIVE_BATCHES_PER_BOX} used`}
                        </div>
                      </div>
                      <span className="fermentation-box-status">
                        {isFull ? 'Full' : isPartiallyUsed ? 'Active' : 'Open'}
                      </span>
                    </div>

                    {activeAssignments.length === 0 ? (
                      <div className="fermentation-box-empty">
                        Chamber ready for the next farmer beans batch.
                      </div>
                    ) : (
                      <div className="fermentation-box-list">
                        {activeAssignments.map((item) => (
                          <div key={`${item.id}-${item.beanLabel}-${box}`} className="fermentation-box-entry">
                            <div className="fermentation-box-entry-head">
                              <strong>{item.batch_code}</strong>
                              <span>{item.beanLabel === 'Good beans' ? 'Good beans' : 'Bad beans'}</span>
                            </div>
                            <div className="fermentation-box-entry-farmer">{item.farmer_name}</div>
                            <div className="fermentation-box-entry-date">
                              Starting fermentation date: {formatDate(item.start_date)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
