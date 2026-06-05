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
        farmer_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0,
        farmer_bad_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0,
        pod_weight NUMERIC(10,2) NOT NULL,
        bad_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0,
        pod_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS bad_bag_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS farmer_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS farmer_bad_pod_weight NUMERIC(10,2) NOT NULL DEFAULT 0;
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
        box_id TEXT NOT NULL,
        good_box_id TEXT,
        bad_box_id TEXT,
        good_weight NUMERIC(10,2),
        bad_weight NUMERIC(10,2),
        start_date DATE NOT NULL,
        end_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE fermentation DROP CONSTRAINT IF EXISTS fermentation_batch_id_key;
      ALTER TABLE fermentation ALTER COLUMN box_id TYPE TEXT;
      ALTER TABLE fermentation ADD COLUMN IF NOT EXISTS good_box_id TEXT;
      ALTER TABLE fermentation ADD COLUMN IF NOT EXISTS bad_box_id TEXT;
      ALTER TABLE fermentation ALTER COLUMN good_box_id TYPE TEXT;
      ALTER TABLE fermentation ALTER COLUMN bad_box_id TYPE TEXT;
      ALTER TABLE fermentation ADD COLUMN IF NOT EXISTS good_weight NUMERIC(10,2);
      ALTER TABLE fermentation ADD COLUMN IF NOT EXISTS bad_weight NUMERIC(10,2);
      UPDATE fermentation
      SET good_box_id = COALESCE(good_box_id, box_id)
      WHERE good_box_id IS NULL AND bad_box_id IS NULL;

      -- TRANSFERS
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
        bean_type VARCHAR(10) NOT NULL DEFAULT 'good',
        from_box VARCHAR(10) NOT NULL,
        to_box VARCHAR(10) NOT NULL,
        transfer_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE transfers ADD COLUMN IF NOT EXISTS bean_type VARCHAR(10) NOT NULL DEFAULT 'good';
      UPDATE transfers SET bean_type = 'good' WHERE bean_type IS NULL;

      -- DRYING
      CREATE TABLE IF NOT EXISTS drying (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER UNIQUE REFERENCES batches(id) ON DELETE CASCADE,
        shelf_id VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        total_dry_weight NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE drying
      ADD COLUMN IF NOT EXISTS total_dry_weight NUMERIC(10,2);

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

      -- NOTIFICATIONS
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        notification_date DATE NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS notifications_batch_id_idx ON notifications(batch_id);
      CREATE INDEX IF NOT EXISTS notifications_date_idx ON notifications(notification_date);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

      -- RECIPE MASTER
      CREATE TABLE IF NOT EXISTS recipe_master (
        id SERIAL PRIMARY KEY,
        recipe_name VARCHAR(150) UNIQUE NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO recipe_master (recipe_name, is_default)
      VALUES
        ('70% Dark Chocolate', TRUE),
        ('80% Dark Chocolate', TRUE),
        ('100% Dark Chocolate', TRUE),
        ('52% Milk Chocolate', TRUE),
        ('52% Coconut Chocolate', TRUE),
        ('52% Fruit Chocolate (Mango)', TRUE),
        ('70% Fruit Chocolate (Pineapple)', TRUE),
        ('Mango Milkshake Chocolate', TRUE),
        ('46% Dark Chocolate', TRUE)
      ON CONFLICT (recipe_name) DO NOTHING;

      -- COCOA PROCESSING BATCH
      CREATE TABLE IF NOT EXISTS cocoa_processing_batches (
        id SERIAL PRIMARY KEY,
        batch_code VARCHAR(50) UNIQUE NOT NULL,
        source_batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
        weight_kg NUMERIC(10,2) NOT NULL,
        moisture_pct NUMERIC(5,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE cocoa_processing_batches ADD COLUMN IF NOT EXISTS source_batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL;

      -- ROAST LOTS
      CREATE TABLE IF NOT EXISTS cocoa_roast_lots (
        id SERIAL PRIMARY KEY,
        cocoa_batch_id INTEGER NOT NULL REFERENCES cocoa_processing_batches(id) ON DELETE CASCADE,
        roast_lot_number VARCHAR(50) NOT NULL,
        quantity_roasted_kg NUMERIC(10,2) NOT NULL,
        weight_after_roasting_kg NUMERIC(10,2) NOT NULL,
        moisture_after_roasting_pct NUMERIC(5,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS cocoa_roast_lots_unique_idx
        ON cocoa_roast_lots(cocoa_batch_id, roast_lot_number);

      -- WINNOWING
      CREATE TABLE IF NOT EXISTS cocoa_winnowing (
        id SERIAL PRIMARY KEY,
        cocoa_batch_id INTEGER UNIQUE NOT NULL REFERENCES cocoa_processing_batches(id) ON DELETE CASCADE,
        weight_before_kg NUMERIC(10,2) NOT NULL,
        weight_after_kg NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CLEANING NIBS
      CREATE TABLE IF NOT EXISTS cocoa_cleaning_nibs (
        id SERIAL PRIMARY KEY,
        cocoa_batch_id INTEGER UNIQUE NOT NULL REFERENCES cocoa_processing_batches(id) ON DELETE CASCADE,
        weight_before_kg NUMERIC(10,2) NOT NULL,
        weight_after_kg NUMERIC(10,2) NOT NULL,
        workers_involved JSONB NOT NULL DEFAULT '[]'::jsonb,
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE cocoa_cleaning_nibs ADD COLUMN IF NOT EXISTS workers_involved JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE cocoa_cleaning_nibs ADD COLUMN IF NOT EXISTS remarks TEXT;

      -- PROCESSING WORKERS
      CREATE TABLE IF NOT EXISTS processing_workers (
        id SERIAL PRIMARY KEY,
        worker_name VARCHAR(150) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- NIBS PACKING
      CREATE TABLE IF NOT EXISTS cocoa_nibs_packing (
        id SERIAL PRIMARY KEY,
        cocoa_batch_id INTEGER UNIQUE NOT NULL REFERENCES cocoa_processing_batches(id) ON DELETE CASCADE,
        total_nibs_weight_kg NUMERIC(10,2) NOT NULL,
        number_of_bags INTEGER NOT NULL,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- NIBS INVENTORY
      CREATE TABLE IF NOT EXISTS nibs_inventory (
        id SERIAL PRIMARY KEY,
        cocoa_batch_id INTEGER UNIQUE NOT NULL REFERENCES cocoa_processing_batches(id) ON DELETE CASCADE,
        batch_code VARCHAR(50) UNIQUE NOT NULL,
        available_nibs_stock_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE nibs_inventory ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';

      -- CHOCOLATE PRODUCTION: STEP 1
      CREATE TABLE IF NOT EXISTS chocolate_grinding_conching (
        id SERIAL PRIMARY KEY,
        production_batch_number VARCHAR(50) UNIQUE NOT NULL,
        source_batch_code VARCHAR(50) NOT NULL,
        nib_inventory_id INTEGER NOT NULL REFERENCES nibs_inventory(id) ON DELETE RESTRICT,
        recipe_id INTEGER REFERENCES recipe_master(id) ON DELETE SET NULL,
        nibs_quantity_used_kg NUMERIC(10,2) NOT NULL,
        remaining_nibs_stock_kg NUMERIC(10,2) NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ,
        power_failure BOOLEAN NOT NULL DEFAULT FALSE,
        remarks TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE chocolate_grinding_conching ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';

      -- CHOCOLATE PRODUCTION: STEP 2
      CREATE TABLE IF NOT EXISTS chocolate_couverture_packing (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        number_of_couverture_packs INTEGER NOT NULL,
        total_weight_g INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 3
      CREATE TABLE IF NOT EXISTS chocolate_melting (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        number_of_couverture_packs_used INTEGER NOT NULL,
        melting_temperature_c NUMERIC(6,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 4
      CREATE TABLE IF NOT EXISTS chocolate_tempering (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        tempering_temperature_c NUMERIC(6,2) NOT NULL,
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 5
      CREATE TABLE IF NOT EXISTS chocolate_moulding_weighing (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        weight_before_moulding_kg NUMERIC(10,2) NOT NULL,
        weight_after_moulding_kg NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 6
      CREATE TABLE IF NOT EXISTS chocolate_cooling (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        cooling_start_time TIMESTAMPTZ NOT NULL,
        cooling_end_time TIMESTAMPTZ,
        ac_temperature_c NUMERIC(6,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 7
      CREATE TABLE IF NOT EXISTS chocolate_demoulding (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        demoulded_quantity INTEGER NOT NULL,
        broken_bars INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 8
      CREATE TABLE IF NOT EXISTS chocolate_packing (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        total_chocolate_weight_kg NUMERIC(10,2) NOT NULL,
        packed_bars INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- CHOCOLATE PRODUCTION: STEP 9
      CREATE TABLE IF NOT EXISTS chocolate_sample_retention (
        id SERIAL PRIMARY KEY,
        production_batch_id INTEGER UNIQUE NOT NULL REFERENCES chocolate_grinding_conching(id) ON DELETE CASCADE,
        sample_saved BOOLEAN NOT NULL,
        sample_weight_kg NUMERIC(10,2),
        finished_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

module.exports = initDB;
