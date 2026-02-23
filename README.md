# Food Delivery Platform - Backend

A microservices-based backend for a food delivery platform built with Node.js, Express.js, PostgreSQL, and Redis.

## Architecture

This project follows a **microservices architecture** in a **monorepo** structure. Each service is an independent Node.js application that communicates via REST APIs.

### Services

- **auth-service** (Port 3001) - Authentication and authorization
- **restaurant-service** (Port 3002) - Restaurant and menu management
- **order-service** (Port 3003) - Order processing
- **delivery-service** (Port 3004) - Delivery management
- **payment-service** (Port 3005) - Payment processing
- **notification-service** (Port 3006) - Notifications
- **admin-analytics-service** (Port 3007) - Admin analytics

### Tech Stack

- **Runtime**: Node.js v20 LTS
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL v15.x (schema-based isolation)
- **Cache/PubSub**: Redis v7.x
- **API Gateway**: Nginx v1.24.x
- **Containerization**: Docker & Docker Compose
- **API Documentation**: Swagger/OpenAPI 3.0

## Project Structure

```
food-app/
├── services/                    # Microservices
│   ├── auth-service/
│   │   ├── src/
│   │   │   ├── routes/          # API routes
│   │   │   ├── middleware/       # Custom middleware
│   │   │   ├── utils/           # Service utilities
│   │   │   ├── db/              # Database connection
│   │   │   ├── config/          # Service configuration
│   │   │   ├── app.ts           # Express app setup
│   │   │   └── index.ts         # Entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   └── [other services...]
├── shared/                      # Shared utilities (workspace packages)
│   ├── logger/                  # Structured logging (Pino)
│   ├── api-response/            # Standardized API responses
│   ├── error-handler/           # Error handling utilities
│   ├── validation/              # Request validation
│   ├── config-loader/           # Environment config loader
│   ├── db-connection/           # PostgreSQL connection pool
│   └── swagger-config/          # Swagger/OpenAPI configuration
├── database/
│   ├── migrations/              # Legacy migrations (node-pg-migrate)
│   ├── migrations_initial/      # New initial schema (npm run migrate / migrate:fresh)
│   └── package.json
├── nginx/
│   └── nginx.conf              # API Gateway configuration
├── docker-compose.yml           # Docker orchestration
├── .env.example                 # Environment variables template
└── README.md
```

## Getting Started

### Prerequisites

