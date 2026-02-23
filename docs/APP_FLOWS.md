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

### Resend OTP

The same endpoint is used for **first-time OTP** and **resend**. No separate resend endpoint.

| Use case | Endpoint | Body | Behaviour |
|----------|----------|------|-----------|
| First time or resend to **both** | `POST /auth/signup/request-otp` | `email`, `phone` | Sends OTP to email and phone (default). |
| Resend to **email only** | `POST /auth/signup/request-otp` | `email`, `phone`, `send_phone: false` | Sends OTP only to email. |
| Resend to **phone only** | `POST /auth/signup/request-otp` | `email`, `phone`, `send_email: false` | Sends OTP only to phone (SMS). |
| Resend to **both** | `POST /auth/signup/request-otp` | `email`, `phone`, `send_email: true`, `send_phone: true` | Same as first time; OTP refreshed and sent to both. |

- **Optional body fields:** `send_email` (default `true`), `send_phone` (default `true`). At least one must be `true`.
- A new OTP is stored for the same email/phone; previous OTP remains valid until it expires (or is used). Frontend can show “Code sent again to email” / “Code sent again to phone” based on what was requested.
- With `USE_DEV_OTP=1`, resend still returns/logs the same dev OTP (`123456`).

**Legacy (still available):** `POST /auth/signup/email/request-otp` (email only), `POST /auth/signup/phone/request-otp` + `verify-otp` for the old 5-step flow.

### Testing OTP (how to get the correct OTP)

**Option A – Dev OTP (no notification service)**  
Use a fixed OTP so you can test without email/SMS or a running notification-service.

1. In `.env` (auth-service or root) set:
   ```bash
   USE_DEV_OTP=1
   ```
2. Restart the auth-service.
3. Call `POST /auth/signup/request-otp` with `email` and `phone`. The response may include `data.dev_otp` (e.g. `123456`), and the same code is logged in the auth-service console.
4. For **email verify** use OTP **`123456`** (or the value from `data.dev_otp` / logs).
5. For **register** use the same **`123456`** as `phone_otp`.

So in dev with `USE_DEV_OTP=1` you always use **`123456`** for both steps.

**Option B – Real notification service**  
Use the real notification-service so OTPs are sent by email/SMS.

1. Do **not** set `USE_DEV_OTP` (or set `USE_DEV_OTP=0`).
2. Ensure `NOTIFICATION_SERVICE_URL` points at your notification-service (e.g. `http://notification-service:3006` in Docker, or your deployed URL).
3. Run the notification-service (and configure SMTP/SMS so it can send).
4. Call `POST /auth/signup/request-otp`; the service will send the OTP to the given email and phone.
5. Get the **email OTP** from the inbox (or notification-service logs if it logs outgoing messages).
6. Use that code in `POST /auth/signup/email/verify-otp`.
7. Get the **phone OTP** from the SMS (or logs).
8. Use that code as `phone_otp` in `POST /auth/register`.

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
