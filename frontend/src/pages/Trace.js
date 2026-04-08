import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';

const formatDate = (value) => (value ? value.slice(0, 10) : 'Not recorded');
const formatWeightValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toFixed(2);
};
const formatWeight = (value) => {
  const formatted = formatWeightValue(value);
  return formatted !== null ? `${formatted} kg` : 'Not recorded';
};

function getBucketDetails(breaking) {
  if (!breaking?.bucket_details) return [];

  try {
    const parsed = typeof breaking.bucket_details === 'string'
      ? JSON.parse(breaking.bucket_details)
      : breaking.bucket_details;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeFermentation(item) {
  return {
    ...item,
    good_box_id: item.good_box_id || (!item.bad_box_id ? item.box_id : ''),
    bad_box_id: item.bad_box_id || '',
  };
}

function formatFermentationBoxes(item) {
  const parts = [];
  if (item.good_box_id) parts.push(`Good beans: ${item.good_box_id}`);
  if (item.bad_box_id) parts.push(`Bad beans: ${item.bad_box_id}`);
  return parts.join(' | ') || 'No box assigned';
}

export default function Trace() {
  const { batch_id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/trace/${batch_id}`)
      .then((response) => setData(response.data))
      .catch(() => setError('Batch not found or traceability data unavailable.'));
  }, [batch_id]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 10 }}>Trace Record Not Found</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const { batch, breaking, fermentation, transfers, drying, moisture_logs, packing } = data;
  const normalizedFermentation = fermentation.map(normalizeFermentation);
  const isPacked = Boolean(packing);
  const exportUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/trace/${batch.id}/export`;
  const qrUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/trace/${batch.id}/qrcode`;
  const activeBoxes = normalizedFermentation
    .filter((item) => item.status === 'active')
    .map((item) => formatFermentationBoxes(item))
    .join(' | ') || 'None';
  const bucketDetails = getBucketDetails(breaking);
  const handlePrint = () => window.print();
  const totalCollectedWeight = Number(batch.pod_weight || 0) + Number(batch.bad_pod_weight || 0);
  const farmerCollectedWeight = Number(batch.farmer_pod_weight || 0) + Number(batch.farmer_bad_pod_weight || 0);
  const reportHighlights = [
    { label: 'Batch Code', value: batch.batch_code },
    { label: 'Farmer', value: batch.farmer_name },
    { label: 'Location', value: batch.location },
    { label: 'Collection Date', value: formatDate(batch.pod_date) },
    { label: 'Current Box', value: activeBoxes },
    { label: 'Transfer Count', value: String(transfers.length) },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 16px' }}>
      <style>{`
        .print-only { display: none; }
        .report-grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .report-stat { padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: #fff; }
        .report-stat-label { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
        .report-stat-value { font-size: 1rem; font-weight: 700; color: var(--primary-dark); }
        .report-table { width: 100%; border-collapse: collapse; }
        .report-table th, .report-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; font-size: 0.9rem; }
        .report-table th { background: #eef6f0; color: var(--primary-dark); }

        @media (max-width: 700px) {
          .report-grid { grid-template-columns: 1fr; }
        }

        @media print {
          body { background: #fff; color: #111827; }
          .page-header, .btn, .btn-sm, .btn-outline, .btn-secondary, .no-print, .screen-only { display: none !important; }
          .card { border: 1px solid #d1d5db !important; box-shadow: none !important; background: #fff !important; break-inside: avoid; }
          .print-only { display: block !important; }
          .print-report { padding: 28px !important; border: 1px solid #cbd5e1 !important; }
          .print-report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #1b4332; }
          .print-report-brand { display: flex; align-items: center; gap: 14px; }
          .print-report-brand img { width: 58px !important; height: 58px !important; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 12px; padding: 4px; background: #fff; margin: 0 !important; }
          .print-report-title { font-size: 1.75rem; font-weight: 700; color: #1b4332; margin-bottom: 6px; }
          .print-report-subtitle { font-size: 0.92rem; color: #475569; }
          .print-report-badge { display: inline-block; margin-top: 10px; padding: 6px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #e8f3ec; color: #1b4332; }
          .print-report-qr { text-align: center; min-width: 170px; }
          .print-report-qr img { width: 130px !important; height: 130px !important; margin: 0 auto 8px !important; display: block; }
          .print-section { margin-top: 20px; }
          .print-section-title { font-size: 0.95rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #1b4332; margin-bottom: 12px; }
          .print-key-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
          .print-key-item { padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
          .print-key-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 4px; }
          .print-key-value { font-size: 0.92rem; font-weight: 600; color: #0f172a; }
          .print-stage-grid { display: grid; gap: 10px; }
          .print-stage-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
          .print-stage-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
          .print-stage-name { font-weight: 700; color: #0f172a; }
          .print-stage-meta { font-size: 0.83rem; color: #475569; }
          .print-inline-list { display: grid; gap: 8px; }
          .print-inline-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #eef2f7; font-size: 0.88rem; }
          .print-inline-row:last-child { border-bottom: none; }
          .print-note { margin-top: 18px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 0.82rem; color: #64748b; }
        }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="screen-only" style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--primary-dark)' }}>Cocoa Traceability Report</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Batch <strong>{batch.batch_code}</strong>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: '0.85rem',
                fontWeight: 700,
                background: isPacked ? '#d4edda' : '#d1ecf1',
                color: isPacked ? '#0f5132' : '#0c5460',
              }}
            >
              {isPacked ? 'Packed' : 'In Progress'}
            </span>
            <a href={exportUrl} className="btn btn-sm btn-secondary" target="_blank" rel="noreferrer">
              Download Excel Report
            </a>
            <button className="btn btn-sm btn-outline" type="button" onClick={handlePrint}>
              Print Summary
            </button>
          </div>
        </div>

        <div className="screen-only card">
          <h2>Report Highlights</h2>
          <div className="report-grid" style={{ marginTop: 16 }}>
            {reportHighlights.map((item) => (
              <div key={item.label} className="report-stat">
                <div className="report-stat-label">{item.label}</div>
                <div className="report-stat-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="screen-only card">
          <h2>Farmer Details</h2>
          <div className="detail-grid">
            <div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Farmer Code</div><strong>{batch.farmer_code}</strong></div>
            <div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Name</div><strong>{batch.farmer_name}</strong></div>
            <div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Location</div><strong>{batch.location}</strong></div>
          </div>
        </div>

        <div className="screen-only card">
          <h2>Batch QR Code</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Scan this code to open the current batch trace summary page.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img
              src={qrUrl}
              alt="Batch QR Code"
              style={{ width: 220, height: 220, border: '1px solid var(--border)', borderRadius: 12 }}
            />
          </div>
        </div>

        <div className="screen-only card">
          <h2>Processing Timeline</h2>
          <div className="timeline">
            <div className="timeline-item">
              <h4>Pod Collection</h4>
              <p>
                Date: {formatDate(batch.pod_date)} | Farmer good: {formatWeight(batch.farmer_pod_weight)} | Farmer bad: {formatWeight(batch.farmer_bad_pod_weight)}
                {' | '}Farmer total: {formatWeight(farmerCollectedWeight)}
              </p>
              <p>
                Company good: {formatWeight(batch.pod_weight)} | Company bad: {formatWeight(batch.bad_pod_weight)}
                {' | '}Company total: {formatWeight(totalCollectedWeight)}
              </p>
            </div>

            {breaking && (
              <div className="timeline-item">
                <h4>Breaking</h4>
                <p>
                  Date: {formatDate(breaking.breaking_date)} | Wet weight: {formatWeight(breaking.wet_weight)}
                  {breaking.good_weight != null && ` | Good: ${formatWeightValue(breaking.good_weight)} kg`}
                  {breaking.bad_weight != null && ` | Bad: ${formatWeightValue(breaking.bad_weight)} kg`}
                </p>
                {bucketDetails.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <strong style={{ display: 'block', marginBottom: 10 }}>Bucket breakdown</strong>
                    <div style={{ display: 'grid', gap: 10, padding: 14, background: '#111827', borderRadius: 14, color: '#f8fafc' }}>
                      {bucketDetails.map((bucket, index) => {
                        const good = bucket.good_weight != null ? `Good: ${formatWeightValue(bucket.good_weight)} kg` : null;
                        const bad = bucket.bad_weight != null ? `Bad: ${formatWeightValue(bucket.bad_weight)} kg` : null;
                        return (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#1f2937' }}>
                            <span>Bucket {index + 1}</span>
                            <span style={{ fontWeight: 700 }}>{good || bad || 'No weight recorded'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {normalizedFermentation && normalizedFermentation.length > 0 && (
              <div className="timeline-item">
                <h4>Fermentation</h4>
                {normalizedFermentation.map((item) => (
                  <p key={item.id || `${item.good_box_id}-${item.bad_box_id}-${item.start_date}`}>
                    {formatFermentationBoxes(item)} | Start: {formatDate(item.start_date)}
                    {item.end_date && ` | End: ${formatDate(item.end_date)}`}
                    {' | '}Status: <span className={`badge badge-${item.status}`}>{item.status}</span>
                    {item.good_weight != null && ` | Good: ${formatWeightValue(item.good_weight)} kg`}
                    {item.bad_weight != null && ` | Bad: ${formatWeightValue(item.bad_weight)} kg`}
                  </p>
                ))}
              </div>
            )}

            {transfers.length > 0 && (
              <div className="timeline-item">
                <h4>Box Transfers ({transfers.length})</h4>
                {transfers.map((item) => (
                  <p key={item.id || `${item.bean_type}-${item.from_box}-${item.to_box}-${item.transfer_date}`}>
                    {(item.bean_type === 'bad' ? 'Bad beans' : 'Good beans')} moved from {item.from_box} to {item.to_box} on {formatDate(item.transfer_date)}
                  </p>
                ))}
              </div>
            )}

            {drying && (
              <div className="timeline-item">
                <h4>Drying</h4>
                <p>
                  Shelf: {drying.shelf_id} | Start: {formatDate(drying.start_date)}
                  {drying.end_date && ` | End: ${formatDate(drying.end_date)}`}
                </p>
              </div>
            )}

            {moisture_logs.length > 0 && (
              <div className="timeline-item">
                <h4>Moisture Readings ({moisture_logs.length} days)</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {moisture_logs.map((item, index) => (
                    <span
                      key={item.id || index}
                      style={{
                        background: item.moisture_pct > 15 ? '#fff3cd' : '#d4edda',
                        color: item.moisture_pct > 15 ? '#856404' : '#155724',
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      Day {index + 1}: {formatWeightValue(item.moisture_pct)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {packing && (
              <div className="timeline-item">
                <h4>Packing</h4>
                <p>Date: {formatDate(packing.packing_date)} | Final weight: {formatWeight(packing.final_weight)} | Bags: {packing.bag_count}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card print-only print-report" style={{ display: 'none' }}>
          <div className="print-report-header">
            <div className="print-report-brand">
              <img src="/solemulelogo.png" alt="Company logo" />
              <div>
                <div className="print-report-title">Batch Traceability Summary</div>
                <div className="print-report-subtitle">Professional traceability record for cocoa batch processing and movement.</div>
                <div className="print-report-badge">{isPacked ? 'Packed Batch' : 'Batch In Progress'}</div>
              </div>
            </div>
            <div className="print-report-qr">
              <img src={qrUrl} alt="Batch QR Code" />
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Scan for digital record</div>
            </div>
          </div>

          <div className="print-section">
            <div className="print-section-title">Batch Overview</div>
            <div className="print-key-grid">
              <div className="print-key-item"><div className="print-key-label">Batch Code</div><div className="print-key-value">{batch.batch_code}</div></div>
              <div className="print-key-item"><div className="print-key-label">Farmer</div><div className="print-key-value">{batch.farmer_name}</div></div>
              <div className="print-key-item"><div className="print-key-label">Farmer Code</div><div className="print-key-value">{batch.farmer_code}</div></div>
              <div className="print-key-item"><div className="print-key-label">Location</div><div className="print-key-value">{batch.location}</div></div>
              <div className="print-key-item"><div className="print-key-label">Collection Date</div><div className="print-key-value">{formatDate(batch.pod_date)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Farmer Good Weight</div><div className="print-key-value">{formatWeight(batch.farmer_pod_weight)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Farmer Bad Weight</div><div className="print-key-value">{formatWeight(batch.farmer_bad_pod_weight)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Farmer Total Weight</div><div className="print-key-value">{formatWeight(farmerCollectedWeight)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Company Good Weight</div><div className="print-key-value">{formatWeight(batch.pod_weight)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Company Bad Weight</div><div className="print-key-value">{formatWeight(batch.bad_pod_weight)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Company Total Weight</div><div className="print-key-value">{formatWeight(totalCollectedWeight)}</div></div>
              <div className="print-key-item"><div className="print-key-label">Active Box(es)</div><div className="print-key-value">{activeBoxes}</div></div>
            </div>
          </div>

          <div className="print-section">
            <div className="print-section-title">Processing Stages</div>
            <div className="print-stage-grid">
              <div className="print-stage-card">
                <div className="print-stage-head">
                  <div className="print-stage-name">Pod Collection</div>
                  <div className="print-stage-meta">{formatDate(batch.pod_date)}</div>
                </div>
                <div className="print-inline-list">
                  <div className="print-inline-row"><span>Farmer good weight</span><strong>{formatWeight(batch.farmer_pod_weight)}</strong></div>
                  <div className="print-inline-row"><span>Farmer bad weight</span><strong>{formatWeight(batch.farmer_bad_pod_weight)}</strong></div>
                  <div className="print-inline-row"><span>Farmer total weight</span><strong>{formatWeight(farmerCollectedWeight)}</strong></div>
                  <div className="print-inline-row"><span>Company good weight</span><strong>{formatWeight(batch.pod_weight)}</strong></div>
                  <div className="print-inline-row"><span>Company bad weight</span><strong>{formatWeight(batch.bad_pod_weight)}</strong></div>
                  <div className="print-inline-row"><span>Company total weight</span><strong>{formatWeight(totalCollectedWeight)}</strong></div>
                </div>
              </div>

              {breaking && (
                <div className="print-stage-card">
                  <div className="print-stage-head">
                    <div className="print-stage-name">Breaking</div>
                    <div className="print-stage-meta">{formatDate(breaking.breaking_date)}</div>
                  </div>
                  <div className="print-inline-list">
                    <div className="print-inline-row"><span>Wet weight</span><strong>{formatWeight(breaking.wet_weight)}</strong></div>
                    <div className="print-inline-row"><span>Good beans</span><strong>{formatWeight(breaking.good_weight)}</strong></div>
                    <div className="print-inline-row"><span>Bad beans</span><strong>{formatWeight(breaking.bad_weight)}</strong></div>
                  </div>
                </div>
              )}

              {normalizedFermentation && normalizedFermentation.length > 0 && (
                <div className="print-stage-card">
                  <div className="print-stage-head">
                    <div className="print-stage-name">Fermentation</div>
                    <div className="print-stage-meta">{normalizedFermentation.length} record(s)</div>
                  </div>
                  <div className="print-inline-list">
                    {normalizedFermentation.map((item) => (
                      <div className="print-inline-row" key={item.id || `${item.good_box_id}-${item.bad_box_id}-${item.start_date}`}>
                        <span>{formatFermentationBoxes(item)} | {formatDate(item.start_date)}{item.end_date ? ` to ${formatDate(item.end_date)}` : ''}</span>
                        <strong>{item.status}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {transfers.length > 0 && (
                <div className="print-stage-card">
                  <div className="print-stage-head">
                    <div className="print-stage-name">Transfers</div>
                    <div className="print-stage-meta">{transfers.length} movement(s)</div>
                  </div>
                  <div className="print-inline-list">
                    {transfers.map((item) => (
                      <div className="print-inline-row" key={item.id || `${item.bean_type}-${item.from_box}-${item.to_box}-${item.transfer_date}`}>
                        <span>{item.bean_type === 'bad' ? 'Bad beans' : 'Good beans'}: {item.from_box} to {item.to_box}</span>
                        <strong>{formatDate(item.transfer_date)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {drying && (
                <div className="print-stage-card">
                  <div className="print-stage-head">
                    <div className="print-stage-name">Drying</div>
                    <div className="print-stage-meta">{drying.shelf_id}</div>
                  </div>
                  <div className="print-inline-list">
                    <div className="print-inline-row"><span>Start date</span><strong>{formatDate(drying.start_date)}</strong></div>
                    <div className="print-inline-row"><span>End date</span><strong>{formatDate(drying.end_date)}</strong></div>
                  </div>
                </div>
              )}

              {moisture_logs.length > 0 && (
                <div className="print-stage-card">
                  <div className="print-stage-head">
                    <div className="print-stage-name">Moisture Monitoring</div>
                    <div className="print-stage-meta">{moisture_logs.length} reading(s)</div>
                  </div>
                  <div className="print-inline-list">
                    {moisture_logs.map((item, index) => (
                      <div className="print-inline-row" key={item.id || index}>
                        <span>Day {index + 1}</span>
                        <strong>{formatWeightValue(item.moisture_pct)}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {packing && (
                <div className="print-stage-card">
                  <div className="print-stage-head">
                    <div className="print-stage-name">Packing</div>
                    <div className="print-stage-meta">{formatDate(packing.packing_date)}</div>
                  </div>
                  <div className="print-inline-list">
                    <div className="print-inline-row"><span>Final weight</span><strong>{formatWeight(packing.final_weight)}</strong></div>
                    <div className="print-inline-row"><span>Bag count</span><strong>{packing.bag_count}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="print-note">
            Generated by CocoaTrack Traceability System. This document summarizes the latest recorded processing history for batch {batch.batch_code}.
          </div>
        </div>

        <p className="screen-only" style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
          Powered by CocoaTrack Traceability System
        </p>
      </div>
    </div>
  );
}