- **Docker** v24.x or later
- **Docker Compose** v2.x or later
- **Node.js** v20 LTS (for local development without Docker)
- **npm** v10.x or later

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd food-app
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and update values as needed (see [Environment Variables](#environment-variables) section).

3. **Start all services with Docker Compose**

   ```bash
   docker compose up --build
   ```

   This will:

   - Build Docker images for all services
   - Start PostgreSQL, Redis, Nginx, and all 7 microservices
   - Mount volumes for hot-reload development

4. **Run database migrations**

   ```bash
   npm install
   npm run migrate
   ```

   This applies the **new initial schema** (`database/migrations/`) to the current database (e.g. `hassa`). It does **not** drop the database.

5. **Verify services are running**
   ```bash
   docker compose ps
   ```
   All services should show status "Up" and postgres/redis should be "healthy".

### Quick Health Check

Test that services are responding:

```bash
curl http://localhost/health
curl http://localhost:3001/health

curl http://localhost/api/auth/health
curl http://localhost/api/restaurants/health
curl http://localhost/api/orders/health
```

### Environment Variables

Key environment variables (see `.env.example` for full list):

#### First Admin Auto-Creation

The auth service automatically creates the first admin user on startup if none exists. Configure these optional environment variables:

| Variable                | Description                                    | Default                |
| ----------------------- | ---------------------------------------------- | ---------------------- |
| `FIRST_ADMIN_EMAIL`     | Email for the first admin user                 | `admin@foodapp.com`   |
| `FIRST_ADMIN_PASSWORD`  | Password for the first admin user              | `Admin123!`            |

**Important**: 
- Only creates admin if no admin users exist
- Change the default password immediately after first login
- Set strong passwords in production via environment variables

| Variable            | Description                   | Default                         |
| ------------------- | ----------------------------- | ------------------------------- |
| `POSTGRES_HOST`     | PostgreSQL host               | `postgres`                      |
| `POSTGRES_PORT`     | PostgreSQL host port (Docker) | `5433` (5432 inside containers) |
| `POSTGRES_DB`       | Database name                 | `hassa`                         |
| `POSTGRES_USER`     | Database user                 | `postgres`                      |
| `POSTGRES_PASSWORD` | Database password             | `postgres`                      |
| `REDIS_HOST`        | Redis host                    | `redis`                         |
| `REDIS_PORT`        | Redis port                    | `6379`                          |
| `JWT_SECRET`        | JWT signing secret            | **Change in production!**       |
| `JWT_EXPIRES_IN`    | Token expiration              | `24h`                           |
| `NODE_ENV`          | Environment                   | `development`                   |
| `LOG_LEVEL`         | Logging level                 | `info`                          |

**⚠️ Important**: Change `JWT_SECRET` to a secure random string in production!

## API Gateway (NGINX)

The application uses **NGINX** as an API Gateway to provide a single entry point for all microservices. All API requests should go through the gateway on port **80**.

### Gateway Routing

The NGINX gateway routes requests to the appropriate microservice based on URL paths:

| Gateway Path           | Backend Service           | Service Port | Notes                          |
| ---------------------- | ------------------------- | ------------ | ------------------------------ |
| `/api/auth/*`          | `auth-service`            | 3001         | Routes to `/auth/*` on backend |
| `/api/restaurants/*`   | `restaurant-service`      | 3002         | Routes to root `/` on backend  |
| `/api/orders/*`        | `order-service`           | 3003         | Routes to root `/` on backend  |
| `/api/deliveries/*`    | `delivery-service`        | 3004         | Routes to root `/` on backend  |
| `/api/payments/*`      | `payment-service`         | 3005         | Routes to root `/` on backend  |
| `/api/notifications/*` | `notification-service`    | 3006         | Routes to root `/` on backend  |
| `/api/admin/*`         | `admin-analytics-service` | 3007         | Routes to root `/` on backend  |
| `/health`              | NGINX                     | -            | Gateway health check           |

### Accessing Services

**Through API Gateway (Recommended):**

```bash
curl http://localhost/api/auth/register
curl http://localhost/api/auth/login
curl http://localhost/api/auth/health

curl http://localhost/api/restaurants/health
curl http://localhost/api/orders/health
```

**Direct Service Access (Development/Testing):**

```bash
curl http://localhost:3001/auth/register
curl http://localhost:3001/health
```

### Routing Behavior

- **Auth Service**: The gateway maps `/api/auth/*` → `/auth/*` on the backend service (e.g., `/api/auth/register` → `/auth/register`)
- **Other Services**: The gateway maps `/api/{service}/*` → `/*` on the backend service (e.g., `/api/restaurants/health` → `/health`)

### Benefits

- **Single Entry Point**: Clients only need to know one URL (port 80)
- **Service Abstraction**: Internal service ports are hidden from clients
- **Load Balancing Ready**: Upstream blocks can be extended for multiple service instances
- **Centralized Configuration**: All routing logic in one place (`nginx/nginx.conf`)

## API Standards

### Response Format

All APIs follow a standardized response format using the shared `api-response` utility.

**Success Response:**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information"
}
```

**Validation Error Response:**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Using API Response Helpers

```typescript
import {
  sendSuccess,
  sendError,
  HTTP_STATUS,
} from "../../shared/api-response/index";

return sendSuccess(
  res,
  { user: userData },
  "User created",
  HTTP_STATUS.CREATED
);

return sendError(res, "User not found", HTTP_STATUS.NOT_FOUND);
```

### HTTP Status Codes

Use appropriate status codes:

- `200` - OK (successful GET, PUT, PATCH)
- `201` - Created (successful POST)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error
- `503` - Service Unavailable (health check failures)

## Development Guide

### Development Workflow

#### Option 1: Docker Compose (Recommended)

All services run in containers with hot-reload via volume mounts:

```bash
# Start all services
docker compose up

# Start with rebuild
docker compose up --build

# Start in background
docker compose up -d

# View logs
docker compose logs -f [service-name]

# Restart a specific service
docker compose restart auth-service

# Stop all services
docker compose down
```

#### Option 2: Local Development (Without Docker)

For faster iteration on a single service:

```bash
# 1. Ensure PostgreSQL and Redis are running (via Docker or locally)
docker compose up postgres redis -d

# 2. Navigate to service directory
cd services/auth-service

# 3. Install dependencies
npm install

# 4. Start service (with watch mode)
npm run dev
```

**Note**: Update `.env` to use `localhost` instead of service names for database/Redis connections when running locally.

### Service Structure

Each service follows this structure:

```
service-name/
├── src/
│   ├── routes/          # API route handlers
│   ├── middleware/      # Custom middleware (auth, validation, etc.)
│   ├── utils/          # Service-specific utilities
│   ├── db/             # Database connection
│   ├── config/         # Service configuration
│   ├── app.ts          # Express app setup
│   └── index.ts        # Entry point (starts server)
├── Dockerfile
├── tsconfig.json        # TypeScript configuration
└── package.json
```

### Adding New Endpoints

1. **Create route file** (if needed):

   ```typescript
   // services/auth-service/src/routes/users.ts
   import express from "express";
   import { sendSuccess } from "../../shared/api-response/index";

   const router = express.Router();

   router.get("/users", async (req, res) => {
     // Your logic here
     return sendSuccess(res, { users: [] });
   });

   export default router;
   ```

2. **Add Swagger documentation**:

   ```typescript
   /**
    * @swagger
    * /users:
    *   get:
    *     summary: Get all users
    *     tags: [Users]
    *     responses:
    *       200:
    *         description: List of users
    *         content:
    *           application/json:
    *             schema:
    *               $ref: '#/components/schemas/SuccessResponse'
    */
   router.get("/users", async (req, res) => {
     // ...
   });
   ```

3. **Register route in app.ts**:

   ```typescript
   import userRoutes from "./routes/users";
   app.use("/users", userRoutes);
   ```

4. **Add validation** (if needed):

   ```typescript
   import { body } from "express-validator";
   import { validateRequest } from "../../shared/validation/index";

   router.post(
     "/users",
     [body("email").isEmail()],
     validateRequest,
     async (req, res) => {
       /* ... */
     }
   );
   ```

### API Documentation (Swagger/OpenAPI)

All services include interactive API documentation via Swagger UI. You can access the documentation through the API Gateway (recommended) or directly via service ports.

#### Accessing API Documentation

**Through API Gateway (Production/Recommended):**

| Service                 | Gateway URL                                     | Direct Service URL               |
| ----------------------- | ----------------------------------------------- | -------------------------------- |
| Auth Service            | `http://your-domain/api/auth/api-docs`          | `http://localhost:3001/api-docs` |
| Restaurant Service      | `http://your-domain/api/restaurants/api-docs`   | `http://localhost:3002/api-docs` |
| Order Service           | `http://your-domain/api/orders/api-docs`        | `http://localhost:3003/api-docs` |
| Delivery Service        | `http://your-domain/api/deliveries/api-docs`    | `http://localhost:3004/api-docs` |
| Payment Service         | `http://your-domain/api/payments/api-docs`      | `http://localhost:3005/api-docs` |
| Notification Service    | `http://your-domain/api/notifications/api-docs` | `http://localhost:3006/api-docs` |
| Admin Analytics Service | `http://your-domain/api/admin/api-docs`         | `http://localhost:3007/api-docs` |

**Note:** Replace `your-domain` with your actual server domain or IP address (e.g., `http://119.156.243.111`).

#### Using Swagger UI

1. **Open Swagger UI** in your browser:

   - **Production**: `http://your-domain/api/{service}/api-docs` (e.g., `http://your-domain/api/auth/api-docs`)
   - **Development**: `http://localhost:{port}/api-docs` (e.g., `http://localhost:3001/api-docs`)

2. **Explore endpoints** - See all available APIs with descriptions, request/response schemas, and examples

3. **Test endpoints**:

   - Click "Try it out" on any endpoint
   - Fill in request parameters/body
   - Click "Execute"
   - View response with status code, headers, and body

4. **Authenticate** (for protected endpoints):
   - Click the "Authorize" button at the top
   - Enter JWT token from `/auth/login` endpoint
   - Click "Authorize"
   - All subsequent requests will include the token in the `Authorization` header

#### Documenting Endpoints

Use JSDoc comments with Swagger annotations:

```typescript
/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         email:
 *           type: string
 *           format: email
 *
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get("/users/:id", async (req, res) => {
  // Implementation
});
```

### Health Checks

All services expose a health endpoint:

```bash
# NGINX gateway health check
curl http://localhost/health

# Direct service access
curl http://localhost:3001/health

# Through NGINX gateway
curl http://localhost/api/auth/health
```

Expected response:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "status": "healthy",
    "service": "auth-service",
    "timestamp": "2024-01-14T16:00:00.000Z",
    "database": "connected"
  }
}
```

## Database

### Schema Structure

The database uses **schema-based isolation** - each service has its own PostgreSQL schema:

- `auth` - Users, roles, authentication
- `restaurant` - Restaurants, menus, menu items
- `orders` - Orders, order items
- `delivery` - Deliveries, drivers
- `payments` - Payments, wallets

### Running Migrations

- **`npm run migrate`** – Applies the new initial schema from `database/migrations/` to the current database (no DB drop).

See **docs/APP_FLOWS.md** for details.

## Shared Utilities

The `shared/` directory contains reusable packages used by all services:

### Available Utilities

- **`logger`** - Structured JSON logging with Pino

  ```typescript
  import { createLogger } from "../shared/logger/index";
  const logger = createLogger("service-name", "info");
  logger.info({ userId: 123 }, "User logged in");
  ```

- **`api-response`** - Standardized API responses

  ```typescript
  import { sendSuccess, sendError } from "../shared/api-response/index";
  ```

- **`error-handler`** - Custom error classes and middleware

  ```typescript
  import {
    NotFoundError,
    ValidationError,
  } from "../shared/error-handler/index";
  throw new NotFoundError("User not found");
  ```

- **`validation`** - Request validation with express-validator

  ```typescript
  import {
    validateRequest,
    commonValidators,
  } from "../shared/validation/index";
  ```

- **`config-loader`** - Environment variable loader

  ```typescript
  import { loadConfig } from "../shared/config-loader/index";
  ```

- **`db-connection`** - PostgreSQL connection pool

  ```typescript
  import pool from "../db/connection";
  const result = await pool.query("SELECT * FROM users");
  ```

- **`swagger-config`** - Swagger/OpenAPI configuration
  ```typescript
  import { createSwaggerSpec } from "../shared/swagger-config/index";
  ```

## Testing APIs

### Using Swagger UI (Recommended)

Swagger UI provides an interactive interface to test all APIs. See the [API Documentation](#api-documentation-swaggeropenapi) section for details.

### Using Postman/Insomnia

1. Import the OpenAPI spec from:
   - **Production**: `http://your-domain/api/{service}/api-docs/swagger.json` (e.g., `http://your-domain/api/auth/api-docs/swagger.json`)
   - **Development**: `http://localhost:{port}/api-docs/swagger.json` (e.g., `http://localhost:3001/api-docs/swagger.json`)
