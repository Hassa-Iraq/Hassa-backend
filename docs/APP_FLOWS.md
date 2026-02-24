# App Flows (Frontend)

API flows for registration and login. Use this for UI and integration.

---

## 1. Registration (3-step flow)

**Flow:** User enters **email + phone** → backend checks both are free and sends OTP to **both**. User verifies **email OTP** on the next screen. On the last screen user enters **password + phone OTP** and you call **register** (phone OTP is verified in that call). "Already registered" is returned at step 1 before any verification.

### API flow

| Step | Action | Endpoint | Body | Response / Next |
|------|--------|----------|------|-----------------|
| 1 | Request OTP (email + phone) | `POST /auth/signup/request-otp` | `email`, `phone` | `200` = OTPs sent. If email or phone already registered → `409`. |
| 2 | Verify email OTP | `POST /auth/signup/email/verify-otp` | `email`, `otp` | `200` + `next_step: "register"`. |
| 3 | Create account | `POST /auth/register` | `email`, `password`, `phone`, `phone_otp` | `201` + `token` + `user`. Header `X-App-Role` (optional, default customer). |

**Notes for frontend:**

- No `confirm_password` in API (validate on client only).
- Step 1 returns 409 if email or phone is already registered.
- Step 3 requires email to have been verified in the last 15 minutes; you send `phone_otp` in this call.

### Resend OTP

Same endpoint as step 1. Use it for resend by optionally limiting where the OTP is sent.

| Use case | Body | Behaviour |
|----------|------|-----------|
| First time or resend to both | `email`, `phone` | OTP sent to email and phone. |
| Resend to email only | `email`, `phone`, `send_phone: false` | OTP sent only to email. |
| Resend to phone only | `email`, `phone`, `send_email: false` | OTP sent only to phone (SMS). |
| Resend to both | `email`, `phone`, `send_email: true`, `send_phone: true` | OTP refreshed and sent to both. |

- Optional: `send_email` (default `true`), `send_phone` (default `true`). At least one must be `true`.
- You can show “Code sent again to email” / “Code sent again to phone” based on what you requested.

### Testing OTP

- **Dev mode:** If the backend is configured for dev OTP, use **`123456`** for both email verify and `phone_otp` in register. The step-1 response may include `data.dev_otp` (e.g. `123456`).
- **Real email/SMS:** User receives the code by email and SMS; use the code from email for step 2 and the code from SMS as `phone_otp` in step 3.

---

## 2. Login

- **Email:** `POST /auth/login` — body: `email`, `password`.
- **Phone:** `POST /auth/login/phone` — body: `phone`, `password`.

Users must have completed email verification (and phone verification if they have a phone) before login.

---

## 3. Forgot / Reset password (phone)

**Flow (3 screens):** Screen 1 – enter **phone** → request OTP. Screen 2 – enter **OTP** → verify, then go to Screen 3. Screen 3 – enter **new password** → reset. User then logs in with phone + new password.

| Step | Screen | Action | Endpoint | Body | Response |
|------|--------|--------|----------|------|----------|
| 1 | Enter phone | Request reset OTP | `POST /auth/forgot-password` | `phone` | `200` + same message whether or not phone is registered (no user enumeration). |
| 2 | Enter OTP | Verify code (optional) | `POST /auth/forgot-password/verify-otp` | `phone`, `otp` | `200` + `data.next_step: "reset_password"` — then navigate to new-password screen. |
| 3 | New password | Set new password | `POST /auth/reset-password` | `phone`, `otp`, `new_password` | `200` = password updated. Log in with `POST /auth/login/phone` using `phone` + `new_password`. |

- Phone must be E.164 (e.g. `+923001234567`). OTP is 6 digits, valid 10 minutes.
- Step 2 gives immediate feedback that the OTP is correct before showing the new-password screen. The app should keep `phone` and `otp` and send them again in step 3.
- Resend OTP: call `POST /auth/forgot-password` again with the same `phone`.
- Dev OTP: with `USE_DEV_OTP=1`, use code `123456` as `otp` in verify-otp and reset-password.
