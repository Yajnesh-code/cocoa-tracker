import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

export default function ForgotPassword() {
  const [identity, setIdentity] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResetLink('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { identity });
      setSuccess(res.data.message || 'If the account exists, a reset link has been generated.');
      setResetLink(res.data.resetLink || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to create reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 86,
              height: 86,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              borderRadius: 20,
              boxShadow: 'var(--shadow)',
              border: '1px solid var(--border)',
            }}
          >
            <img src="/solemulelogo.png" alt="Company logo" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-dark)' }}>Forgot Password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: 6 }}>Enter your username or email to generate a reset link.</p>
        </div>
        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Username or Email</label>
              <input value={identity} onChange={(e) => setIdentity(e.target.value)} required autoFocus />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              {loading ? 'Generating...' : 'Generate Reset Link'}
            </button>
          </form>
          {resetLink && (
            <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: '#fbfdfb' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Reset Link</div>
              <a href={resetLink} style={{ wordBreak: 'break-all' }}>{resetLink}</a>
            </div>
          )}
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Back to <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