2. Or manually create requests using the service URLs
3. Add JWT token in Authorization header: `Bearer <token>`

## Common Development Tasks

### Adding a New Service

1. Create service directory: `services/new-service/`
2. Copy structure from existing service
3. Update `docker-compose.yml` with new service
4. Add service port to `.env`
5. **Update NGINX config** (`nginx/nginx.conf`):

   - Add upstream block for the new service
   - Add location block mapping `/api/{service-name}/` to the service
   - Example:

     ```nginx
     upstream new-service {
         server new-service:3008;
     }

     location /api/new-service/ {
         proxy_pass http://new-service/;
         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
     }
     ```

6. Restart NGINX: `docker compose restart nginx`

### Debugging

**View service logs:**

```bash
docker compose logs -f auth-service
```

**Check service status:**

```bash
docker compose ps
```

**Access service container:**

```bash
docker compose exec auth-service sh
```

**Check database:**

```bash
docker compose exec postgres psql -U postgres -d hassa
```

### Troubleshooting

**Service won't start:**

- Check logs: `docker compose logs [service-name]`
- Verify environment variables in `.env`
- Ensure ports aren't already in use
- Check database/Redis connectivity

**Module not found errors:**

- Restart service: `docker compose restart [service-name]`
- Dependencies install automatically on container start
- Ensure TypeScript compilation completed successfully

