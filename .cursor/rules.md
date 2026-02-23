# Cursor Rules – Food Delivery Platform Backend

This file defines mandatory rules for all backend code generated or modified by Cursor.
All outputs MUST comply with these rules. Do not introduce alternatives or optional designs.

---

## 1. Architecture (Locked)

- Backend uses a MICROservices architecture
- Single MONOREPO with multiple Node.js services
- Each service is an independent Express.js application
- No monolithic architecture is allowed
- Services communicate via REST APIs and async events
- No direct database access across services

---

## 2. Repository Structure

- One Git repository
- Each service must have:
  - Its own package.json
  - Its own Express app
  - Its own config
  - Its own Dockerfile
- Shared code (if any) must live in a /shared folder
- docker-compose.yml must exist at repo root

Services list (final):

- auth-service
- restaurant-service
- order-service
- delivery-service
- payment-service
- notification-service
- admin-analytics-service

---

## 3. Tech Stack (Version Locked)

- Node.js: v20 LTS
- Framework: Express.js
- Language: TypeScript (ES2022+)
- Database: PostgreSQL v15.x
- Cache / PubSub: Redis v7.x
- Search: Elasticsearch v8.x
- Containers: Docker v24.x
- Orchestration: Docker Compose v2.x
- API Gateway: Nginx v1.24.x

No other technologies may be introduced without approval.

---

## 4. Database Rules (Strict)

- ONE PostgreSQL server
- ONE logical database
- Separate schema per service
- Each service owns its schema
- No cross-schema foreign keys
- No service may read or write another service's tables
- Communication between services must be via APIs/events only
- UUIDs for all primary keys
- All tables must include created_at and updated_at

### Migration Best Practices (MANDATORY)

- **NEVER edit existing migration files that have already been executed in production or shared databases**
- **ALWAYS create new migration files for schema changes** - Use sequential numbering (e.g., `202502130000001_initial_schema.sql`)
- Migration files must be in `database/migrations/` directory
- Each migration must have both `.up.sql` and `.down.sql` files
- Migration file naming: `{number}_{description}.{up|down}.sql`
- Use `CREATE TABLE IF NOT EXISTS` and `DROP TABLE IF EXISTS` for idempotency
- Include indexes in the same migration file as the table creation
- Test migrations in both directions (up and down)
- For local development only: If you can safely reset the database, editing existing migrations is acceptable
- Migration tool: `node-pg-migrate` (tracked via `pgmigrations` table in database)
- Commands:
  - `npm run migrate` - Run all pending migrations
  - `npm run migrate:down` - Rollback last migration
  - `npm run migrate:create <name>` - Create new migration file

---

## 5. Authentication & Authorization

- JWT-based authentication only
- Auth Service is the ONLY source of truth for users and roles
- Roles:
  - customer
  - restaurant
  - driver
  - admin
- Other services must validate tokens via Auth Service APIs
- No service may query auth tables directly

---

## 6. API Standards (Mandatory)

### Success Response

```json
{
  "success": true,
  "message": "string",
  "data": {}
}
```

---

## 7. Error Handling (Mandatory)

### Error Response Formats

All errors MUST use the shared error handler from `shared/error-handler/index.ts`.

#### Standard Error Response

For errors without field-specific information:

```json
{
  "success": false,
  "message": "Error message",
  "error": {
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

#### Field-Wise Error Response

For errors with field-specific validation or issues, use field-wise errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "phone",
      "message": "Phone number is not registered"
    },
    {
      "field": "password",
      "message": "Password is incorrect"
    }
  ]
}
```

### Error Handling Rules (MANDATORY)

1. **ALL route handlers MUST use `asyncHandler` wrapper**:
   ```typescript
   import { asyncHandler } from 'shared/error-handler/index';
   
   router.post('/endpoint', asyncHandler(async (req, res) => {
     // Your code here
   }));
   ```

2. **Use appropriate error classes**:
   - `ValidationError` - For validation failures (422)
   - `BadRequestError` - For bad requests (400)
   - `UnauthorizedError` - For authentication failures (401)
   - `ForbiddenError` - For authorization failures (403)
   - `NotFoundError` - For resource not found (404)
   - `ConflictError` - For resource conflicts (409)
   - `AppError` - For custom errors

3. **Field-wise errors MUST be used when errors relate to specific fields**:
   ```typescript
   import { ValidationError, createFieldError } from 'shared/error-handler/index';
   
   // Multiple field errors
   throw new ValidationError("Validation failed", [
     { field: "email", message: "Email is required" },
     { field: "password", message: "Password must be at least 8 characters" }
   ]);
   
   // Or using helper
   throw new ValidationError("Validation failed", [
     createFieldError("email", "Email is required"),
     createFieldError("password", "Password must be at least 8 characters")
   ]);
   ```

4. **Field-wise errors work with ANY error type**:
   ```typescript
   // BadRequestError with fields
   throw new BadRequestError("Invalid request", [
     { field: "email", message: "Email is already in use" }
   ]);
   
   // UnauthorizedError with fields
   throw new UnauthorizedError("Authentication failed", [
     { field: "token", message: "Token has expired" }
   ]);
   ```

5. **Express-validator errors automatically use field-wise format**:
   ```typescript
   import { validateRequest } from 'shared/validation/index';
   
   router.post('/endpoint', 
     [
       body('email').isEmail().withMessage('Email is required'),
       body('password').notEmpty().withMessage('Password is required'),
       validateRequest
     ],
     asyncHandler(async (req, res) => {
       // Handler code
     })
   );
   ```

6. **Global error handler MUST be last middleware**:
   ```typescript
   import errorHandler from './middleware/errorHandler';
   
   // ... all routes ...
   
   // Error handler MUST be last
   app.use(errorHandler);
   ```

7. **Check for field errors when needed**:
   ```typescript
   if (error.hasFieldErrors()) {
     const fieldErrors = error.getFieldErrors();
     // TypeScript knows fieldErrors is FieldError[]
   }
   ```

### Error Response Structure

- **Field-wise errors**: Use `errors` array (plural) with `field` and `message` properties
- **Standard errors**: Use `error` object (singular) with `code` and optional `details`
- **Never mix formats**: Choose either field-wise OR standard format, not both

### Examples

```typescript
// ✅ CORRECT: Field-wise errors
throw new ValidationError("Validation failed", [
  { field: "phone", message: "Phone number is not registered" },
  { field: "password", message: "Password is incorrect" }
]);

// ✅ CORRECT: Standard error
throw new NotFoundError("User not found");

// ❌ WRONG: Don't use try-catch without asyncHandler
router.post('/endpoint', async (req, res) => {
  // Missing asyncHandler wrapper
});

// ❌ WRONG: Don't mix error formats
// Don't return both "errors" array and "error" object
```
