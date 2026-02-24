# App Flows (Frontend)

API flows for registration and login. Use this for UI and integration.

---

## 1. Registration (2-step flow, phone OTP only)

**Flow:** User enters **email + phone** → backend checks both are free and sends OTP to the channel(s) you request (email, phone, or both). On the next screen user enters **phone OTP** and you call **register**. Only **phone OTP** is verified at registration; no email verification step required. "Already registered" is returned at step 1 before any verification.

### API flow

| Step | Action | Endpoint | Body | Response / Next |
|------|--------|----------|------|-----------------|
| 1 | Request OTP | `POST /auth/signup/request-otp` | `email`, `phone` (+ optional `send_email`, `send_phone`) | `200` = OTP sent to requested channel(s). If email or phone already registered → `409`. |
| 2 | Create account | `POST /auth/register` | `email`, `password`, `phone`, `phone_otp` | `201` + `token` + `user`. Header `X-App-Role` (optional, default customer). |

**Notes for frontend:**

- No `confirm_password` in API (validate on client only).
- Step 1 returns 409 if email or phone is already registered.
- **Only phone OTP is required for register.** Use the code received on **phone** (SMS) as `phone_otp` in step 2. If you also sent OTP to email, that code is for optional email verification only (see below).

### Optional: Verify email OTP

If you send OTP to both email and phone, you can optionally verify the **email** OTP before or after registration using `POST /auth/signup/email/verify-otp` (body: `email`, `otp`). This is not required to complete registration.

### Resend OTP

Same endpoint as step 1. Use it for resend by optionally limiting where the OTP is sent. When sending to both, **email and phone get separate OTPs**. OTP is stored only for the channel(s) you send to.

| Use case | Body | Behaviour |
|----------|------|-----------|
| First time or resend to both | `email`, `phone` | Separate OTPs sent to email and to phone. |
| Resend to email only | `email`, `phone`, `send_phone: false` | OTP sent only to email. |
| Resend to phone only | `email`, `phone`, `send_email: false` | OTP sent only to phone (SMS). |
| Resend to both | `email`, `phone`, `send_email: true`, `send_phone: true` | New OTPs sent to both. |

- Optional: `send_email` (default `true`), `send_phone` (default `true`). At least one must be `true`.

### Testing OTP

- **Dev mode:** If the backend is configured for dev OTP, use **`123456`** as `phone_otp` in register (and for optional email verify if used).
- **Real SMS:** User receives the code on phone; use that code as `phone_otp` in step 2. If you also sent to email, use the email code only for optional `POST /auth/signup/email/verify-otp`.

---

## 2. Login

- **Email:** `POST /auth/login` — body: `email`, `password`.
- **Phone:** `POST /auth/login/phone` — body: `phone`, `password`.

Users must have completed email verification (and phone verification if they have a phone) before login.

**Profile:** `PATCH /auth/profile` — body: any of `full_name`, `date_of_birth` (YYYY-MM-DD), `profile_picture_url`, `bio`, `udid`, `device_info` (object), `push_token`. All optional. Requires Bearer token. Returns updated user.

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
