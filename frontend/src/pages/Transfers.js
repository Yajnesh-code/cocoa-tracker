import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const BOXES = Array.from({ length: 5 }, (_, row) => String.fromCharCode(65 + row))
  .flatMap(letter => Array.from({ length: 12 }, (_, col) => `${letter}${col + 1}`));

export default function Transfers() {
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ batch_id: '', from_box: '', to_box: '', transfer_date: '' });
  const [transfers, setTransfers] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [currentFermentation, setCurrentFermentation] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshFermentations = async () => {
    try {
      const result = await api.get('/fermentation');
      setFermentations(result.data);
    } catch (_) {
      setFermentations([]);
    }
  };

  useEffect(() => {
    api.get('/batches').then((r) => setBatches(r.data));
    refreshFermentations();
  }, []);

  const handle = (e) => {
    const updated = { ...form, [e.target.name]: e.target.value };
    setForm(updated);

    if (e.target.name === 'batch_id') {
      if (!e.target.value) {
        setTransfers([]);
        setCurrentFermentation([]);
        return;
      }

      Promise.all([
        api.get(`/transfers/${e.target.value}`),
        api.get(`/fermentation/${e.target.value}`),
      ])
        .then(([transferRes, fermentationRes]) => {
          setTransfers(transferRes.data);
          setCurrentFermentation(fermentationRes.data);
        })
        .catch(() => {
          setTransfers([]);
          setCurrentFermentation([]);
        });
    }
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
      const [transferRes, fermentationRes] = await Promise.all([
        api.get(`/transfers/${form.batch_id}`),
        api.get(`/fermentation/${form.batch_id}`),
      ]);
      setTransfers(transferRes.data);
      setCurrentFermentation(fermentationRes.data);
      setForm((f) => ({ ...f, from_box: '', to_box: '', transfer_date: '' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => (date ? date.slice(0, 10) : '');

  const occupiedBoxes = fermentations
    .filter((f) => f.status === 'active')
    .reduce((map, f) => {
      map[f.box_id] = f;
      return map;
    }, {});

  const batchBoxes = currentFermentation
    .filter((f) => f.status === 'active')
    .reduce((map, f) => {
      map[f.box_id] = f;
      return map;
    }, {});

  const selectedBatch = batches.find((b) => String(b.id) === String(form.batch_id));
  const qrcodeUrl = selectedBatch ? `${window.location.origin}/trace/${selectedBatch.id}` : '';

  return (
    <div>
      <div className="page-header">
        <h1>Box Transfers</h1>
        <p>Record cocoa movement between fermentation boxes and visualize chamber transfers.</p>
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
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {b.farmer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>From Box *</label>
              <select name="from_box" value={form.from_box} onChange={handle} required>
                <option value="">Select...</option>
                {Object.keys(batchBoxes).length === 0 ? (
                  <option value="" disabled>
                    No active box for this batch
                  </option>
                ) : (
                  Object.keys(batchBoxes).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="form-group">
              <label>To Box *</label>
              <select name="to_box" value={form.to_box} onChange={handle} required>
                <option value="">Select...</option>
                {BOXES.filter((b) => b !== form.from_box).map((b) => {
                  const occupied = occupiedBoxes[b];
                  return (
                    <option key={b} value={b} disabled={Boolean(occupied)}>
                      {b}
                      {occupied ? ' - occupied' : ''}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2>Transfer History</h2>
            <div style={{ display: 'flex', gap: 8 }} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      Select a batch to view transfers
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.from_box}</strong>
                      </td>
                      <td>
                        <strong>{t.to_box}</strong>
                      </td>
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
                const active = Boolean(occupiedBoxes[box]);
                const highlight = box === form.from_box || box === form.to_box;
                return (
                  <div
                    key={box}
                    style={{
                      background: active ? '#f8d7da' : '#e9f7ef',
                      border: highlight ? '2px solid #0d6efd' : '1px solid #d1d5db',
                      color: active ? '#842029' : '#0f5132',
                      borderRadius: 6,
                      padding: 10,
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      minHeight: 70,
                    }}
                  >
                    <div>{box}</div>
                    <div style={{ marginTop: 6, fontSize: '0.75rem', fontWeight: 500 }}>
                      {active ? 'Occupied' : 'Free'}
                    </div>
                    {highlight && (
                      <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#0d6efd' }}>
                        {box === form.from_box ? 'From' : 'To'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedBatch && (
        <div className="card printable" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                Professional Batch Summary
              </div>
              <h2 style={{ marginBottom: 8 }}>Transfer and Traceability Overview</h2>
              <p style={{ color: 'var(--text-muted)', maxWidth: 520 }}>
                This summary presents the current storage position, movement history, and quick-access trace link for the selected batch.
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
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Active Box</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-dark)' }}>{Object.keys(batchBoxes).join(', ') || 'None'}</div>
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
                    <strong>{Object.keys(batchBoxes).join(', ') || 'None'}</strong>
                  </div>
                </div>
              </div>
              {transfers.length > 0 && (
                <div style={{ padding: 16, borderRadius: 12, background: '#1b4332', color: '#fff' }}>
                  <div style={{ fontSize: '0.78rem', opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Latest Transfer</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {transfers[transfers.length - 1].from_box} to {transfers[transfers.length - 1].to_box}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.88rem', opacity: 0.9 }}>
                    Recorded on {formatDate(transfers[transfers.length - 1].transfer_date)}
                  </div>
                </div>
              )}
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
      )}
    </div>
  );
}
