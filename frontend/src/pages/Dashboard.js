import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const formatWeight = (value) => `${(parseFloat(value) || 0).toFixed(2)} kg`;

export default function Dashboard() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/batches'), api.get('/farmers')])
      .then(([b, f]) => { setBatches(b.data); setFarmers(f.data); })
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Total Farmers', value: farmers.length, icon: '🌱', to: '/farmers' },
    { label: 'Total Batches', value: batches.length, icon: '📦', to: '/batches' },
    { label: 'Packed Batches', value: '—', icon: '📫', to: '/packing' },
    { label: 'Active Fermentation', value: '—', icon: '🧪', to: '/fermentation' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {user?.username} 👋</h1>
        <p>CocoaTrack — Farm to Pack Traceability</p>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
            {stats.map((s) => (
              <Link to={s.to} key={s.label} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ margin: 0, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,106,79,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-dark)' }}>{s.value}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              </Link>
            ))}
          </div>

          <div className="card">
            <h2>📋 Recent Batches</h2>
            {batches.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No batches yet. <Link to="/batches">Create one →</Link></p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Batch Code</th><th>Farmer</th><th>Location</th><th>Pod Weight</th><th>Pod Date</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 8).map(b => (
                      <tr key={b.id}>
                        <td><strong>{b.batch_code}</strong></td>
                        <td>{b.farmer_name}</td>
                        <td>{b.location}</td>
                        <td>{formatWeight(Number(b.pod_weight || 0) + Number(b.bad_pod_weight || 0))}</td>
                        <td>{b.pod_date?.slice(0,10)}</td>
                        <td>
                          <a href={`/trace/${b.id}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">🔍 Trace</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>🚀 Quick Actions</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[
                { to: '/farmers', label: '+ Add Farmer', cls: 'btn-primary' },
                { to: '/batches', label: '+ New Batch', cls: 'btn-accent' },
                { to: '/breaking', label: '+ Breaking', cls: 'btn-secondary' },
                { to: '/fermentation', label: '+ Fermentation', cls: 'btn-secondary' },
                { to: '/drying', label: '+ Drying', cls: 'btn-secondary' },
                { to: '/packing', label: '+ Packing', cls: 'btn-secondary' },
              ].map(a => (
                <Link key={a.to} to={a.to} className={`btn ${a.cls}`}>{a.label}</Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
