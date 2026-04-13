import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const formatWeight = (value) => `${(parseFloat(value) || 0).toFixed(2)} kg`;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDate = (value) => {
  const date = normalizeDate(value);
  if (!date) return 'Not set';
  return date.toISOString().slice(0, 10);
};

export default function Dashboard() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [fermentations, setFermentations] = useState([]);
  const [transferMap, setTransferMap] = useState({});
  const [traceQuery, setTraceQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/batches'), api.get('/farmers'), api.get('/fermentation')])
      .then(async ([b, f, fermentationRes]) => {
        setBatches(b.data);
        setFarmers(f.data);
        setFermentations(fermentationRes.data);

        const activeFermentations = fermentationRes.data.filter((item) => item.status === 'active');
        const transferResponses = await Promise.all(
          activeFermentations.map((item) =>
            api.get(`/transfers/${item.batch_id}`)
              .then((response) => [String(item.batch_id), response.data])
              .catch(() => [String(item.batch_id), []])
          )
        );

        setTransferMap(Object.fromEntries(transferResponses));
      })
      .finally(() => setLoading(false));
  }, []);

  const packedCount = batches.filter((batch) => batch.packed).length;
  const inProgressCount = batches.length - packedCount;
  const totalFarmerWeight = batches.reduce(
    (sum, batch) => sum + Number(batch.farmer_pod_weight || 0) + Number(batch.farmer_bad_pod_weight || 0),
    0
  );
  const totalCompanyWeight = batches.reduce(
    (sum, batch) => sum + Number(batch.pod_weight || 0) + Number(batch.bad_pod_weight || 0),
    0
  );

  const stats = [
    { label: 'Total Farmers', value: farmers.length, icon: 'Farmers', to: '/farmers' },
    { label: 'Total Batches', value: batches.length, icon: 'Batches', to: '/batches' },
    { label: 'Packed Batches', value: packedCount, icon: 'Packed', to: '/packing' },
    { label: 'In Progress', value: inProgressCount, icon: 'Open', to: '/fermentation' },
  ];

  const filteredBatches = batches.filter((batch) => {
    if (!traceQuery.trim()) return true;
    const query = traceQuery.trim().toLowerCase();
    return [
      batch.batch_code,
      batch.farmer_name,
      batch.farmer_code,
      batch.location,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const recentBatches = batches.slice(0, 8);
  const today = normalizeDate(new Date());
  const transferNotifications = fermentations
    .filter((item) => item.status === 'active')
    .map((item) => {
      const transferHistory = transferMap[String(item.batch_id)] || [];
      const hasTransfers = transferHistory.length > 0;
      const latestTransfer = transferHistory.reduce((latest, entry) => {
        const entryTime = normalizeDate(entry.transfer_date);
        if (!entryTime) return latest;
        if (!latest) return entry;
        return entryTime > normalizeDate(latest.transfer_date) ? entry : latest;
      }, null);

      const referenceDate = latestTransfer?.transfer_date || item.start_date;
      const normalizedReferenceDate = normalizeDate(referenceDate);
      const cadenceDays = hasTransfers ? 1 : 2;
      const daysSinceMove = normalizedReferenceDate
        ? Math.floor((today.getTime() - normalizedReferenceDate.getTime()) / MS_PER_DAY)
        : 0;
      const isDue = daysSinceMove >= cadenceDays;
      const nextTransferDate = normalizedReferenceDate
        ? new Date(normalizedReferenceDate.getTime() + (cadenceDays * MS_PER_DAY))
        : null;

      return {
        ...item,
        hasTransfers,
        cadenceDays,
        latestTransfer,
        daysSinceMove,
        isDue,
        nextTransferDate,
        currentBoxes: [item.good_box_id, item.bad_box_id].filter(Boolean).join(' | ') || item.box_id || 'Not assigned',
      };
    })
    .filter((item) => item.isDue)
    .sort((a, b) => b.daysSinceMove - a.daysSinceMove);

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {user?.username}</h1>
        <p>CocoaTrack dashboard with quick access to both recent and older batch trace records.</p>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
            {stats.map((s) => (
              <Link to={s.to} key={s.label} style={{ textDecoration: 'none' }}>
                <div
                  className="card"
                  style={{ margin: 0, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,106,79,0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    {s.icon}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-dark)' }}>{s.value}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              </Link>
            ))}
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h2>Recent Batches</h2>
              {batches.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No batches yet. <Link to="/batches">Create one</Link></p>
              ) : (
                <>
                  <div className="soft-panel" style={{ marginBottom: 16 }}>
                    <div className="soft-panel-title">
                      <div>
                        <h3>Collection Snapshot</h3>
                        <p>Farmer-recorded and company-verified totals stay visible here for quick comparison.</p>
                      </div>
                    </div>
                    <div className="stat-chip-grid">
                      <div className="stat-chip">
                        <div className="stat-chip-label">Farmer Recorded</div>
                        <div className="stat-chip-value">{formatWeight(totalFarmerWeight)}</div>
                      </div>
                      <div className="stat-chip">
                        <div className="stat-chip-label">Company Verified</div>
                        <div className="stat-chip-value">{formatWeight(totalCompanyWeight)}</div>
                      </div>
                      <div className="stat-chip">
                        <div className="stat-chip-label">Packed</div>
                        <div className="stat-chip-value">{packedCount}</div>
                      </div>
                      <div className="stat-chip">
                        <div className="stat-chip-label">Open</div>
                        <div className="stat-chip-value">{inProgressCount}</div>
                      </div>
                    </div>
                  </div>

                  <div className="soft-panel dashboard-reminder-panel" style={{ marginBottom: 16 }}>
                    <div className="soft-panel-title">
                      <div>
                        <h3>Transfer Alerts</h3>
                        <p>First transfer alert comes after 2 days from fermentation start. After the first transfer, the same batch will alert daily for the next move.</p>
                      </div>
                      <span className="dashboard-reminder-count">
                        {transferNotifications.length} due
                      </span>
                    </div>

                    {transferNotifications.length === 0 ? (
                      <div className="dashboard-reminder-empty">
                        No active fermentation batch is due for transfer today.
                      </div>
                    ) : (
                      <div className="dashboard-reminder-list">
                        {transferNotifications.slice(0, 6).map((item) => (
                          <div key={item.id} className="dashboard-reminder-item">
                            <div className="dashboard-reminder-main">
                              <div className="dashboard-reminder-code">{item.batch_code}</div>
                              <div className="dashboard-reminder-meta">
                                <span>{item.farmer_name}</span>
                                <span>Boxes: {item.currentBoxes}</span>
                                <span>Rule: {item.hasTransfers ? 'Daily transfer reminder' : 'First transfer after 2 days'}</span>
                                <span>
                                  Last movement: {item.latestTransfer ? formatDate(item.latestTransfer.transfer_date) : `Fermentation start ${formatDate(item.start_date)}`}
                                </span>
                                <span>Next transfer due: {item.nextTransferDate ? formatDate(item.nextTransferDate) : 'Today'}</span>
                              </div>
                            </div>
                            <div className="dashboard-reminder-side">
                              <div className="dashboard-reminder-badge">
                                {item.hasTransfers
                                  ? (item.daysSinceMove > 1 ? `${item.daysSinceMove} days waiting` : 'Daily move due')
                                  : (item.daysSinceMove > 2 ? `${item.daysSinceMove} days waiting` : 'First move due')}
                              </div>
                              <Link to="/transfers" className="btn btn-sm btn-primary">Open Transfers</Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Batch Code</th>
                          <th>Farmer</th>
                          <th>Location</th>
                          <th>Farmer Total</th>
                          <th>Company Total</th>
                          <th>Pod Date</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentBatches.map((batch) => (
                          <tr key={batch.id}>
                            <td><strong>{batch.batch_code}</strong></td>
                            <td>{batch.farmer_name}</td>
                            <td>{batch.location}</td>
                            <td>{formatWeight(Number(batch.farmer_pod_weight || 0) + Number(batch.farmer_bad_pod_weight || 0))}</td>
                            <td>{formatWeight(Number(batch.pod_weight || 0) + Number(batch.bad_pod_weight || 0))}</td>
                            <td>{batch.pod_date?.slice(0, 10)}</td>
                            <td>
                              <a href={`/trace/${batch.id}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">
                                Trace
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h2>Trace Previous Batches</h2>
              {batches.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Create a batch first to trace it here.</p>
              ) : (
                <>
                  <div className="form-group">
                    <label>Search batch code, farmer, farmer code, or location</label>
                    <input
                      type="text"
                      value={traceQuery}
                      onChange={(e) => setTraceQuery(e.target.value)}
                      placeholder="Type batch code or farmer name..."
                    />
                    <div className="compact-help" style={{ marginTop: 8 }}>
                      This includes older and completed batches, not only the newest ones.
                    </div>
                  </div>

                  <div className="trace-list">
                    {filteredBatches.length === 0 ? (
                      <div className="soft-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No batch matched your search.
                      </div>
                    ) : (
                      filteredBatches.slice(0, 20).map((batch) => (
                        <div key={batch.id} className="trace-item">
                          <div className="trace-item-main">
                            <div className="trace-item-code">{batch.batch_code}</div>
                            <div className="trace-item-meta">
                              <span>{batch.farmer_name} ({batch.farmer_code})</span>
                              <span>{batch.location} | {batch.pod_date?.slice(0, 10) || 'No date'}</span>
                              <span>
                                Farmer: {formatWeight(Number(batch.farmer_pod_weight || 0) + Number(batch.farmer_bad_pod_weight || 0))}
                                {' | '}
                                Company: {formatWeight(Number(batch.pod_weight || 0) + Number(batch.bad_pod_weight || 0))}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <a href={`/trace/${batch.id}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">
                              Open Trace
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Batch Summary Access</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              Use Pod Collection for new entries, Trace for full lifecycle view, and Batch Export when you need a combined Excel sheet.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Link to="/batches" className="btn btn-secondary">Open Pod Collection</Link>
              <Link to="/farmer-export" className="btn btn-secondary">Open Batch Export</Link>
              <Link to="/packing" className="btn btn-secondary">Check Completed Batches</Link>
            </div>
          </div>

          <div className="card">
            <h2>Quick Actions</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[
                { to: '/farmers', label: '+ Add Farmer', cls: 'btn-primary' },
                { to: '/batches', label: '+ New Batch', cls: 'btn-accent' },
                { to: '/breaking', label: '+ Breaking', cls: 'btn-secondary' },
                { to: '/fermentation', label: '+ Fermentation', cls: 'btn-secondary' },
                { to: '/drying', label: '+ Drying', cls: 'btn-secondary' },
                { to: '/packing', label: '+ Packing', cls: 'btn-secondary' },
              ].map((action) => (
                <Link key={action.to} to={action.to} className={`btn ${action.cls}`}>{action.label}</Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
