const pool = require('../db/pool');

/**
 * Create a notification for a batch
 */
async function createNotification(batchId, message, notificationType, notificationDate = null) {
  try {
    const date = notificationDate || new Date().toISOString().split('T')[0];
    
    await pool.query(
      `INSERT INTO notifications (batch_id, message, notification_type, notification_date)
       VALUES ($1, $2, $3, $4)`,
      [batchId, message, notificationType, date]
    );
  } catch (error) {
    console.error('Error creating notification:', error.message);
  }
}

/**
 * Create daily notifications for batches transferred 2+ days ago
 */
async function createDailyTransferNotifications() {
  try {
    // Get all transfers that happened 2 or more days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT DISTINCT t.batch_id, t.to_box, b.batch_code, f.name as farmer_name
       FROM transfers t
       JOIN batches b ON t.batch_id = b.id
       JOIN farmers f ON b.farmer_id = f.id
       WHERE t.transfer_date <= $1
       AND NOT EXISTS (
         SELECT 1 FROM notifications 
         WHERE batch_id = t.batch_id 
         AND notification_type = 'daily_transfer' 
         AND notification_date = CURRENT_DATE
       )`,
      [twoDaysAgoStr]
    );

    // Create daily notifications for each batch
    for (const row of result.rows) {
      const message = `Transfer reminder: Batch ${row.batch_code} (${row.farmer_name}) is in box ${row.to_box}. Please process transfer if needed.`;
      await createNotification(row.batch_id, message, 'daily_transfer', null);
    }

    console.log(`Created ${result.rows.length} daily transfer notifications`);
  } catch (error) {
    console.error('Error creating daily transfer notifications:', error.message);
  }
}

/**
 * Create initial notification when fermentation starts
 */
async function notifyFermentationStart(batchId, boxId, fermentationDate) {
  try {
    const result = await pool.query(
      `SELECT b.batch_code, f.name as farmer_name
       FROM batches b
       JOIN farmers f ON b.farmer_id = f.id
       WHERE b.id = $1`,
      [batchId]
    );

    if (result.rows.length > 0) {
      const { batch_code, farmer_name } = result.rows[0];
      const message = `Batch ${batch_code} (${farmer_name}) has started fermentation in box ${boxId}. Ready for transfer in 2 days.`;
      await createNotification(batchId, message, 'fermentation_start', fermentationDate);
    }
  } catch (error) {
    console.error('Error notifying fermentation start:', error.message);
  }
}

/**
 * Create notification when batch is transferred
 */
async function notifyTransfer(batchId, fromBox, toBox, transferDate) {
  try {
    const result = await pool.query(
      `SELECT b.batch_code, f.name as farmer_name
       FROM batches b
       JOIN farmers f ON b.farmer_id = f.id
       WHERE b.id = $1`,
      [batchId]
    );

    if (result.rows.length > 0) {
      const { batch_code, farmer_name } = result.rows[0];
      const message = `Batch ${batch_code} (${farmer_name}) transferred from box ${fromBox} to box ${toBox}. Daily reminders will start tomorrow.`;
      await createNotification(batchId, message, 'transfer', transferDate);
    }
  } catch (error) {
    console.error('Error notifying transfer:', error.message);
  }
}

module.exports = {
  createNotification,
  createDailyTransferNotifications,
  notifyFermentationStart,
  notifyTransfer,
};
