# Git & Deployment Guide for Cocoa Tracker

## Prerequisites
- Git installed on your machine
- Docker & Docker Compose installed
- GitHub/GitLab account (for remote repository)

---

## 1. Git Setup & Initial Commit

### Initialize Git (if not already done)
```bash
cd e:\cocoa-tracker
git init
```

### Configure Git
```bash
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### Add all files to staging
```bash
git add .
```

### Create initial commit
```bash
git commit -m "feat: Add notification system for batch transfers

- Create notifications table in database
- Add fermentation_start notifications when batch enters fermentation
- Add transfer notifications when batch moves between boxes
- Add daily transfer reminders for batches in transfer state (2+ days)
- Create notifications API endpoints
- Setup auto-scheduler for daily notifications at midnight
- Integrate notification creation in fermentation and transfers routes"
```

---

## 2. Setup Remote Repository

### Create new repository on GitHub/GitLab
1. Go to GitHub.com or GitLab.com
2. Click "New Repository"
3. Name: `cocoa-tracker`
4. Do NOT initialize with README (we already have one)
5. Copy the repository URL

### Add remote to local Git
```bash
git remote add origin https://github.com/YOUR_USERNAME/cocoa-tracker.git
# or for GitLab:
# git remote add origin https://gitlab.com/YOUR_USERNAME/cocoa-tracker.git
```

### Push to remote
```bash
git branch -M main
git push -u origin main
```

---

## 3. View Git Status & History

### Check current status
```bash
git status
```

### View commit history
```bash
git log --oneline --graph
```

### View changes in a specific file
```bash
git diff backend/src/routes/fermentation.js
```

---

## 4. Local Deployment (Development)

### Build Docker images
```bash
docker-compose build
```

### Start all services
```bash
docker-compose up -d
```

### View logs
```bash
docker-compose logs -f backend
# or frontend:
docker-compose logs -f frontend
```

### Stop services
```bash
docker-compose down
```

### Test API endpoints
```bash
# Get unread notifications
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:5000/api/notifications

# Get batch notifications
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:5000/api/notifications/batch/1

# Trigger daily notifications manually
curl -X POST http://localhost:5000/api/notifications/trigger-daily
```

---

## 5. Database Migration

### Connect to PostgreSQL container
```bash
docker-compose exec db psql -U postgres -d cocoa_tracker
```

### Check if notifications table exists
```sql
SELECT * FROM information_schema.tables WHERE table_name='notifications';
```

### View table structure
```sql
\d notifications
```

---

## 6. Production Deployment

### Option A: Deploy to Cloud Server (AWS, DigitalOcean, etc.)

#### 1. Connect to your server via SSH
```bash
ssh root@your_server_ip
```

#### 2. Clone repository on server
```bash
cd /opt/apps
git clone https://github.com/YOUR_USERNAME/cocoa-tracker.git
cd cocoa-tracker
```

#### 3. Set environment variables
```bash
nano .env
# Add your production settings:
# DATABASE_URL=postgresql://user:pass@db:5432/cocoa_tracker
# FRONTEND_URL=https://your-domain.com
# GOOGLE_SHEET_WEBHOOK_URL=your_webhook_url
# JWT_SECRET=your_secret_key
```

#### 4. Build and deploy with Docker Compose
```bash
docker-compose -f docker-compose.yml up -d
```

#### 5. Setup SSL/HTTPS with Let's Encrypt
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d your-domain.com
```

#### 6. Configure Nginx reverse proxy
```bash
# Update nginx.conf to redirect to https
```

---

## 7. Continuous Deployment (CD) with GitHub Actions

### Create GitHub Actions workflow file
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/apps/cocoa-tracker
            git pull origin main
            docker-compose down
            docker-compose build
            docker-compose up -d
            docker-compose exec -T backend npm run migrate
```

### Setup GitHub Secrets
1. Go to Settings → Secrets
2. Add:
   - `SERVER_IP`: Your server IP
   - `SERVER_USER`: Your SSH user
   - `SSH_KEY`: Your private SSH key

---

## 8. Common Git Commands

### Create a feature branch
```bash
git checkout -b feature/notifications
```

### Commit changes
```bash
git add backend/src/db/init.js
git commit -m "feat: Add notifications table"
```

### Push branch to remote
```bash
git push origin feature/notifications
```

### Create Pull Request (on GitHub/GitLab)
1. Go to Pull Requests
2. Click "New Pull Request"
3. Compare `feature/notifications` to `main`
4. Add description and submit

### Merge after PR approval
```bash
git checkout main
git pull origin main
git merge feature/notifications
git push origin main
```

### Delete merged branch
```bash
git branch -d feature/notifications
git push origin --delete feature/notifications
```

---

## 9. Rollback in Case of Issues

### Revert last commit (keeps history)
```bash
git revert HEAD
git push origin main
```

### Reset to previous commit (removes history)
```bash
git reset --hard HEAD~1
git push -f origin main
```

### Checkout specific file from previous commit
```bash
git checkout HEAD~1 -- backend/src/routes/fermentation.js
git commit -m "rollback: revert fermentation changes"
```

---

## 10. Backup Database Before Deployment

```bash
# Backup PostgreSQL database
docker-compose exec db pg_dump -U postgres cocoa_tracker > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker-compose exec -T db psql -U postgres cocoa_tracker < backup_20260413_150000.sql
```

---

## 11. Verification After Deployment

### Check if services are running
```bash
docker-compose ps
```

### Check backend health
```bash
curl http://localhost:5000/health
```

### Check frontend
```bash
curl http://localhost:3000
```

### Monitor logs
```bash
docker-compose logs -f
```

---

## Quick Start Summary

```bash
# 1. Clone and setup
git clone https://github.com/YOUR_USERNAME/cocoa-tracker.git
cd cocoa-tracker

# 2. Start services
docker-compose up -d

# 3. Check status
docker-compose logs -f

# 4. Test API
curl -X POST http://localhost:5000/api/notifications/trigger-daily
```

---

## Need Help?

- **Git Documentation**: https://git-scm.com/doc
- **Docker Docs**: https://docs.docker.com/
- **GitHub Help**: https://docs.github.com/
- **Docker Compose**: https://docs.docker.com/compose/
