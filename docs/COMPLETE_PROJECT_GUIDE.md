# Complete Project Guide - Food Delivery Platform

## 📚 Table of Contents

1. [Project Overview](#project-overview)
2. [How It Works](#how-it-works)
3. [Architecture Deep Dive](#architecture-deep-dive)
4. [Deployment Guide](#deployment-guide)
5. [What You Need From Client](#what-you-need-from-client)
6. [Next Steps](#next-steps)

---

## 🎯 Project Overview

This is a **microservices-based food delivery platform backend** built with:
- **7 Independent Microservices** (each handles a specific domain)
- **PostgreSQL Database** (schema-based isolation per service)
- **Redis** (caching & pub/sub messaging)
- **Elasticsearch** (restaurant search)
- **NGINX API Gateway** (single entry point)
- **Docker & Docker Compose** (containerization)
- **CI/CD Pipeline** (GitHub Actions for automated deployment)

---

## 🔄 How It Works

### High-Level Flow

```
Client Request
    ↓
NGINX API Gateway (Port 80)
    ↓
Routes to Appropriate Microservice
    ↓
Service Processes Request
    ↓
May Call Other Services (via REST API)
    ↓
Interacts with Database/Redis/Elasticsearch
    ↓
Returns Response via Gateway
    ↓
Client Receives Response
```

### Request Flow Example: Placing an Order

1. **Client** → `POST /api/orders` (through NGINX Gateway)
2. **NGINX** → Routes to `order-service:3003`
3. **Order Service** → Validates request
4. **Order Service** → Calls `auth-service` to verify user token
5. **Order Service** → Calls `restaurant-service` to verify restaurant/menu
6. **Order Service** → Creates order in database
7. **Order Service** → Publishes event to Redis (order created)
8. **Payment Service** → Listens to Redis event → Processes payment
9. **Notification Service** → Listens to Redis event → Sends notification
10. **Delivery Service** → Listens to Redis event → Assigns delivery
11. **Response** → Returns order details to client

### Service Responsibilities

#### 1. **Auth Service** (Port 3001)
- User registration & login
- JWT token generation & validation
- Password hashing & reset
- User profile management
- Role-based access control (customer, restaurant, admin, driver)

#### 2. **Restaurant Service** (Port 3002)
- Restaurant CRUD operations
- Menu management
- Menu item management
- Restaurant images/banners
- Search via Elasticsearch
- Restaurant availability

#### 3. **Order Service** (Port 3003)
- Order creation & management
- Order status tracking
- Order history
- Order items management
- Publishes order events to Redis

#### 4. **Delivery Service** (Port 3004)
- Delivery assignment
- Driver management
- Delivery tracking
- Delivery status updates
- Listens to order events from Redis

#### 5. **Payment Service** (Port 3005)
- Payment processing
- Payment methods management
- Payment history
- Wallet management
- Listens to order events from Redis

#### 6. **Notification Service** (Port 3006)
- Email notifications (SMTP)
- Push notifications (future)
- Notification history
- Listens to events from Redis

#### 7. **Admin Analytics Service** (Port 3007)
- Dashboard statistics
- Revenue analytics
- Order analytics
- User analytics
- Restaurant analytics

---

## 🏗️ Architecture Deep Dive

### Microservices Communication

**Synchronous (REST API):**
- Services call each other via HTTP REST APIs
- Example: Order Service calls Auth Service to validate token
- Uses service URLs: `http://auth-service:3001/auth/verify`

**Asynchronous (Redis Pub/Sub):**
- Services publish events to Redis channels
- Other services subscribe and react to events
- Example: Order created → Payment Service processes payment

### Database Architecture

**Single PostgreSQL Instance, Multiple Schemas:**
- One database: `food_delivery`
- Each service has its own schema:
  - `auth` schema → Auth Service tables
  - `restaurant` schema → Restaurant Service tables
  - `orders` schema → Order Service tables
  - `delivery` schema → Delivery Service tables
  - `payments` schema → Payment Service tables

**Why This Approach?**
- Data isolation per service
- No cross-service database access
- Services communicate via APIs only
- Easier to scale individual services

### API Gateway (NGINX)

**Purpose:**
- Single entry point for all clients
- Routes requests to appropriate services
- Handles CORS
- Load balancing (ready for multiple instances)

**Routing Rules:**
- `/api/auth/*` → `auth-service:3001`
- `/api/restaurants/*` → `restaurant-service:3002`
- `/api/orders/*` → `order-service:3003`
- `/api/deliveries/*` → `delivery-service:3004`
- `/api/payments/*` → `payment-service:3005`
- `/api/notifications/*` → `notification-service:3006`
- `/api/admin/*` → `admin-analytics-service:3007`

### Shared Utilities

Located in `/shared` directory:
- **logger** - Structured logging (Pino)
- **api-response** - Standardized API responses
- **error-handler** - Custom error classes
- **validation** - Request validation utilities
- **config-loader** - Environment config loader
- **db-connection** - PostgreSQL connection pool
- **swagger-config** - Swagger/OpenAPI setup

---

## 🚀 Deployment Guide

### Deployment Options

#### Option 1: Automated CI/CD (Recommended)

**How It Works:**
1. Push code to `main` branch
2. CI Pipeline runs (tests, linting, type checking)
3. If CI passes → CD Pipeline triggers
4. CD Pipeline builds Docker images
5. Images pushed to GitHub Container Registry (GHCR)
6. Server pulls images and deploys via SSH

**Setup Required:**
- GitHub repository
- GitHub Secrets configured
- Server with SSH access
- Docker installed on server

#### Option 2: Manual Deployment

**Steps:**
1. Build Docker images locally
2. Push images to registry
3. SSH into server
4. Pull images
5. Run deployment script

---

## 📋 What You Need From Client

### 1. Server Access

**Required:**
- ✅ **Server IP/Hostname**
- ✅ **SSH Access** (username + private key or password)
- ✅ **Server OS** (Ubuntu 22.04 recommended)
- ✅ **Root/Sudo Access** (for Docker installation)

**Questions to Ask:**
- Do you have a server already? (AWS, DigitalOcean, Azure, etc.)
- What's the server IP address?
- Can you provide SSH access?
- Do you have a domain name? (optional, for production)

### 2. Database Credentials

**Required:**
- ✅ **PostgreSQL Password** (strong password for production)
- ✅ **Database Name** (default: `food_delivery`)

**Questions to Ask:**
- Do you want to use the default database name `food_delivery`?
- What password should we use? (must be strong)

### 3. Security Secrets

**Required:**
- ✅ **JWT Secret** (for token signing)
- ✅ **PostgreSQL Password** (already mentioned above)

**Generate JWT Secret:**
```bash
openssl rand -base64 32
```

### 4. Email Configuration (SMTP)

**Required for Production:**
- ✅ **SMTP Host** (e.g., `smtp.gmail.com`, `smtp.sendgrid.net`)
- ✅ **SMTP Port** (usually `587` for TLS or `465` for SSL)
- ✅ **SMTP Username** (email address)
- ✅ **SMTP Password** (app password)
- ✅ **SMTP From Address** (sender email)

**Questions to Ask:**
- Do you have an email service? (Gmail, SendGrid, AWS SES, etc.)
- What email should notifications come from?
- Do you have SMTP credentials?

**Optional for Development:**
- Can leave empty (emails will be logged to console)

### 5. Domain & SSL (Optional but Recommended)

**For Production:**
- ✅ **Domain Name** (e.g., `api.foodapp.com`)
- ✅ **SSL Certificate** (Let's Encrypt recommended)

**Questions to Ask:**
- Do you have a domain name?
- Do you want HTTPS? (highly recommended)
- Can you configure DNS? (point domain to server IP)

### 6. GitHub Repository Access

**Required for CI/CD:**
- ✅ **Repository URL**
- ✅ **GitHub Username/Organization**
- ✅ **GitHub Token** (for container registry)

**Questions to Ask:**
- Is the repository on GitHub?
- What's the repository URL?
- Can you create a GitHub Personal Access Token (PAT)?
- What's your GitHub username/organization?

### 7. First Admin User

**Required:**
- ✅ **Admin Email** (for first admin account)
- ✅ **Admin Password** (strong password)

**Questions to Ask:**
- What email should be used for the first admin account?
- What password should we set? (must be strong)

---

## 🎯 Next Steps

### Phase 1: Gather Information (Week 1)

**Action Items:**
1. ✅ **Contact Client** - Request all information above
2. ✅ **Document Everything** - Create a deployment checklist
3. ✅ **Verify Server Access** - Test SSH connection
4. ✅ **Check Server Requirements** - Ensure Docker can be installed

**Deliverable:** Complete information checklist

### Phase 2: Server Setup (Week 1-2)

**Action Items:**
1. ✅ **Provision Server** (if not already done)
2. ✅ **Install Docker & Docker Compose**
3. ✅ **Create Deployment User**
4. ✅ **Configure Firewall** (open ports 80, 443, 22)
5. ✅ **Set Up Domain DNS** (if applicable)

**Commands:**
```bash
# On server
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Phase 3: GitHub Setup (Week 2)

**Action Items:**
1. ✅ **Create GitHub Secrets** (see below)
2. ✅ **Test CI Pipeline** (push to branch)
3. ✅ **Verify CD Pipeline** (after CI passes)

**GitHub Secrets to Create:**

Go to: `Repository → Settings → Secrets and variables → Actions`

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SSH_HOST` | Server IP address | `123.45.67.89` |
| `SSH_USER` | SSH username | `deploy` |
| `SSH_PRIVATE_KEY` | SSH private key | `-----BEGIN RSA PRIVATE KEY-----...` |
| `POSTGRES_PASSWORD` | Database password | `StrongPassword123!` |
| `JWT_SECRET` | JWT signing secret | `generated-secret-key` |
| `GH_PAT` | GitHub Personal Access Token | `ghp_xxxxxxxxxxxx` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `notifications@foodapp.com` |
| `SMTP_PASSWORD` | SMTP password | `app-password` |
| `SMTP_FROM` | From email | `notifications@foodapp.com` |

### Phase 4: First Deployment (Week 2)

**Action Items:**
1. ✅ **Update `.env.example`** with client values
2. ✅ **Push to `main` branch**
3. ✅ **Monitor CI Pipeline** (check GitHub Actions)
4. ✅ **Monitor CD Pipeline** (check deployment logs)
5. ✅ **Verify Services** (health checks)

**Verification Commands:**
```bash
# On server
cd $HOME/food-app
docker compose ps  # Check all services are running
curl http://localhost/api/auth/health  # Test gateway
curl http://localhost:3001/health  # Test auth service
```

### Phase 5: Post-Deployment (Week 2-3)

**Action Items:**
1. ✅ **Run Database Migrations** (if not auto-run)
2. ✅ **Create First Admin User** (if not auto-created)
3. ✅ **Test All Endpoints** (via Swagger UI)
4. ✅ **Configure SSL** (if domain provided)
5. ✅ **Set Up Monitoring** (logs, health checks)
6. ✅ **Document API Endpoints** (share Swagger URLs)

**Migration Command:**
```bash
# On server
cd $HOME/food-app
npm install
npm run migrate
```

### Phase 6: Production Hardening (Week 3)

**Action Items:**
1. ✅ **Review Security** (change default passwords)
2. ✅ **Set Up Backups** (automated database backups)
3. ✅ **Configure Logging** (centralized logging)
4. ✅ **Set Up Monitoring** (uptime monitoring)
5. ✅ **Performance Testing** (load testing)
6. ✅ **Documentation** (deployment runbook)

---

## 📝 Deployment Checklist

### Pre-Deployment

- [ ] Server provisioned and accessible
- [ ] Docker & Docker Compose installed
- [ ] SSH access configured
- [ ] GitHub repository access confirmed
- [ ] All GitHub Secrets configured
- [ ] Domain DNS configured (if applicable)
- [ ] SMTP credentials obtained
- [ ] Database password decided
- [ ] JWT secret generated
- [ ] First admin credentials decided

### Deployment

- [ ] Code pushed to `main` branch
- [ ] CI Pipeline passes
- [ ] CD Pipeline executes successfully
- [ ] Docker images built and pushed
- [ ] Services deployed to server
- [ ] Database migrations run
- [ ] Health checks pass
- [ ] All services running

### Post-Deployment

- [ ] First admin user created
- [ ] API endpoints tested
- [ ] Swagger documentation accessible
- [ ] SSL certificate configured (if domain)
- [ ] Monitoring set up
- [ ] Backups configured
- [ ] Documentation updated

---

## 🔧 Manual Deployment (If CI/CD Not Available)

### Step 1: Build Images Locally

```bash
# On your local machine
cd /path/to/food-app-main

# Build all images
docker compose build

# Tag images for registry (replace YOUR_USERNAME)
docker tag food-app-main-auth-service ghcr.io/YOUR_USERNAME/food-app-auth-service:latest
docker tag food-app-main-restaurant-service ghcr.io/YOUR_USERNAME/food-app-restaurant-service:latest
# ... repeat for all services
```

### Step 2: Push Images

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Push images
docker push ghcr.io/YOUR_USERNAME/food-app-auth-service:latest
# ... repeat for all services
```

### Step 3: Deploy to Server

```bash
# SSH into server
ssh user@server-ip

# Clone repository (if first time)
git clone https://github.com/YOUR_USERNAME/food-app.git $HOME/food-app

# Update docker-compose.yml with image names
cd $HOME/food-app
# Edit docker-compose.yml to use ghcr.io images

# Create .env file
cp .env.example .env
# Edit .env with production values

# Pull images and start services
docker compose pull
docker compose up -d

# Run migrations
npm install
npm run migrate
```

---

## 🆘 Troubleshooting

### Services Not Starting

```bash
# Check logs
docker compose logs [service-name]

# Check service status
docker compose ps

# Restart service
docker compose restart [service-name]
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check database connection
docker compose exec postgres psql -U postgres -d food_delivery

# Check .env file
cat .env | grep POSTGRES
```

### Deployment Failures

1. **Check GitHub Actions logs** (CI/CD tab)
2. **Check server logs** (`docker compose logs`)
3. **Verify secrets** are set correctly
4. **Test SSH connection** manually
5. **Check Docker images** exist in registry

---

## 📞 Support & Resources

### Documentation Files

- `README.md` - Main project documentation
- `SETUP_GUIDE.md` - Local setup guide
- `RUNNING_THE_PROJECT.md` - Development workflow
- `TROUBLESHOOTING_DOCKER_BUILD.md` - Build issues
- `.github/workflows/README.md` - CI/CD documentation

### Useful Commands

```bash
# Development
npm run start:dev          # Start all services
npm run stop:all           # Stop all services
npm run migrate            # Run migrations

# Production
docker compose ps          # Check service status
docker compose logs -f     # View logs
docker compose restart     # Restart services
```

---

## ✅ Summary

**You now have:**
1. ✅ Complete understanding of the architecture
2. ✅ How services communicate
3. ✅ Deployment process (automated & manual)
4. ✅ Checklist of what to ask client
5. ✅ Step-by-step next steps

**Your immediate action:**
1. Contact client and gather all required information
2. Set up server (if not done)
3. Configure GitHub Secrets
4. Test first deployment
5. Verify everything works

**Good luck! 🚀**
