import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

export default function DryingRoomList() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    api.get('/drying')
      .then((res) => {
        if (mounted) {
          setRecords(res.data || []);
          setError('');
        }
      })
      .catch(() => {
        if (mounted) setError('Unable to load drying room list');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const total = records.length;
    const dryingCompleted = records.filter((item) => item.end_date).length;
    const packingCompleted = records.filter((item) => item.packing_date).length;

    return { total, dryingCompleted, packingCompleted };
  }, [records]);

  return (
    <div>
      <div className="page-header">
        <h1>Drying Room List</h1>
        <p>See every batch that has entered the drying room, along with drying completion and packing completion.</p>
      </div>

      <div className="card">
        <div className="stat-chip-grid" style={{ marginBottom: 16 }}>
          <div className="stat-chip">
            <div className="stat-chip-label">Entered Drying</div>
            <div className="stat-chip-value">{summary.total}</div>
          </div>
          <div className="stat-chip">
            <div className="stat-chip-label">Drying Completed</div>
            <div className="stat-chip-value">{summary.dryingCompleted}</div>
          </div>
          <div className="stat-chip">
            <div className="stat-chip-label">Packing Completed</div>
            <div className="stat-chip-value">{summary.packingCompleted}</div>
          </div>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch Code</th>
                <th>Farmer Code</th>
                <th>Farmer</th>
                <th>Drying Start Date</th>
                <th>Drying End Date</th>
                <th>Drying Status</th>
                <th>Packing Date</th>
                <th>Packing Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading drying room records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No batches have entered the drying room yet
                  </td>
                </tr>
              ) : (
                records.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.batch_code}</strong></td>
                    <td>{item.farmer_code}</td>
                    <td>{item.farmer_name}</td>
                    <td>{item.start_date?.slice(0, 10)}</td>
                    <td>{item.end_date?.slice(0, 10) || 'Not completed'}</td>
                    <td>
                      <span className={`badge ${item.end_date ? 'badge-completed' : 'badge-pending'}`}>
                        {item.end_date ? 'Completed' : 'In Progress'}
                      </span>
                    </td>
                    <td>{item.packing_date?.slice(0, 10) || 'Not packed'}</td>
                    <td>
                      <span className={`badge ${item.packing_date ? 'badge-completed' : 'badge-pending'}`}>
                        {item.packing_date ? 'Completed' : 'Not Packed'}
                      </span>
                    </td>
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
