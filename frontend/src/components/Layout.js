import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', icon: '\u{1F4CA}', label: 'Dashboard' },
  { to: '/farmers', icon: '\u{1F331}', label: 'Farmers' },
  { to: '/farmer-export', icon: '\u{1F4C4}', label: 'Batch Export' },
  { to: '/batches', icon: '\u{1F4E6}', label: 'Pod Collection' },
  { to: '/breaking', icon: '\u{1F528}', label: 'Breaking' },
  { to: '/fermentation', icon: '\u{1F9EA}', label: 'Fermentation' },
  { to: '/transfers', icon: '\u{1F501}', label: 'Transfers' },
  { to: '/drying', icon: '\u2600\uFE0F', label: 'Drying' },
  { to: '/moisture', icon: '\u{1F4A7}', label: 'Moisture' },
  { to: '/packing', icon: '\u{1F4EB}', label: 'Packing' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/solemulelogo.png" alt="Company logo" className="sidebar-logo-image" />
          <div>
            <div style={{ fontSize: '0.95rem' }}>CocoaTrack</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.6, fontWeight: 400 }}>
              Traceability System
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div
            style={{
              marginBottom: 6,
              color: 'rgba(255,255,255,0.75)',
              fontWeight: 600,
            }}
          >
            {'\u{1F464}'} {user?.username}
            <span
              className="badge"
              style={{
                marginLeft: 8,
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: '0.7rem',
              }}
            >
              {user?.role}
            </span>
          </div>
          <button
            className="btn btn-sm"
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              border: 'none',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
