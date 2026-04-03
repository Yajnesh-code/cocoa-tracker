import React, { useEffect, useState } from 'react';
import api from '../api/axios';

export default function FarmerExport() {
  const [farmers, setFarmers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get('/farmers')
      .then((res) => setFarmers(res.data))
      .catch(() => setError('Unable to load farmers'));
  }, []);

  const toggleFarmer = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const downloadExcel = async () => {
    if (selectedIds.length === 0) return;

    setError('');
    setDownloading(true);

    try {
      const response = await api.get(`/farmers/export/details?farmer_ids=${selectedIds.join(',')}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/vnd.ms-excel' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'selected-farmers-batch-report.xls';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download Excel sheet');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Farmer Excel Export</h1>
        <p>Select one or more farmers and download all their batch details in one professional Excel sheet.</p>
      </div>

      <div className="card">
        <h2>Select Farmers</h2>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Selected farmers: <strong>{selectedIds.length}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={downloadExcel}
            disabled={selectedIds.length === 0 || downloading}
          >
            {downloading ? 'Downloading...' : 'Download Excel Sheet'}
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Farmer Code</th>
                <th>Name</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {farmers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No farmers available
                  </td>
                </tr>
              ) : (
                farmers.map((farmer) => (
                  <tr key={farmer.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(farmer.id)}
                        onChange={() => toggleFarmer(farmer.id)}
                      />
                    </td>
                    <td><strong>{farmer.farmer_code}</strong></td>
                    <td>{farmer.name}</td>
                    <td>{farmer.location}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
