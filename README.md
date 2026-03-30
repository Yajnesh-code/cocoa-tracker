# 🍫 CocoaTrack — Farm to Pack Traceability System

Full-stack cocoa traceability system built with **Node.js + Express + PostgreSQL** (backend) and **React** (frontend), deployable on **Microsoft Azure**.

---

## 📁 Project Structure

```
cocoa-tracker/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── index.js          # Server entry point
│   │   ├── db/
│   │   │   ├── pool.js       # PostgreSQL connection pool
│   │   │   └── init.js       # Schema initialization
│   │   ├── middleware/
│   │   │   └── auth.js       # JWT middleware
│   │   └── routes/
│   │       ├── auth.js       # Register / Login
│   │       ├── farmers.js    # Farmer registration
│   │       ├── batches.js    # Pod collection
│   │       ├── breaking.js   # Breaking stage
│   │       ├── fermentation.js
│   │       ├── transfers.js  # Box transfers
│   │       ├── drying.js
│   │       ├── moisture.js   # Daily moisture logs
│   │       ├── packing.js    # Final packing
│   │       └── trace.js      # QR traceability
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
│
├── frontend/                 # React app
│   ├── src/
│   │   ├── App.js
│   │   ├── index.js
│   │   ├── index.css
│   │   ├── api/axios.js
│   │   ├── context/AuthContext.js
│   │   ├── components/Layout.js
│   │   └── pages/
│   │       ├── Login.js
│   │       ├── Register.js
│   │       ├── Dashboard.js
│   │       ├── Farmers.js
│   │       ├── Batches.js
│   │       ├── Breaking.js
│   │       ├── Fermentation.js
│   │       ├── Transfers.js
│   │       ├── Drying.js
│   │       ├── Moisture.js
│   │       ├── Packing.js
│   │       └── Trace.js      # Public QR scan page
│   ├── public/index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docker-compose.yml        # Local development
├── .github/workflows/
│   └── azure-deploy.yml      # Azure CI/CD pipeline
└── README.md
```

---

## 🚀 Local Development (Docker)

### Prerequisites
- Docker + Docker Compose installed

### Run locally
```bash
# Clone / extract the project
cd cocoa-tracker

# Start all services (PostgreSQL + Backend + Frontend)
docker-compose up --build

# App will be available at:
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000/api
```

---

## 💻 Local Development (Manual)

### 1. PostgreSQL
Install PostgreSQL locally and create the database:
```sql
CREATE DATABASE cocoa_tracker;
CREATE USER cocoa_user WITH PASSWORD 'cocoa_pass';
GRANT ALL PRIVILEGES ON DATABASE cocoa_tracker TO cocoa_user;
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your DB credentials
npm install
npm run dev
# API runs at http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# Set REACT_APP_API_URL=http://localhost:5000/api
npm install
npm start
# App runs at http://localhost:3000
```

---

## ☁️ Azure Deployment Guide

### Step 1 — Create Azure Resources

```bash
# Login to Azure CLI
az login

# Create resource group
az group create --name cocoa-tracker-rg --location southeastasia

# Create Azure Database for PostgreSQL Flexible Server
az postgres flexible-server create \
  --resource-group cocoa-tracker-rg \
  --name cocoa-tracker-db \
  --admin-user cocoaadmin \
  --admin-password YourStrongPassword123! \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 15 \
  --public-access 0.0.0.0

# Create database
az postgres flexible-server db create \
  --resource-group cocoa-tracker-rg \
  --server-name cocoa-tracker-db \
  --database-name cocoa_tracker

# Create Azure Container Registry
az acr create \
  --resource-group cocoa-tracker-rg \
  --name cocoatrackerregistry \
  --sku Basic \
  --admin-enabled true

# Create App Service Plan (Linux)
az appservice plan create \
  --name cocoa-tracker-plan \
  --resource-group cocoa-tracker-rg \
  --is-linux \
  --sku B1

# Create Backend Web App
az webapp create \
  --resource-group cocoa-tracker-rg \
  --plan cocoa-tracker-plan \
  --name cocoa-tracker-backend \
  --deployment-container-image-name nginx

# Create Frontend Web App
az webapp create \
  --resource-group cocoa-tracker-rg \
  --plan cocoa-tracker-plan \
  --name cocoa-tracker-frontend \
  --deployment-container-image-name nginx
```

### Step 2 — Configure Backend App Settings

