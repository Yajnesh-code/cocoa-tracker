import React, { useEffect, useState } from 'react';
import api from '../api/axios';

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

const LABELS = {
  batch: 'Batch Report',
  roasting: 'Roasting Report',
  winnowing: 'Winnowing Report',
  cleaning: 'Cleaning Report',
  nibs_packing: 'Nibs Packing Report',
  inventory: 'Inventory Report',
  grinding_conching: 'Grinding & Conching Report',
  couverture_packing: 'Couverture Packing Report',
  melting: 'Melting Report',
  tempering: 'Tempering Report',
  moulding: 'Moulding Report',
  packing: 'Packing Report',
  sample_retention: 'Sample Retention Report',
};

export default function ProcessingReports() {
  const [reports, setReports] = useState({ cocoa_processing: [], chocolate_production: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get('/processing-reports/list')
      .then((res) => setReports(res.data))
      .catch((err) => setError(normalizeError(err, 'Failed to load report list')));
  }, []);

  const download = async (moduleName, reportName, format) => {
    setError('');
    setSuccess('');
    setDownloading(true);
    try {
      const response = await api.get(`/processing-reports/${moduleName}/${reportName}?format=${format}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${moduleName}-${reportName}.${format === 'excel' ? 'xls' : 'html'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(`${LABELS[reportName] || reportName} downloaded as ${format.toUpperCase()}`);
    } catch (err) {
      setError(normalizeError(err, 'Failed to download report'));
    } finally {
      setDownloading(false);
    }
  };

  const renderSection = (title, moduleName, keys) => (
    <div className="card">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Report</th>
              <th>Excel</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No reports configured</td></tr>
            ) : keys.map((reportName) => (
              <tr key={`${moduleName}-${reportName}`}>
                <td><strong>{LABELS[reportName] || reportName}</strong></td>
                <td>
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    disabled={downloading}
                    onClick={() => download(moduleName, reportName, 'excel')}
                  >
                    Download Excel
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    disabled={downloading}
                    onClick={() => download(moduleName, reportName, 'pdf')}
                  >
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Processing Reports</h1>
        <p>Download Cocoa Processing and Chocolate Production reports in Excel and PDF-ready format.</p>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {renderSection('Cocoa Processing Reports', 'cocoa', reports.cocoa_processing || [])}
      {renderSection('Chocolate Production Reports', 'chocolate', reports.chocolate_production || [])}
    </div>
  );
}
