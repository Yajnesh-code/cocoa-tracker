require('dotenv').config();
const express = require('express');
const cors = require('cors');
const initDB = require('./db/init');

const app = express();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}

function normalizeOrigin(origin) {
  return String(origin || '')
    .trim()
    .replace(/\/+$/, '');
}

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 204,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/farmers', require('./routes/farmers'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/breaking', require('./routes/breaking'));
app.use('/api/fermentation', require('./routes/fermentation'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/drying', require('./routes/drying'));
app.use('/api/moisture', require('./routes/moisture'));
app.use('/api/packing', require('./routes/packing'));
app.use('/api/trace', require('./routes/trace'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;

initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
