import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function FarmerExport() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [syncingDaily, setSyncingDaily] = useState(false);
  const [syncingCompleted, setSyncingCompleted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/batches')
      .then((res) => setBatches(res.data))
      .catch(() => setError('Unable to load batch codes'));
  }, []);

  const toggleBatch = (id) => {
    setSelectedBatchIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const downloadExcel = async () => {
    if (selectedBatchIds.length === 0) return;

    setError('');
    setSuccess('');
    setDownloading(true);

    try {
      const response = await api.get(`/trace/export/selected?batch_ids=${selectedBatchIds.join(',')}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/vnd.ms-excel' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'selected-batch-details.xls';
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

  const syncSelectedToGoogleSheet = async () => {
    if (selectedBatchIds.length === 0) return;

    setError('');
    setSuccess('');
    setSyncing(true);

    try {
      const response = await api.post('/trace/sync/selected', {
        batch_ids: selectedBatchIds,
      });
      setSuccess(`Selected batch report rebuilt for ${response.data.batches_synced} batch(es). Dashboard and Daily Entries were not changed.`);
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || 'Failed to sync selected batches');
    } finally {
      setSyncing(false);
    }
  };

  const syncDailyToGoogleSheet = async () => {
    setError('');
    setSuccess('');
    setSyncingDaily(true);

    try {
      const response = await api.post('/trace/sync/daily');
      setSuccess(`Daily report rebuilt from the beginning for ${response.data.batches_synced} batch(es) and ${response.data.rows_synced} row(s). Selected_Batch_Report was not changed.`);
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || 'Failed to sync daily report');
    } finally {
      setSyncingDaily(false);
    }
  };

  const syncCompletedToGoogleSheet = async () => {
    setError('');
    setSuccess('');
    setSyncingCompleted(true);

    try {
      const response = await api.post('/trace/sync/completed');
      setSuccess(`Completed drying and packing report rebuilt for ${response.data.batches_synced} batch(es). Daily_Report and Selected_Batch_Report were not changed.`);
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || 'Failed to sync completed drying and packing report');
    } finally {
      setSyncingCompleted(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Batch Excel Export</h1>
        <p>Rebuild two Google Sheet tabs here: Daily_Report for all data from the beginning, or Selected_Batch_Report for only the batch codes you pick below.</p>
      </div>

      <div className="card">
        <h2>Google Sheet Reports</h2>
        {success ? <div className="alert alert-success">{success}</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Rebuild the full daily report from the start of the system without changing the selected-batch tab.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={syncDailyToGoogleSheet}
              disabled={syncingDaily}
            >
              {syncingDaily ? 'Syncing Daily...' : 'Rebuild Daily Report'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={syncCompletedToGoogleSheet}
              disabled={syncingCompleted}
            >
              {syncingCompleted ? 'Syncing Completed...' : 'Rebuild Completed Weight Report'}
            </button>
          </div>
        </div>

        <h2>Select Batch Codes</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Selected batches: <strong>{selectedBatchIds.length}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={syncSelectedToGoogleSheet}
              disabled={selectedBatchIds.length === 0 || syncing}
            >
              {syncing ? 'Syncing...' : 'Rebuild Selected Batch Report'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={downloadExcel}
              disabled={selectedBatchIds.length === 0 || downloading}
            >
              {downloading ? 'Downloading...' : 'Download Excel Sheet'}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Batch Code</th>
                <th>Farmer</th>
                <th>Date</th>
                <th>Farmer / Company Total</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No batch records available
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const farmerTotalWeight = Number(batch.farmer_pod_weight || 0) + Number(batch.farmer_bad_pod_weight || 0);
                  const companyTotalWeight = Number(batch.pod_weight || 0) + Number(batch.bad_pod_weight || 0);
                  return (
                    <tr key={batch.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedBatchIds.includes(batch.id)}
                          onChange={() => toggleBatch(batch.id)}
                        />
                      </td>
                      <td><strong>{batch.batch_code}</strong></td>
                      <td>{batch.farmer_name}</td>
                      <td>{batch.pod_date?.slice(0, 10)}</td>
                      <td>{farmerTotalWeight.toFixed(2)} kg / {companyTotalWeight.toFixed(2)} kg</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