**Database connection errors:**

- Verify PostgreSQL is running: `docker compose ps postgres`
- Check connection string in `.env`
- Ensure migrations have run: `npm run migrate` (or `npm run migrate:fresh` for a clean DB)

**Swagger not loading:**

- Wait for dependencies to install (check logs)
- Verify service is running: `curl http://localhost:3001/health`
- Check browser console for errors

## Code Conventions

- **TypeScript**: All code is written in TypeScript (`.ts` files)
- **ES Modules**: Use `import/export` syntax
- **Type Safety**: Leverage TypeScript types and interfaces
- **Async/Await**: Prefer over callbacks
- **Error Handling**: Use shared error handler middleware
- **Validation**: Use express-validator with shared validators
- **Logging**: Use structured logging (Pino)
- **Naming**: camelCase for variables, kebab-case for files
- **Comments**: Document complex logic, use JSDoc for Swagger

## Milestone 1 Status

✅ Backend foundation and security

- ✅ Microservices structure
- ✅ Database schemas (migrations)
- ✅ JWT authentication
- ✅ API standards
- ✅ Logging and error handling
- ✅ Docker Compose setup
- ✅ Swagger/OpenAPI documentation

## CI/CD Pipeline

This project uses GitHub Actions for Continuous Integration (CI) and Continuous Deployment (CD).

