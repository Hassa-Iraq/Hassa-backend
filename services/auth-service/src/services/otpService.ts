/**
 * OTP service: constants, generation, and sending with templates.
 * For now uses hardcoded DEV_OTP in development; replace with real provider later.
 */

export const OTP_EXPIRY_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const DEV_OTP_CODE = "123456";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Generate OTP. In development returns DEV_OTP_CODE for easy testing.
 */
export function generateOTP(): string {
  if (isDev) {
    return DEV_OTP_CODE;
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Same as generateOTP – use when you need an OTP to store and send.
 * In dev both email and phone will get DEV_OTP_CODE so you can use 123456 to verify.
 */
export function getOtpForStorage(): string {
  return generateOTP();
}

function getEmailOtpTemplate(otp: string, expiresMinutes: number): { subject: string; html: string; text: string } {
  const subject = "Your verification code";
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <tr>
      <td style="padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #111;">Verification code</h1>
        <p style="margin: 0 0 24px; font-size: 14px; color: #666;">Use this code to verify your email. It expires in ${expiresMinutes} minutes.</p>
        <div style="display: inline-block; padding: 12px 24px; background: #f0f4ff; border-radius: 8px; letter-spacing: 4px; font-size: 24px; font-weight: 700; color: #1a1a1a;">${otp}</div>
        <p style="margin: 24px 0 0; font-size: 12px; color: #999;">If you didn't request this code, you can ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = `Your verification code is: ${otp}. It expires in ${expiresMinutes} minutes. If you didn't request this code, you can ignore this email.`;

  return { subject, html, text };
}

function getPhoneOtpMessage(otp: string, expiresMinutes: number): string {
  return `Your verification code is ${otp}. Valid for ${expiresMinutes} minutes. Do not share this code.`;
}

/**
 * Send OTP to email using the notification service (or log in dev if no service).
 * Uses a proper HTML/text template.
 */
export async function sendEmailOtp(
  email: string,
  otp: string,
  options?: { notificationServiceUrl?: string; expiresMinutes?: number }
): Promise<{ ok: boolean; error?: string }> {
  const expiresMinutes = options?.expiresMinutes ?? OTP_EXPIRY_MINUTES;
  const url = options?.notificationServiceUrl ?? process.env.NOTIFICATION_SERVICE_URL ?? "http://notification-service:3006";
  const { subject, html, text } = getEmailOtpTemplate(otp, expiresMinutes);

  if (isDev && !process.env.NOTIFICATION_SERVICE_URL) {
    console.log(`[OTP Service] Dev: would send email to ${email}, code: ${otp}, subject: ${subject}`);
    return { ok: true };
  }

  try {
    const resp = await fetch(`${url}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: `Food App – ${subject}`,
        html,
        text,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      return { ok: false, error: err || "Failed to send email" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Send OTP to phone via notification service (or log in dev if no service).
 */
export async function sendPhoneOtp(
  phone: string,
  otp: string,
  options?: { notificationServiceUrl?: string; expiresMinutes?: number }
): Promise<{ ok: boolean; error?: string }> {
  const expiresMinutes = options?.expiresMinutes ?? OTP_EXPIRY_MINUTES;
  const url = options?.notificationServiceUrl ?? process.env.NOTIFICATION_SERVICE_URL ?? "http://notification-service:3006";
  const text = getPhoneOtpMessage(otp, expiresMinutes);

  if (isDev && !process.env.NOTIFICATION_SERVICE_URL) {
    console.log(`[OTP Service] Dev: would send SMS to ${phone}, code: ${otp}`);
    return { ok: true };
  }

  try {
    const resp = await fetch(`${url}/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, text }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      return { ok: false, error: err || "Failed to send SMS" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
