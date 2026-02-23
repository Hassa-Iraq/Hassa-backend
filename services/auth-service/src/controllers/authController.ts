import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  trim,
  isValidEmail,
  isValidPassword,
  isValidOtp6,
  ROLES,
} from "../utils/helpers";
import * as User from "../models/User";
import * as Role from "../models/Role";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { validatePhoneFormat } from "../utils/phone";
import {
  getOtpForStorage,
  storeOtpForEmail,
  storeOtpForPhone,
  validateOtpForEmail,
  validateOtpForPhone,
  markOtpCodeUsed,
  wasEmailRecentlyVerified,
} from "../utils/otpCodes";
import config from "../config/index";
import { Pool } from "pg";
import pool from "../db/connection";

/**
 * POST /auth/register
 * After: signup/request-otp then signup/email/verify-otp.
 * Body: { email, password, phone, phone_otp }
 * Header: X-App-Role (optional: customer | restaurant | driver)
 */
export const register = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, phone, phone_otp } = req.body;
    const roleHeader = req.headers["x-app-role"];

    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email, password, and phone are required",
        data: null,
      });
    }
    if (!phone_otp || !isValidOtp6(String(phone_otp).trim())) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone OTP is required (6 digits)",
        data: null,
      });
    }

    const emailTrimmed = trim(email).toLowerCase();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Please provide a valid email address",
        data: null,
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
        data: null,
      });
    }

    const normalizedPhone = trim(phone).startsWith("+") ? trim(phone) : "+" + trim(phone);
    if (!validatePhoneFormat(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone number format. Please use E.164 format (e.g., +1234567890)",
        data: null,
      });
    }

    if (!(await wasEmailRecentlyVerified(pool as Pool, emailTrimmed, 15))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Please verify your email with OTP first (use signup/request-otp then email/verify-otp).",
        data: null,
      });
    }

    const phoneOtpValidation = await validateOtpForPhone(pool as Pool, normalizedPhone, String(phone_otp).trim());
    if (!phoneOtpValidation.valid || !phoneOtpValidation.record) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: phoneOtpValidation.error ?? "Invalid or expired phone OTP",
        data: null,
      });
    }

    await markOtpCodeUsed(pool as Pool, phoneOtpValidation.record.id);

    if (await User.existsByEmail(emailTrimmed)) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Email is already registered",
        data: null,
      });
    }
    if (await User.existsByPhone(normalizedPhone)) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Phone number is already registered",
        data: null,
      });
    }

    const roleVal = roleHeader != null ? trim(String(roleHeader)).toLowerCase() : "customer";
    if (!ROLES.includes(roleVal as (typeof ROLES)[number])) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Please provide a valid role",
        data: null,
      });
    }

    const roleRow = await Role.findByName(roleVal);
    if (!roleRow) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Please provide a valid role",
        data: null,
      });
    }

    const passwordHash = await hashPassword(password);
    const created = await User.create({
      email: emailTrimmed,
      phone: normalizedPhone,
      password_hash: passwordHash,
      role_id: roleRow.id,
      email_verified: true,
      phone_verified: true,
    });

    const token = generateToken({ userId: created.id, email: created.email, role: roleVal });
    const userForResponse = { ...created, role_name: roleVal } as User.UserRow & { role_name: string };

    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Registration successful",
      data: {
        token,
        user: User.toUserResponse(userForResponse, { email_verified: true, phone_verified: true }),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to register. Please try again.",
      data: null,
    });
  }
};

/**
 * POST /auth/login
 * Body: { email, password }
 */
export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email and password are required",
        data: null,
      });
    }

    const emailTrimmed = trim(email).toLowerCase();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Please provide a valid email address",
        data: null,
      });
    }

    const user = await User.findByEmail(emailTrimmed);
    if (!user || !user.password_hash) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid email or password",
        data: null,
      });
    }

    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid email or password",
        data: null,
      });
    }

    const roleName = (user as User.UserRow & { role_name?: string }).role_name ?? "customer";
    if (roleName !== "admin") {
      if (!user.email_verified) {
        return res.status(401).json({
          success: false,
          status: "ERROR",
          message: "Please verify your email to login.",
          data: null,
        });
      }
      if (user.phone && !user.phone_verified) {
        return res.status(401).json({
          success: false,
          status: "ERROR",
          message: "Please verify your phone number to login.",
          data: null,
        });
      }
    }

    const token = generateToken({ userId: user.id, email: user.email, role: roleName });
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Signed in successfully",
      data: {
        token,
        user: User.toUserResponse(user, {
          phone_verified: user.phone_verified ?? false,
          email_verified: user.email_verified ?? false,
        }),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to sign in. Please try again.",
      data: null,
    });
  }
};

/**
 * POST /auth/login/phone
 * Body: { phone, password }
 */
