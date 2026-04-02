const pool = require('./pool');

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- USERS
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(200),
        password TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'staff',
        reset_token_hash TEXT,
        reset_token_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL;

      -- FARMERS
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        farmer_code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        location VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- BATCHES (pod collection)
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        batch_code VARCHAR(50) UNIQUE NOT NULL,
        farmer_id INTEGER REFERENCES farmers(id) ON DELETE RESTRICT,
        bag_count INTEGER NOT NULL,
        bad_bag_count INTEGER NOT NULL DEFAULT 0,
        pod_weight NUMERIC(10,2) NOT NULL,
        bad_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0,
        pod_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS bad_bag_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS bad_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0;

      -- BREAKING STAGE
      CREATE TABLE IF NOT EXISTS breaking (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER UNIQUE REFERENCES batches(id) ON DELETE CASCADE,
        wet_weight NUMERIC(10,2) NOT NULL,
        bag_count INTEGER NOT NULL,
        good_weight NUMERIC(10,2),
        bad_weight NUMERIC(10,2),
        bucket_details JSONB,
        breaking_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- BREAKING DETAIL COLUMNS
      ALTER TABLE breaking ADD COLUMN IF NOT EXISTS good_weight NUMERIC(10,2);
      ALTER TABLE breaking ADD COLUMN IF NOT EXISTS bad_weight NUMERIC(10,2);
      ALTER TABLE breaking ADD COLUMN IF NOT EXISTS bucket_details JSONB;

      -- FERMENTATION
      CREATE TABLE IF NOT EXISTS fermentation (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
        box_id VARCHAR(10) NOT NULL,
        good_weight NUMERIC(10,2),
        bad_weight NUMERIC(10,2),
        start_date DATE NOT NULL,
        end_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE fermentation DROP CONSTRAINT IF EXISTS fermentation_batch_id_key;
      ALTER TABLE fermentation ADD COLUMN IF NOT EXISTS good_weight NUMERIC(10,2);
      ALTER TABLE fermentation ADD COLUMN IF NOT EXISTS bad_weight NUMERIC(10,2);

      -- TRANSFERS
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
        from_box VARCHAR(10) NOT NULL,
        to_box VARCHAR(10) NOT NULL,
        transfer_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- DRYING
      CREATE TABLE IF NOT EXISTS drying (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER UNIQUE REFERENCES batches(id) ON DELETE CASCADE,
        shelf_id VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- MOISTURE LOGS
      CREATE TABLE IF NOT EXISTS moisture_logs (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
        moisture_pct NUMERIC(5,2) NOT NULL,
        log_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- PACKING
      CREATE TABLE IF NOT EXISTS packing (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER UNIQUE REFERENCES batches(id) ON DELETE CASCADE,
        bag_count INTEGER NOT NULL,
        final_weight NUMERIC(10,2) NOT NULL,
        packing_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

module.exports = initDB;