```bash
az webapp config appsettings set \
  --resource-group cocoa-tracker-rg \
  --name cocoa-tracker-backend \
  --settings \
    PORT=5000 \
    JWT_SECRET=your_strong_jwt_secret_here \
    PGHOST=cocoa-tracker-db.postgres.database.azure.com \
    PGUSER=cocoaadmin \
    PGPASSWORD=YourStrongPassword123! \
    PGDATABASE=cocoa_tracker \
    PGPORT=5432 \
    PGSSL=true \
    FRONTEND_URL=https://cocoa-tracker-frontend.azurewebsites.net \
    WEBSITES_PORT=5000
```

### Step 3 — Build & Push Docker Images

```bash
# Login to Azure Container Registry
az acr login --name cocoatrackerregistry

# Build & push backend
cd backend
docker build -t cocoatrackerregistry.azurecr.io/cocoa-backend:latest .
docker push cocoatrackerregistry.azurecr.io/cocoa-backend:latest

# Build & push frontend (set your backend URL)
cd ../frontend
docker build \
  --build-arg REACT_APP_API_URL=https://cocoa-tracker-backend.azurewebsites.net/api \
  -t cocoatrackerregistry.azurecr.io/cocoa-frontend:latest .
docker push cocoatrackerregistry.azurecr.io/cocoa-frontend:latest
```

### Step 4 — Deploy Images to Web Apps

```bash
# Get ACR credentials
az acr credential show --name cocoatrackerregistry

# Configure backend Web App to use ACR image
az webapp config container set \
  --resource-group cocoa-tracker-rg \
  --name cocoa-tracker-backend \
  --docker-custom-image-name cocoatrackerregistry.azurecr.io/cocoa-backend:latest \
  --docker-registry-server-url https://cocoatrackerregistry.azurecr.io \
  --docker-registry-server-user cocoatrackerregistry \
  --docker-registry-server-password <ACR_PASSWORD>

# Configure frontend Web App
az webapp config container set \
  --resource-group cocoa-tracker-rg \
  --name cocoa-tracker-frontend \
  --docker-custom-image-name cocoatrackerregistry.azurecr.io/cocoa-frontend:latest \
  --docker-registry-server-url https://cocoatrackerregistry.azurecr.io \
  --docker-registry-server-user cocoatrackerregistry \
  --docker-registry-server-password <ACR_PASSWORD>
```

### Step 5 — CI/CD with GitHub Actions

Add these secrets to your GitHub repository (`Settings → Secrets → Actions`):

| Secret | Value |
|--------|-------|
| `AZURE_BACKEND_APP_NAME` | `cocoa-tracker-backend` |
| `AZURE_FRONTEND_APP_NAME` | `cocoa-tracker-frontend` |
| `AZURE_BACKEND_PUBLISH_PROFILE` | Download from Azure Portal → Web App → Get Publish Profile |
| `AZURE_FRONTEND_PUBLISH_PROFILE` | Same for frontend Web App |
| `REACT_APP_API_URL` | `https://cocoa-tracker-backend.azurewebsites.net/api` |

Push to `main` branch → GitHub Actions will automatically build and deploy.

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register user |
| POST | `/api/auth/login` | No | Login, get JWT |
| GET/POST | `/api/farmers` | Yes | Manage farmers |
| GET/POST | `/api/batches` | Yes | Pod collection |
| GET/POST | `/api/breaking` | Yes | Breaking stage |
| GET/POST | `/api/fermentation` | Yes | Fermentation |
| PATCH | `/api/fermentation/:id/complete` | Yes | Complete fermentation |
| GET/POST | `/api/transfers` | Yes | Box transfers |
| GET/POST | `/api/drying` | Yes | Drying stage |
| PATCH | `/api/drying/:id/complete` | Yes | Complete drying |
| GET/POST | `/api/moisture` | Yes | Moisture logs |
| GET/POST | `/api/packing` | Yes | Final packing |
| GET | `/api/trace/:batch_id` | No | Full trace (QR scan) |
| GET | `/api/trace/:batch_id/qrcode` | No | QR code image |

---

## 🌐 URLs After Deployment

- **Frontend:** `https://cocoa-tracker-frontend.azurewebsites.net`
- **Backend API:** `https://cocoa-tracker-backend.azurewebsites.net/api`
- **QR Trace:** `https://cocoa-tracker-frontend.azurewebsites.net/trace/:batch_id`


jj hh