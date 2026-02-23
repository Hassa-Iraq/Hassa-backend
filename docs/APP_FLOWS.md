# App Flows

Documentation for frontend and integration. Update when you add or change complex flows.

---

## 1. Registration (3-step flow)

**Flow:** User enters **email + phone** → we check both are free and send OTP to **both** in one call. Then user verifies **email OTP** on next screen. On last screen user enters **password + phone OTP** and we **register** (phone OTP is verified inside register). So phone/email “already registered” is caught at step 1 before any verification.

### API flow

| Step | Action | Endpoint | Body | Response / Next |
|------|--------|----------|------|-----------------|
| 1 | Request OTP (email + phone) | `POST /auth/signup/request-otp` | `email`, `phone` | `200` = OTPs sent to both. If email or phone already registered → `409`. |
| 2 | Verify email OTP | `POST /auth/signup/email/verify-otp` | `email`, `otp` | `200` + `next_step: "register"`. |
| 3 | Create account | `POST /auth/register` | `email`, `password`, `phone`, `phone_otp` | `201` + `token` + `user`. Email must be verified in step 2; phone OTP verified in this call. Header `X-App-Role` (optional). |

**Notes:**

- No `confirm_password` in API (validate on client only). No `accept_terms` in DB or API.
- Step 1 validates email/phone format and returns 409 if either is already registered, so user sees the error before verifying anything.
- Step 3 requires email to have been verified in the last 15 minutes and validates `phone_otp` then creates the user.
- Role from header `X-App-Role` (default customer).

**Legacy (still available):** `POST /auth/signup/email/request-otp` (email only), `POST /auth/signup/phone/request-otp` + `verify-otp` for the old 5-step flow.

---

## 2. Login

- **Email:** `POST /auth/login` with `email`, `password`.
- **Phone:** `POST /auth/login/phone` with `phone`, `password`.

Non-admin users must have `email_verified`; if they have a phone, they must also have `phone_verified`. Email-only users can log in after email verification.

---

## 3. Migrations (initial schema)

We use a **separate folder** for a clean initial schema (no dependency on the old migration set).

**Folder:** `database/migrations_initial/`  
**File:** `20250213000001_initial_schema.sql`

**npm scripts:**

- **`npm run migrate`** – Applies the new initial schema to the **current** database (does **not** drop or create the DB). Use when the DB (e.g. `hassa`) already exists (e.g. created by Docker) and you just want to apply/update the schema.
- **`npm run migrate:fresh`** – Drops old DBs (`food_delivery` and `hassa`), creates `hassa`, then applies the initial schema. Use on the server when you want to **remove the old DB** and start fresh. Loads `.env` from project root for `POSTGRES_*` if present.

**Manual (e.g. on server):** Run the SQL file against your database:

```bash
psql "$DATABASE_URL" -f database/migrations_initial/20250213000001_initial_schema.sql
# or
psql -h localhost -U postgres -d hassa -f database/migrations_initial/20250213000001_initial_schema.sql
```

This creates:

- `auth.roles` (customer, restaurant, driver, admin)
- `auth.users` (id, email, phone nullable, password_hash, role_id, email_verified, phone_verified, profile fields) – no confirm_password, no accept_terms
- `auth.otp_codes` (id, email nullable, phone nullable, code, expires_at, is_used, attempts, created_at) – one row per OTP, either email or phone

Later you can add more migrations in the same folder with timestamped filenames (e.g. `20250222000002_add_something.sql`).

### Create a fresh DB and remove the old one

Run **`npm run migrate:fresh`** (or **`./database/migrations_initial/run_fresh.sh`** from project root). This drops `food_delivery` and `hassa`, creates `hassa`, and runs the initial schema.

---

## 4. Adding or updating flows

When you add or change a flow that affects the frontend or other services, update this file (steps, endpoints, body, headers, and how to run migrations).
