# Local Testing & Development Guide

Complete step-by-step guide to run the application locally and test it.

## 🎯 Quick Start

### Step 1: Verify Prerequisites

```bash
docker --version
docker compose version

node --version
npm --version
```

### Step 2: Configure Environment

Your `.env` file should have these settings for Docker:

```env
# Database - Use 'postgres' as host (Docker service name)
POSTGRES_HOST=postgres
POSTGRES_PORT=5433
POSTGRES_DB=food_delivery
POSTGRES_USER=postgres
POSTGRES_PASSWORD=1234

# Redis - Use 'redis' as host (Docker service name)
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Service Ports
AUTH_SERVICE_PORT=3001
RESTAURANT_SERVICE_PORT=3002
ORDER_SERVICE_PORT=3003
DELIVERY_SERVICE_PORT=3004
PAYMENT_SERVICE_PORT=3005
NOTIFICATION_SERVICE_PORT=3006
ADMIN_ANALYTICS_SERVICE_PORT=3007
NGINX_PORT=80

# Environment
NODE_ENV=development
LOG_LEVEL=info

# Service URLs (for inter-service communication)
AUTH_SERVICE_URL=http://auth-service:3001
RESTAURANT_SERVICE_URL=http://restaurant-service:3002
ORDER_SERVICE_URL=http://order-service:3003
DELIVERY_SERVICE_URL=http://delivery-service:3004
PAYMENT_SERVICE_URL=http://payment-service:3005
NOTIFICATION_SERVICE_URL=http://notification-service:3006
ADMIN_ANALYTICS_SERVICE_URL=http://admin-analytics-service:3007
```

### Step 3: Pull Base Images (First Time Only)

```bash
cd /Users/ahsen/Downloads/food-app-main

# Pull required base images
docker compose pull
```

### Step 4: Start All Services

```bash
# Start all services with hot-reload
npm run start:dev

# OR start in background
docker compose up --build -d
```

**Wait for all services to start** (this takes 2-5 minutes on first run)

### Step 5: Check Service Status

```bash
# In a new terminal, check if all services are running
docker compose ps
```

You should see all services with status "Up" or "Up (healthy)":
- ✅ postgres (healthy)
- ✅ redis (healthy)
- ✅ elasticsearch (healthy)
- ✅ auth-service
- ✅ restaurant-service
- ✅ order-service
- ✅ delivery-service
- ✅ payment-service
- ✅ notification-service
- ✅ admin-analytics-service
- ✅ nginx

### Step 6: Run Database Migrations

```bash
# Install dependencies (if not done)
npm install

# Run migrations
npm run migrate
```

### Step 7: Test a Route

#### Option A: Test Health Endpoint (Easiest)

```bash
# Test NGINX Gateway health
curl http://localhost/health

# Test Auth Service through Gateway
curl http://localhost/api/auth/health

# Test Auth Service directly
curl http://localhost:3001/health

# Test Restaurant Service through Gateway
curl http://localhost/api/restaurants/health
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "status": "healthy",
    "service": "auth-service",
    "timestamp": "2025-02-18T12:00:00.000Z",
    "database": "connected"
  }
}
```

#### Option B: Test User Registration (Full Flow)

```bash
# Register a new user
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "name": "Test User",
    "role": "customer"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "test@example.com",
      "name": "Test User",
      "role": "customer"
    }
  }
}
```

#### Option C: Test Login (Get JWT Token)

```bash
# Login
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid-here",
      "email": "test@example.com",
      "name": "Test User",
      "role": "customer"
    }
  }
}
```

### Step 8: Access Swagger UI (Interactive Testing)

Open your browser and visit:

- **Auth Service**: http://localhost:3001/api-docs
- **Restaurant Service**: http://localhost:3002/api-docs
- **Order Service**: http://localhost:3003/api-docs
- **Delivery Service**: http://localhost:3004/api-docs
- **Payment Service**: http://localhost:3005/api-docs
- **Notification Service**: http://localhost:3006/api-docs
- **Admin Analytics Service**: http://localhost:3007/api-docs

**Or through Gateway:**
- **Auth Service**: http://localhost/api/auth/api-docs

### Step 9: Test Protected Route (With JWT Token)

```bash
# First, get a token (use the token from login response)
TOKEN="your-jwt-token-here"

# Test a protected route (e.g., get user profile)
curl http://localhost/api/auth/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔍 Verification Checklist

- [ ] All Docker containers are running (`docker compose ps`)
- [ ] Database migrations completed (`npm run migrate`)
- [ ] Health endpoint returns success (`curl http://localhost/api/auth/health`)
- [ ] Can register a user (`POST /api/auth/register`)
- [ ] Can login (`POST /api/auth/login`)
- [ ] Can access Swagger UI (`http://localhost:3001/api-docs`)
- [ ] Can access protected routes with JWT token

---

## 🐛 Troubleshooting

### Services Not Starting

```bash
# Check logs
docker compose logs [service-name]

# Example: Check auth service logs
docker compose logs auth-service

# Restart a service
docker compose restart auth-service
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check database connection
docker compose exec postgres psql -U postgres -d food_delivery

# Verify .env has correct settings
cat .env | grep POSTGRES
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3001

# Stop the process or change port in .env
```

### Migrations Failing

```bash
# Check if database is ready
docker compose exec postgres pg_isready -U postgres

# Run migrations again
npm run migrate

# Check migration status
docker compose exec postgres psql -U postgres -d food_delivery -c "\dn"
```

---

## 📝 Common Test Routes

### Auth Service

```bash
# Health check
curl http://localhost/api/auth/health

# Register user
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"Pass123!","name":"Test User","role":"customer"}'

# Login
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"Pass123!"}'

# Get profile (requires token)
curl http://localhost/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Restaurant Service

```bash
# Health check
curl http://localhost/api/restaurants/health

# Get restaurants (requires token)
curl http://localhost/api/restaurants/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎯 Next Steps After Local Testing

Once everything works locally:

1. ✅ Test all major endpoints
2. ✅ Verify database operations
3. ✅ Test inter-service communication
4. ✅ Check logs for errors
5. ✅ Verify Swagger documentation
6. ✅ Ready for deployment!

---

## 💡 Tips

- **Use Swagger UI** for interactive testing (easier than curl)
- **Check logs** if something doesn't work: `docker compose logs -f`
- **Restart services** if you make code changes: `docker compose restart [service]`
- **Keep .env updated** with correct Docker service names

---

**Happy Testing! 🚀**
