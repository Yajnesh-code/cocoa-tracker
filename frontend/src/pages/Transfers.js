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

export default function Transfers() {
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ batch_id: '', bean_type: 'good', from_box: '', to_box: '', transfer_date: '' });
  const [transfers, setTransfers] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [dryingRecords, setDryingRecords] = useState([]);
  const [currentFermentation, setCurrentFermentation] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshFermentations = async () => {
    try {
      const result = await api.get('/fermentation');
      setFermentations(result.data.map(normalizeFermentation));
    } catch (_) {
      setFermentations([]);
    }
  };

  useEffect(() => {
    api.get('/batches').then((r) => setBatches(r.data));
    refreshFermentations();
    api.get('/drying').then((r) => setDryingRecords(r.data)).catch(() => setDryingRecords([]));
  }, []);

  const loadBatchDetails = async (batchId) => {
    if (!batchId) {
      setTransfers([]);
      setCurrentFermentation([]);
      return;
    }

    try {
      const [transferRes, fermentationRes] = await Promise.all([
        api.get(`/transfers/${batchId}`),
        api.get(`/fermentation/${batchId}`),
      ]);
      setTransfers(transferRes.data);
      setCurrentFermentation(fermentationRes.data.map(normalizeFermentation));
    } catch (_) {
      setTransfers([]);
      setCurrentFermentation([]);
    }
  };

  const handle = async (e) => {
    const updated = { ...form, [e.target.name]: e.target.value };

    if (e.target.name === 'batch_id') {
      updated.from_box = '';
      updated.to_box = '';
      await loadBatchDetails(e.target.value);
    }

    if (e.target.name === 'bean_type') {
      updated.from_box = '';
      updated.to_box = '';
    }

    setForm(updated);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/transfers', form);
      setSuccess('Transfer recorded!');
      await refreshFermentations();
      await loadBatchDetails(form.batch_id);
      setForm((f) => ({ ...f, from_box: '', to_box: '', transfer_date: '' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => (date ? date.slice(0, 10) : '');

  const occupiedBoxes = useMemo(
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

  const activeLocations = useMemo(() => {
    const current = currentFermentation.filter((item) => item.status === 'active');
    const slots = [];
    current.forEach((item) => {
      if (item.good_box_id) slots.push({ type: 'good', label: 'Good beans', box: item.good_box_id });
      if (item.bad_box_id) slots.push({ type: 'bad', label: 'Bad beans', box: item.bad_box_id });
    });
    return slots;
  }, [currentFermentation]);

  const fromOptions = activeLocations.filter((item) => item.type === form.bean_type);
  const activeDryingBatchIds = new Set(
    dryingRecords.filter((item) => !item.end_date).map((item) => String(item.batch_id))
  );
  const transferableBatches = batches.filter(
    (batch) => !batch.packed && !activeDryingBatchIds.has(String(batch.id))
  );
  const selectedBatch = batches.find((b) => String(b.id) === String(form.batch_id));
  const qrcodeUrl = selectedBatch ? `${window.location.origin}/trace/${selectedBatch.id}` : '';
  const excelUrl = selectedBatch ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/trace/${selectedBatch.id}/export` : '';

  return (
    <div>
      <div className="page-header">
        <h1>Box Transfers</h1>
        <p>Move good beans and bad beans separately between fermentation boxes. Each box can hold up to two active batches.</p>
      </div>

      <div className="grid-2">
        <div className="card no-print">
          <h2>Record Transfer</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Batch *</label>
              <select name="batch_id" value={form.batch_id} onChange={handle} required>
                <option value="">Select batch...</option>
                {transferableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Bean Type *</label>
              <select name="bean_type" value={form.bean_type} onChange={handle} required>
                <option value="good">Good beans</option>
                <option value="bad">Bad beans</option>
              </select>
            </div>
            <div className="form-group">
              <label>From Box *</label>
              <select name="from_box" value={form.from_box} onChange={handle} required>
                <option value="">Select...</option>
                {fromOptions.length === 0 ? (
                  <option value="" disabled>
                    No active {form.bean_type} beans box for this batch
                  </option>
                ) : (
                  fromOptions.map((item) => (
                    <option key={`${item.type}-${item.box}`} value={item.box}>
                      {item.box} - {item.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="form-group">
              <label>To Box *</label>
              <select name="to_box" value={form.to_box} onChange={handle} required>
                <option value="">Select...</option>
                {BOXES.filter((box) => box !== form.from_box).map((box) => {
                  const activeAssignments = occupiedBoxes[box] || [];
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
                })}
              </select>
            </div>
            <div className="form-group">
              <label>Transfer Date *</label>
              <input name="transfer_date" type="date" value={form.transfer_date} onChange={handle} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Record Transfer'}
            </button>
          </form>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2>Transfer History</h2>
            {selectedBatch ? (
              <a className="btn btn-sm btn-secondary" href={excelUrl} target="_blank" rel="noreferrer">
                Download Batch Excel
              </a>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bean Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      Select a batch to view transfers
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.bean_type === 'bad' ? 'Bad beans' : 'Good beans'}</strong></td>
                      <td><strong>{t.from_box}</strong></td>
                      <td><strong>{t.to_box}</strong></td>
                      <td>{t.transfer_date?.slice(0, 10)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3>Transfer Chamber</h3>
            <div className="box-grid box-grid-12">
              {BOXES.map((box) => {
                const activeAssignments = occupiedBoxes[box] || [];
                const occupiedCount = new Set(activeAssignments.map((item) => item.batch_id)).size;
                const highlight = box === form.from_box || box === form.to_box;
                const isFull = occupiedCount >= MAX_ACTIVE_BATCHES_PER_BOX;
                const isPartiallyUsed = occupiedCount > 0 && !isFull;

                return (
                  <div
                    key={box}
                    style={{
                      background: isFull ? '#f8d7da' : isPartiallyUsed ? '#fff3cd' : '#e9f7ef',
                      border: highlight ? '2px solid var(--primary)' : '1px solid #d1d5db',
                      color: isFull ? '#842029' : isPartiallyUsed ? '#856404' : '#0f5132',
                      borderRadius: 6,
                      padding: 10,
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      minHeight: 104,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <div>{box}</div>
                    <div style={{ marginTop: 2, fontSize: '0.72rem', fontWeight: 500 }}>
                      {occupiedCount === 0 ? 'Free' : `${occupiedCount}/${MAX_ACTIVE_BATCHES_PER_BOX} used`}
                    </div>
                    {activeAssignments.map((item) => (
                      <div key={`${item.id}-${item.beanLabel}`} style={{ fontSize: '0.68rem', wordBreak: 'break-word' }}>
                        {item.batch_code} ({item.beanLabel === 'Good beans' ? 'Good' : 'Bad'})
                      </div>
                    ))}
                    {highlight ? (
                      <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--primary-dark)' }}>
                        {box === form.from_box ? 'From' : 'To'}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedBatch ? (
        <div className="card printable" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                Professional Batch Summary
              </div>
              <h2 style={{ marginBottom: 8 }}>Transfer and Traceability Overview</h2>
              <p style={{ color: 'var(--text-muted)', maxWidth: 520 }}>
                This summary presents the current storage position for good beans and bad beans, movement history, and direct Excel export for the selected batch only.
              </p>
            </div>
            <div style={{ padding: '6px 12px', borderRadius: 999, background: '#eef6f0', color: 'var(--primary-dark)', fontWeight: 700, fontSize: '0.82rem' }}>
              {transfers.length} Transfer{transfers.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="summary-split">
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="summary-pair-grid">
                <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: '#fbfdfb' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Batch Code</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-dark)' }}>{selectedBatch.batch_code}</div>
                </div>
                <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: '#fbfdfb' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Current Boxes</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary-dark)' }}>
                    {activeLocations.length > 0
                      ? activeLocations.map((item) => `${item.label}: ${item.box}`).join(' | ')
                      : 'None'}
                  </div>
                </div>
              </div>
              <div className="summary-pair-grid">
                <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: '#fbfdfb' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Farmer</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-dark)' }}>{selectedBatch.farmer_name}</div>
                </div>
                <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: '#fbfdfb' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Location</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-dark)' }}>{selectedBatch.location}</div>
                </div>
              </div>
              <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Movement Summary</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <span>Total Transfers</span>
                    <strong>{transfers.length}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>Current Position</span>
                    <strong>{activeLocations.length > 0 ? activeLocations.map((item) => `${item.label}: ${item.box}`).join(' | ') : 'None'}</strong>
                  </div>
                </div>
              </div>
              {transfers.length > 0 ? (
                <div style={{ padding: 16, borderRadius: 12, background: '#1b4332', color: '#fff' }}>
                  <div style={{ fontSize: '0.78rem', opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Latest Transfer</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {transfers[transfers.length - 1].bean_type === 'bad' ? 'Bad beans' : 'Good beans'}: {transfers[transfers.length - 1].from_box} to {transfers[transfers.length - 1].to_box}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.88rem', opacity: 0.9 }}>
                    Recorded on {formatDate(transfers[transfers.length - 1].transfer_date)}
                  </div>
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ marginBottom: 10, fontWeight: 700 }}>Digital Trace Access</div>
              <img
                src={qrcodeUrl}
                alt="Batch QR Code"
                style={{ width: 200, height: 200, border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Scan to open the full batch traceability report for {selectedBatch.batch_code}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
