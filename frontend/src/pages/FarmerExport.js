import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function FarmerExport() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get('/batches')
      .then((res) => setBatches(res.data))
      .catch(() => setError('Unable to load batch codes'));
  }, []);

  const downloadExcel = async () => {
    if (!selectedBatchId) return;

    setError('');
    setDownloading(true);

    try {
      const selectedBatch = batches.find((batch) => String(batch.id) === String(selectedBatchId));
      const response = await api.get(`/trace/${selectedBatchId}/export`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/vnd.ms-excel' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedBatch?.batch_code || 'batch'}-details.xls`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {
      setError('Failed to download Excel sheet');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Batch Excel Export</h1>
        <p>Select one batch code and download one complete Excel sheet for only that batch.</p>
      </div>

      <div className="card" style={{ maxWidth: 760 }}>
        <h2>Select Batch Code</h2>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="form-group">
          <label>Batch Code *</label>
          <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)}>
            <option value="">Choose batch code...</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batch_code} - {batch.farmer_name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={downloadExcel}
          disabled={!selectedBatchId || downloading}
        >
          {downloading ? 'Downloading...' : 'Download Excel Sheet'}
        </button>
      </div>
    </div>
  );
}
