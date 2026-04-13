const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { createDailyTransferNotifications } = require('../utils/notificationHelper');

// GET all notifications for a batch
router.get('/batch/:batch_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE batch_id = $1 
       ORDER BY notification_date DESC, created_at DESC`,
      [req.params.batch_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all unread notifications
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, b.batch_code, f.name as farmer_name
       FROM notifications n
       JOIN batches b ON n.batch_id = b.id
       JOIN farmers f ON b.farmer_id = f.id
       WHERE n.is_read = FALSE
       ORDER BY n.notification_date DESC, n.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all notifications (paginated)
router.get('/all/list', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notifications`
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT n.*, b.batch_code, f.name as farmer_name
       FROM notifications n
       JOIN batches b ON n.batch_id = b.id
       JOIN farmers f ON b.farmer_id = f.id
       ORDER BY n.notification_date DESC, n.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST mark notification as read
router.post('/:id/read', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST mark all notifications as read
router.post('/read-all', auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE`
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger daily notifications (call this daily via cron)
router.post('/trigger-daily', async (req, res) => {
  try {
    await createDailyTransferNotifications();
    res.json({ message: 'Daily notifications created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
