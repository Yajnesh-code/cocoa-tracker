import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

export default function FarmerExport() {
  const [farmers, setFarmers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');

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

  const exportUrl = useMemo(() => {
    if (selectedIds.length === 0) return '';
    return `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/farmers/export/details?farmer_ids=${selectedIds.join(',')}`;
  }, [selectedIds]);

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
          {selectedIds.length > 0 ? (
            <a className="btn btn-primary" href={exportUrl} target="_blank" rel="noreferrer">
              Download Excel Sheet
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              Download Excel Sheet
            </button>
          )}
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