### Why Separate CI and CD Files?

We maintain separate CI and CD pipeline files (`.github/workflows/ci.yml` and `.github/workflows/cd.yml`) for several important reasons:

#### 1. **Different Triggers and Frequency**

**CI Pipeline** (`ci.yml`):

- Runs on **every push and pull request** to `main` and `develop` branches
- Runs frequently (multiple times per day)
- Purpose: Validate code quality before merging

**CD Pipeline** (`cd.yml`):

- Runs only after CI Pipeline completes successfully
- Triggers on:
  - Successful CI completion on `main` branch (automatic deployment)
  - Version tags like `v1.0.0` (creates GitHub release)
  - Manual workflow dispatch (bypasses CI check)
- Runs less frequently (only when deploying)
- Purpose: Deploy validated code to server

#### 2. **Different Purposes**

**CI Pipeline** focuses on:

- ✅ TypeScript type checking
- ✅ Code linting (ESLint)
- ✅ Security scanning (npm audit)
- ✅ Running tests (Jest)
- ✅ Building Docker images (for validation)
- ✅ Health checks
- ✅ Migration validation

**CD Pipeline** focuses on:

- 🚀 Pushing Docker images to container registry
- 🚀 Deploying to server
- 🚀 Creating GitHub releases for version tags
- 🚀 Automatic database backups before deployment

#### 3. **Different Security and Permissions**

**CI Pipeline**:

- Needs read access to code
- No deployment permissions required
- Safe to run on PRs from forks

**CD Pipeline**:

- Needs write access to container registry
- Requires deployment secrets (SSH keys, database passwords, etc.)
- Needs access to deployment server
- Waits for CI to pass before deploying (prevents deploying broken code)

#### 4. **Separation of Concerns**

- **CI**: Validates code quality
- **CD**: Deploys validated code

This separation allows:

- Running CI without deploying
- Deploying only when CI passes
- Different teams managing CI vs CD
- Independent updates to CI and CD processes

#### 5. **Performance and Cost**

- CI runs frequently, so it should be fast and lightweight
- CD runs less frequently but may do heavier work (image pushes, deployments)

### CI Pipeline Overview

The CI pipeline (`.github/workflows/ci.yml`) runs automatically on every push and PR:

1. **Type Check** - Validates TypeScript types
2. **Lint** - Runs ESLint with zero warnings tolerance
3. **Security Audit** - Scans for vulnerabilities (non-blocking)
4. **Validate Migrations** - Validates migration files and syntax
5. **Test** - Runs Jest with PostgreSQL and Redis services
6. **Build Docker Images** - Builds all 7 Docker service images (validates they build correctly)

All jobs run in parallel for faster execution.

### CD Pipeline Overview

The CD pipeline (`.github/workflows/cd.yml`) handles deployment and **only runs after CI Pipeline completes successfully**:

1. **Check CI Status** - Verifies CI Pipeline succeeded before proceeding
2. **Build and Push** - Builds and pushes Docker images to GitHub Container Registry
3. **Deploy** - Deploys to server via SSH
   - Automatic deployment on push to `main` branch
   - Manual deployment via workflow dispatch
   - Tag-based deployments (version tags like `v1.0.0`)
