const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// GET all farmers
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM farmers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single farmer
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM farmers WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Farmer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create farmer
router.post('/', auth, async (req, res) => {
  const { farmer_code, name, location } = req.body;
  if (!farmer_code || !name || !location)
    return res.status(400).json({ error: 'farmer_code, name, and location are required' });

  try {
    const result = await pool.query(
      'INSERT INTO farmers (farmer_code, name, location) VALUES ($1, $2, $3) RETURNING *',
      [farmer_code, name, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Farmer code already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
