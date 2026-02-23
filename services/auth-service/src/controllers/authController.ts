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
      message: "Profile retrieved",
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
 * Body: { email, phone }
 * Checks email/phone not registered, sends OTP to both. Then user does email/verify-otp, then register with phone_otp.
 */
export const signupRequestOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone || typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email and phone are required",
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

    const [emailOtp, phoneOtp] = await Promise.all([
      storeOtpForEmail(pool as Pool, emailTrimmed, 10),
      storeOtpForPhone(pool as Pool, normalizedPhone, 10),
    ]);

    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const emailHtml = `<!DOCTYPE html><html><body><h2>Email Verification</h2><p>Your code: <strong>${emailOtp}</strong></p><p>Expires in 10 minutes.</p></body></html>`;
    const smsText = `Your Food App verification code is: ${phoneOtp}. Expires in 10 minutes.`;

    const [emailResp, smsResp] = await Promise.all([
      fetch(`${url}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTrimmed,
          subject: "Food App - Email Verification Code",
          html: emailHtml,
          text: `Your verification code is: ${emailOtp}. Expires in 10 minutes.`,
        }),
      }),
      fetch(`${url}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: normalizedPhone, text: smsText }),
      }),
    ]);

    if (!emailResp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send email OTP. Please try again.",
        data: null,
      });
    }
    if (!smsResp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send phone OTP. Please try again.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Verification codes sent to your email and phone",
      data: {
        message: "Enter the code from your email on the next step, then password and the code from your phone to complete registration.",
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Send OTP failed",
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
        next_step: "register",
        email: emailTrimmed,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Verify OTP failed",
      data: null,
    });
  }
};