export const loginPhone = async (req: AuthRequest, res: Response) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone and password are required",
        data: null,
      });
    }

    const normalizedPhone = trim(phone).startsWith("+") ? trim(phone) : "+" + trim(phone);
    const user = await User.findByPhone(normalizedPhone);
    if (!user || !user.password_hash) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone or password",
        data: null,
      });
    }

    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone or password",
        data: null,
      });
    }

    const roleName = (user as User.UserRow & { role_name?: string }).role_name ?? "customer";
    if (roleName !== "admin") {
      if (!user.email_verified) {
        return res.status(401).json({
          success: false,
          status: "ERROR",
          message: "Please verify your email to login.",
          data: null,
        });
      }
      if (user.phone && !user.phone_verified) {
        return res.status(401).json({
          success: false,
          status: "ERROR",
          message: "Please verify your phone number to login.",
          data: null,
        });
      }
    }

    const token = generateToken({ userId: user.id, email: user.email, role: roleName });
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Signed in successfully",
      data: {
        token,
        user: User.toUserResponse(user, {
          phone_verified: user.phone_verified ?? false,
          email_verified: user.email_verified ?? false,
        }),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to sign in. Please try again.",
      data: null,
    });
  }
};

/**
 * GET /auth/me
 * Requires: authenticate middleware
 */
export const me = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }
    const user = await User.findByIdForProfile(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Profile retrieved successfully",
      data: { user: User.toUserResponse(user) },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to get profile",
      data: null,
    });
  }
};

/**
 * POST /auth/signup/request-otp
 * Body: { email, phone, send_email?, send_phone? }
 * send_email (default true) and send_phone (default true): set to false to skip that channel (e.g. resend only to phone).
 * Always stores OTP for both; sends only to the requested channels. Use for initial send and resend.
 */
export const signupRequestOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone, send_email, send_phone } = req.body;
    if (!email || !phone || typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email and phone are required",
        data: null,
      });
    }
    const sendToEmail = send_email !== false;
    const sendToPhone = send_phone !== false;
    if (!sendToEmail && !sendToPhone) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "At least one of send_email or send_phone must be true",
        data: null,
      });
    }

    const emailTrimmed = trim(email).toLowerCase();
    const normalizedPhone = trim(phone).startsWith("+") ? trim(phone) : "+" + trim(phone);

    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid email address",
        data: null,
      });
    }

    if (!validatePhoneFormat(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
        data: null,
      });
    }

    if (await User.existsByEmail(emailTrimmed)) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Email is already registered",
        data: null,
      });
    }
    if (await User.existsByPhone(normalizedPhone)) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Phone number is already registered",
        data: null,
      });
    }

    const otp = getOtpForStorage();
    const expiresMinutes = 10;

    await Promise.all([
      storeOtpForEmail(pool as Pool, emailTrimmed, expiresMinutes, otp),
      storeOtpForPhone(pool as Pool, normalizedPhone, expiresMinutes, otp),
    ]);


    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const emailHtml = `<!DOCTYPE html><html><body><h2>Email Verification</h2><p>Your code: <strong>${otp}</strong></p><p>Expires in ${expiresMinutes} minutes.</p></body></html>`;
    const smsText = `Your Food App verification code is ${otp}. Expires in ${expiresMinutes} minutes.`;

    type FetchResponse = Awaited<ReturnType<typeof fetch>>;
    const promises: Promise<FetchResponse>[] = [];
    if (sendToEmail) {
      promises.push(
        fetch(`${url}/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: emailTrimmed,
            subject: "Food App - Email Verification Code",
            html: emailHtml,
            text: `Your verification code is ${otp}. Expires in ${expiresMinutes} minutes.`,
          }),
        })
      );
    }
    if (sendToPhone) {
      promises.push(
        fetch(`${url}/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: normalizedPhone, text: smsText }),
        })
      );
    }

    const results = await Promise.all(promises);
    const emailResp: FetchResponse | null = sendToEmail ? results[0]! : null;
    const smsResp: FetchResponse | null = sendToPhone ? (sendToEmail ? results[1]! : results[0]!) : null;

    if (emailResp && !emailResp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send email OTP. Please try again.",
        data: null,
      });
    }
    if (smsResp && !smsResp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send phone OTP. Please try again.",
        data: null,
      });
    }

    const message =
      sendToEmail && sendToPhone
        ? "Verification code sent to your email and phone"
        : sendToPhone
          ? "Verification code sent to your phone"
          : "Verification code sent to your email";
    return res.status(200).json({
      success: true,
      status: "OK",
      message,
      data: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to send OTP",
      data: null,
    });
  }
};

/**
 * POST /auth/signup/email/verify-otp
 * Body: { email, otp }
 * Marks email OTP used. Next: POST /auth/register with phone_otp.
 */
export const signupEmailVerifyOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email is required",
        data: null,
      });
    }
    const emailTrimmed = trim(email).toLowerCase();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid email address",
        data: null,
      });
    }
    if (!otp || !isValidOtp6(trim(String(otp)))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP is required (6 digits)",
        data: null,
      });
    }

    const otpValidation = await validateOtpForEmail(pool as Pool, emailTrimmed, trim(String(otp)));
    if (!otpValidation.valid || !otpValidation.record) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: otpValidation.error ?? "Invalid or expired OTP",
        data: null,
      });
    }
    await markOtpCodeUsed(pool as Pool, otpValidation.record.id);

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Email verified. You can now complete registration.",
      data: {
        next_step: "phone_verification",
        email: emailTrimmed,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to verify OTP",
      data: null,
    });
  }
};