4. **Post-Deployment** - Creates GitHub release for version tags

### Running CI Checks Locally

You can run all CI checks locally before pushing:

```bash
# Run all CI checks
npm run ci

# Individual checks
npm run type-check  # TypeScript type checking
npm run lint        # ESLint (TypeScript-aware)
npm run test        # Jest tests (with TypeScript support)
npm run audit       # Security audit
```

### Pipeline Status

- Check the **Actions** tab in GitHub to see pipeline status
- All CI jobs must pass before merging
- CD only runs after CI Pipeline completes successfully on `main` branch
- This ensures broken code is never deployed

For more details, see [`.github/workflows/README.md`](.github/workflows/README.md).

## Backup System

The platform includes an automated backup system to protect your data.

### Automatic Backups

**Pre-Deployment Backups:**

- Database backups are automatically created before each deployment
- Backups are stored in the `backups/` directory on the server
- Format: `backup_YYYYMMDD_HHMMSS.sql` (e.g., `backup_20260116_143022.sql`)
- Location: `$HOME/food-app/backups/`

### Backup Process

1. **Automatic Backup** (during deployment):

   - Triggered automatically by the deployment script
   - Only runs if PostgreSQL container is running
   - Creates a full database dump using `pg_dump`
   - Saves to `backups/` folder with timestamp

2. **Backup Verification**:
   - Deployment script verifies backup was created successfully
   - Shows backup filename on success
   - Warns if backup creation fails

### Manual Backup

You can create a manual backup at any time:

```bash
# On your server
cd $HOME/food-app
mkdir -p backups
docker compose exec -T postgres pg_dump -U postgres hassa > backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restoring from Backup

To restore a database backup:

```bash
# On your server
cd $HOME/food-app

# List available backups
ls -lh backups/

# Restore a specific backup (replace with actual filename)
docker compose exec -T postgres psql -U postgres hassa < backups/backup_20260116_143022.sql
```

**⚠️ Warning:** Restoring a backup will overwrite the current database. Make sure to create a backup before restoring.

### Backup Management

**View Backups:**

```bash
cd $HOME/food-app
ls -lh backups/
```

**Move Existing Backups:**
If you have old backups in the root directory, move them to the backups folder:

```bash
cd $HOME/food-app
mkdir -p backups
mv backup_*.sql backups/ 2>/dev/null || echo "No backup files found"
```

**Cleanup Old Backups:**

```bash
# Remove backups older than 30 days
find $HOME/food-app/backups -name "backup_*.sql" -mtime +30 -delete
```

### Backup Best Practices

1. **Regular Backups**: Automatic backups run before each deployment
2. **Off-Site Storage**: Consider copying backups to cloud storage (S3, Google Cloud, etc.)
3. **Retention Policy**: Keep backups for at least 30 days
4. **Test Restores**: Periodically test restoring from backups to ensure they work
5. **Monitor Disk Space**: Ensure the server has enough space for backups

### Backup Storage

- **Location**: `$HOME/food-app/backups/`
- **Format**: PostgreSQL SQL dump files
- **Naming**: `backup_YYYYMMDD_HHMMSS.sql`
- **Size**: Varies based on database size (typically 1-100MB)

### What Gets Backed Up

- ✅ All database tables and data
- ✅ Database schema
- ✅ User accounts and roles
- ✅ All application data

### What's NOT Backed Up

- ❌ Redis data (cache - can be regenerated)
- ❌ Docker volumes (stored separately)
- ❌ Application code (in Git repository)
- ❌ Environment variables (stored in `.env` file)

### Backup Retention

Currently, backups are kept indefinitely. It's recommended to:

1. **Set up automatic cleanup** (e.g., keep last 30 days):

   ```bash
   # Add to crontab for daily cleanup
   0 2 * * * find $HOME/food-app/backups -name "backup_*.sql" -mtime +30 -delete
   ```

2. **Archive old backups** to cloud storage before deletion

3. **Keep critical backups** (e.g., before major deployments) longer

## Contributing

1. Create a feature branch
2. Follow code conventions
3. Add Swagger documentation for new endpoints
4. Test your changes
5. Submit a pull request

## License

ISC
