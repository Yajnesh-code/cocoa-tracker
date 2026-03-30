const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

function normalizeUsername(username) {
  return String(username || '').trim();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function createResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, hashedToken };
}

function getResetBaseUrl() {
  return process.env.RESET_PASSWORD_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
}

function shouldExposeResetLink() {
  return process.env.EXPOSE_RESET_LINK === 'true' || process.env.NODE_ENV !== 'production';
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  if (!isStrongEnoughPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    const userCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const isFirstUser = userCountResult.rows[0]?.count === 0;
    const role = isFirstUser ? 'admin' : 'staff';
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, hash, role]
    );

    res.status(201).json({
      message: isFirstUser
        ? 'First user registered as admin'
        : 'User registered successfully',
      user: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const identity = String(req.body.identity || '').trim();

  if (!identity) {
    return res.status(400).json({ error: 'Username or email is required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE username = $1 OR LOWER(email) = $2 LIMIT 1',
      [identity, identity.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.json({ message: 'If the account exists, a reset link has been generated.' });
    }

    const { rawToken, hashedToken } = createResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3',
      [hashedToken, expiresAt, user.id]
    );

    const resetLink = `${getResetBaseUrl().replace(/\/$/, '')}/reset-password?token=${rawToken}`;
    console.log(`Password reset link for ${user.username}: ${resetLink}`);

    const payload = { message: 'If the account exists, a reset link has been generated.' };
    if (shouldExposeResetLink()) {
      payload.resetLink = resetLink;
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = req.body.password;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  if (!isStrongEnoughPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      `SELECT id
       FROM users
       WHERE reset_token_hash = $1
         AND reset_token_expires_at IS NOT NULL
         AND reset_token_expires_at > NOW()
       LIMIT 1`,
      [hashedToken]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password = $1,
           reset_token_hash = NULL,
           reset_token_expires_at = NULL
       WHERE id = $2`,
      [hash, user.id]
    );

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
