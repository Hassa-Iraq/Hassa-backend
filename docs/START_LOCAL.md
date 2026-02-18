# 🚀 Quick Start - Run Application Locally

## Step-by-Step Commands

### 1. Navigate to Project
```bash
cd /Users/ahsen/Downloads/food-app-main
```

### 2. Pull Base Images (First Time Only)
```bash
docker compose pull
```

### 3. Start All Services
```bash
npm run start:dev
```

**Wait 2-5 minutes** for all services to build and start.

### 4. Check Status (In New Terminal)
```bash
cd /Users/ahsen/Downloads/food-app-main
docker compose ps
```

All services should show "Up" or "Up (healthy)".

### 5. Run Migrations
```bash
npm install
npm run migrate
```

### 6. Test Health Endpoint
```bash
curl http://localhost/api/auth/health
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "status": "healthy",
    "service": "auth-service",
    "timestamp": "...",
    "database": "connected"
  }
}
```

### 7. Test User Registration (Full Route Test)
```bash
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "name": "Test User",
    "role": "customer"
  }'
```

### 8. Access Swagger UI
Open browser: **http://localhost:3001/api-docs**

---

## ✅ Verification

If health endpoint returns success → **Everything is working!** ✅

## 🐛 If Something Fails

```bash
docker compose logs auth-service

docker compose restart auth-service

docker compose ps
```

---

**See `docs/LOCAL_TESTING_GUIDE.md` for detailed guide.**
