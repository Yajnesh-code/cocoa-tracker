# Quick Deployment Checklist

## ✅ Step 1: Verify Changes
```bash
git status
```
Expected output:
```
On branch main
Changes to be committed:
  modified:   backend/src/db/init.js
  modified:   backend/src/index.js
  modified:   backend/src/routes/fermentation.js
  modified:   backend/src/routes/transfers.js
  new file:   backend/src/routes/notifications.js
  new file:   backend/src/utils/notificationHelper.js
  new file:   backend/src/utils/notificationScheduler.js
```

## ✅ Step 2: Commit Changes
```bash
git add .
git commit -m "feat: Add notification system for batch transfers and daily reminders"
```

## ✅ Step 3: Push to GitHub/GitLab
```bash
git push origin main
```

## ✅ Step 4: Local Testing (Development)

### Start application
```bash
docker-compose up -d
```

### Wait for services to start
```bash
docker-compose logs -f backend
# Press Ctrl+C when you see "Server running on port 5000"
```

### Test database migration
```bash
# Check if notifications table was created
docker-compose exec db psql -U postgres -d cocoa_tracker -c "SELECT * FROM information_schema.tables WHERE table_name='notifications';"
```

### Test API endpoints
```bash
# Get unread notifications (you'll need a valid JWT token from login)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/notifications

# Manually trigger daily notifications
curl -X POST http://localhost:5000/api/notifications/trigger-daily
```

### Check frontend loads
```bash
# Open in browser
http://localhost:3000
```

## ✅ Step 5: Verify Fermentation Start Notification

1. Login to frontend (http://localhost:3000)
2. Go to Batches
3. Create or select a batch
4. Start Fermentation with a box (e.g., A1)
5. Check notifications:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/notifications/batch/1
```
You should see a notification with type: `fermentation_start`

## ✅ Step 6: Verify Transfer Notification

1. Go to Transfers
2. Create a transfer from box A1 to box A2
3. Check notifications again:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/notifications/batch/1
```
You should see a notification with type: `transfer`

## ✅ Step 7: Verify Daily Notifications

1. Manually trigger daily notifications:
```bash
curl -X POST http://localhost:5000/api/notifications/trigger-daily
```

2. Check logs for confirmation:
```bash
docker-compose logs backend | grep "daily"
```

3. Verify new notifications created:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/notifications/all/list
```

## ✅ Step 8: Production Deployment

### Option A: Manual Deployment to Server
```bash
# On your server
cd /opt/apps/cocoa-tracker
git pull origin main
docker-compose down
docker-compose build
docker-compose up -d
```

### Option B: Automatic Deployment (GitHub Actions)
1. Create `.github/workflows/deploy.yml` (see DEPLOYMENT_GUIDE.md)
2. Add server secrets to GitHub
3. Push to main → Auto-deploys!

## ✅ Step 9: Monitoring & Rollback

### View logs
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Rollback if needed
```bash
git revert HEAD
git push origin main
docker-compose down
docker-compose up -d
```

## 📊 Expected Behavior After Deployment

| Action | Notification Type | Timing |
|--------|------------------|--------|
| Batch starts in fermentation | `fermentation_start` | Immediately |
| Batch transferred between boxes | `transfer` | Immediately |
| Daily reminder for transferred batch | `daily_transfer` | Auto-generated daily at 00:00 |
| Mark notification as read | `is_read: true` | On user action |

## 🔍 Troubleshooting

### Database not migrating
```bash
docker-compose down -v  # Remove volumes
docker-compose up -d    # Recreate fresh
```

### Notifications not showing
```bash
# Check if auth token is valid
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'

# Use returned token in subsequent requests
curl -H "Authorization: Bearer TOKEN" http://localhost:5000/api/notifications
```

### Scheduler not running
```bash
# Check backend logs
docker-compose logs backend | grep "Notification scheduler"

# Manually trigger daily notifications
curl -X POST http://localhost:5000/api/notifications/trigger-daily
```

## 📝 Files Modified/Created

- ✅ `backend/src/db/init.js` - Added notifications table
- ✅ `backend/src/index.js` - Added notifications route & scheduler
- ✅ `backend/src/routes/notifications.js` - NEW: Notification API endpoints
- ✅ `backend/src/routes/fermentation.js` - Added notification on fermentation start
- ✅ `backend/src/routes/transfers.js` - Added notification on transfer
- ✅ `backend/src/utils/notificationHelper.js` - NEW: Notification utility functions
- ✅ `backend/src/utils/notificationScheduler.js` - NEW: Daily scheduler

---

**Need help?** See DEPLOYMENT_GUIDE.md for detailed instructions!
