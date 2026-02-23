import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  trim,
  isValidEmail,
  isValidPassword,
  isValidUuid,
  isValidOtp6,
  ROLES,
} from "../utils/helpers";
import * as User from "../models/User";
import * as Role from "../models/Role";
import * as PasswordResetToken from "../models/PasswordResetToken";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { validatePhoneFormat, combineCountryCodeAndPhone } from "../utils/phone";
import {
  generateAndStoreOTP,
  validateOTP,
  markOTPAsUsed,
} from "../utils/otp";
import { memoryRateLimiter } from "../utils/rateLimit";
import { getFileUrl } from "../utils/fileUpload";
import config from "../config/index";
import crypto from "crypto";
import { Pool } from "pg";
import pool from "../db/connection";

/**
 * POST /auth/register
 * Body: { email, password, phone, country_code?, accept_terms, role? }
 */
export const register = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, phone, country_code, accept_terms, role } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email is required",
        data: null,
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Password is required",
        data: null,
      });
    }
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone is required",
        data: null,
      });
    }
    if (accept_terms !== true) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "You must accept the terms and conditions",
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

    const roleVal = role != null ? trim(role) : "customer";
    if (!ROLES.includes(roleVal as (typeof ROLES)[number])) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid role",
        data: null,
      });
    }

    const normalizedPhone = country_code
      ? combineCountryCodeAndPhone(country_code, trim(phone))
      : trim(phone).startsWith("+")
        ? trim(phone)
        : "+" + trim(phone);

    if (!validatePhoneFormat(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone number format. Please use E.164 format (e.g., +1234567890)",
        data: null,
      });
    }

    const [existingEmail, existingPhone] = await Promise.all([
      User.existsByEmail(emailTrimmed),
      User.existsByPhone(normalizedPhone),
    ]);
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Email is already registered",
        data: null,
      });
    }
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Phone number is already registered",
        data: null,
      });
    }

    const roleRow = await Role.findByName(roleVal);
    if (!roleRow) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid role specified",
        data: null,
      });
    }

    const passwordHash = await hashPassword(password);
    await User.create({
      email: emailTrimmed,
      phone: normalizedPhone,
      password_hash: passwordHash,
      role_id: roleRow.id,
      terms_accepted_at: new Date(),
    });

    const user = await User.findByEmail(emailTrimmed);
    if (!user) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "User not found after create",
        data: null,
      });
    }

    let generatedOtp: string | null = null;
    try {
      generatedOtp = await generateAndStoreOTP(pool as Pool, user.id, normalizedPhone, "signup_phone", 10);
      const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
      const smsText = `Your Food App verification code is: ${generatedOtp}. It will expire in 10 minutes.`;
      const resp = await fetch(`${url}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: normalizedPhone, text: smsText }),
      });
      if (!resp.ok) {
      }
    } catch (_e) {
    }

    const data: Record<string, unknown> = {
      user: User.toUserResponse(user),
      requires_verification: true,
      verification_method: "phone_otp",
    };
    if (generatedOtp) data.otp = generatedOtp;

    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Verification code sent to your phone",
      data: data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Registration failed",
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
    if (!user) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid email or password",
        data: null,
      });
    }
    if (!user.password_hash) {
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
    if (roleName !== "admin" && !user.phone_verified) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Phone number is not verified. Please verify your phone number to login.",
        data: null,
      });
    }

    const token = generateToken({ userId: user.id, email: user.email, role: roleName });
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Login successful",
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
      message: (err as Error).message || "Login failed",
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

    const user = await User.findByPhone(trim(phone));
    if (!user) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone or password",
        data: null,
      });
    }
    if (!user.password_hash) {
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
        message: "Invalid phone or password",
        data: null,
      });
    }

    const roleName = (user as User.UserRow & { role_name?: string }).role_name ?? "customer";
    if (roleName !== "admin" && !user.phone_verified) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Phone number is not verified. Please verify your phone number to login.",
        data: null,
      });
    }

    const token = generateToken({ userId: user.id, email: user.email, role: roleName });
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Login successful",
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
      message: (err as Error).message || "Login failed",
      data: null,
    });
  }
};

/**
 * GET /auth/me
 * Requires: Authorization header
 */
export const me = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
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
 * POST /auth/logout
 * Requires: Authorization header
 */
export const logout = async (_req: AuthRequest, res: Response) => {
  try {
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Logout successful",
      data: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Logout failed",
      data: null,
    });
  }
};

/**
 * PUT /auth/change-password
 * Body: { currentPassword, newPassword }
 * Requires: Authorization header
 */
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Current password is required",
        data: null,
      });
    }
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password is required",
        data: null,
      });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
        data: null,
      });
    }

    const user = await User.findByIdWithPassword(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid user data",
        data: null,
      });
    }

    const match = await comparePassword(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Current password is incorrect",
        data: null,
      });
    }

    const newHash = await hashPassword(newPassword);
    await User.updatePasswordHash(req.user.id, newHash);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password changed successfully",
      data: {},
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Password change failed",
      data: null,
    });
  }
};

/**
 * POST /auth/forgot-password
 * Body: { email }
 */
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
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

    const user = await User.findByEmail(emailTrimmed);
    if (!user) {
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "Password reset email sent",
        data: {
          message: "If an account with that email exists, a password reset token has been generated.",
        },
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    await PasswordResetToken.invalidateUnusedByUserId(user.id);
    await PasswordResetToken.create(user.id, resetToken, expiresAt, undefined);

    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const resetUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
      : `Reset token: ${resetToken}`;
    const emailHtml = `<!DOCTYPE html><html><body><h2>Password Reset</h2><p>Token (valid 1 hour): ${resetToken}</p>${process.env.FRONTEND_URL ? `<p><a href="${resetUrl}">Reset Password</a></p>` : ""}</body></html>`;
    const emailText = `Password Reset. Token (valid 1 hour): ${resetToken}${process.env.FRONTEND_URL ? ` Or visit: ${resetUrl}` : ""}`;

    try {
      const resp = await fetch(`${url}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTrimmed,
          subject: "Password Reset Request - Food App",
          html: emailHtml,
          text: emailText,
        }),
      });
      if (!resp.ok) {
        // Email send failed – token still stored
      }
    } catch (_e) {
      // Email send failed – token still stored
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password reset email sent",
      data: {
        message: "If an account with that email exists, a password reset link has been sent to your email address.",
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Forgot password failed",
      data: null,
    });
  }
};

/**
 * POST /auth/reset-password
 * Body: { token, newPassword }
 */
export const resetPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Reset token is required",
        data: null,
      });
    }
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password is required",
        data: null,
      });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
        data: null,
      });
    }

    const resetRow = await PasswordResetToken.findByToken(trim(token));
    if (!resetRow) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid reset token",
        data: null,
      });
    }
    if (resetRow.used) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Reset token has already been used",
        data: null,
      });
    }
    if (new Date() > new Date(resetRow.expires_at)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Reset token has expired",
        data: null,
      });
    }

    const newHash = await hashPassword(newPassword);
    await User.updatePasswordHash(resetRow.user_id, newHash);
    await PasswordResetToken.markUsed(resetRow.id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password reset successfully",
      data: {},
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Reset password failed",
      data: null,
    });
  }
};

/**
 * POST /auth/forgot-password-phone
 * Body: { phone }
 */
export const forgotPasswordPhone = async (req: AuthRequest, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone is required",
        data: null,
      });
    }

    const user = await User.findByPhone(trim(phone));
    if (!user || !user.phone_verified) {
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "Password reset OTP SMS sent",
        data: {
          message: "If an account with that phone exists, a password reset OTP has been sent to your phone.",
        },
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    await pool.query(
      `UPDATE auth.password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE AND otp IS NOT NULL`,
      [user.id]
    );
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO auth.password_reset_tokens (user_id, token, otp, expires_at) VALUES ($1, $2, $3, $4)`,
      [user.id, token, otp, expiresAt]
    );

    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const smsText = `Your Food App password reset code is: ${otp}. It will expire in 10 minutes.`;
    try {
      const resp = await fetch(`${url}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: trim(phone), text: smsText }),
      });
      if (!resp.ok) {
        // SMS send failed – OTP still stored
      }
    } catch (_e) {
      // SMS send failed – OTP still stored
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password reset OTP SMS sent",
      data: {
        message: "If an account with that phone exists, a password reset OTP has been sent to your phone.",
        otp,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Forgot password failed",
      data: null,
    });
  }
};

/**
 * POST /auth/reset-password-phone
 * Body: { phone, otp, newPassword }
 */
export const resetPasswordPhone = async (req: AuthRequest, res: Response) => {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone is required",
        data: null,
      });
    }
    if (!otp) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP is required",
        data: null,
      });
    }
    if (!isValidOtp6(otp)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP must be a 6-digit number",
        data: null,
      });
    }
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password is required",
        data: null,
      });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
        data: null,
      });
    }

    const user = await User.findByPhone(trim(phone));
    if (!user) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone or OTP",
        data: null,
      });
    }

    const otpRow = await PasswordResetToken.findLatestOtpByUser(user.id, trim(otp));
    if (!otpRow) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid OTP",
        data: null,
      });
    }
    if (otpRow.used) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP has already been used",
        data: null,
      });
    }
    if (new Date() > new Date(otpRow.expires_at)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP has expired. Please request a new one.",
        data: null,
      });
    }

    const newHash = await hashPassword(newPassword);
    await User.updatePasswordHash(otpRow.user_id, newHash);
    await PasswordResetToken.markUsed(otpRow.id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password reset successfully",
      data: {},
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Reset password failed",
      data: null,
    });
  }
};

/**
 * POST /auth/signup/phone/request-otp
 * Body: { user_id, phone }
 */
export const signupPhoneRequestOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, phone } = req.body;
    if (!user_id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID is required",
        data: null,
      });
    }
    if (!isValidUuid(user_id)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID must be a valid UUID",
        data: null,
      });
    }
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone is required",
        data: null,
      });
    }

    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!memoryRateLimiter.check(`phone:${phone}`, 3, 1)) {
      return res.status(429).json({
        success: false,
        status: "ERROR",
        message: "Too many OTP requests. Please try again later.",
        data: null,
      });
    }
    if (!memoryRateLimiter.check(`ip:${clientIp}`, 10, 1)) {
      return res.status(429).json({
        success: false,
        status: "ERROR",
        message: "Too many requests from this IP. Please try again later.",
        data: null,
      });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    if (user.phone !== trim(phone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone number does not match user record",
        data: null,
      });
    }
    if (user.phone_verified) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone is already verified",
        data: null,
      });
    }

    const otp = await generateAndStoreOTP(pool as Pool, user.id, trim(phone), "signup_phone", 10);
    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const smsText = `Your Food App verification code is: ${otp}. It will expire in 10 minutes.`;
    const resp = await fetch(`${url}/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: trim(phone), text: smsText }),
    });
    if (!resp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send OTP. Please try again.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Signup OTP SMS sent",
      data: {
        message: "Verification code has been sent to your phone.",
        otp,
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
 * POST /auth/signup/phone/verify-otp
 * Body: { user_id, phone, otp }
 */
export const signupPhoneVerifyOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, phone, otp } = req.body;
    if (!user_id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID is required",
        data: null,
      });
    }
    if (!isValidUuid(user_id)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID must be a valid UUID",
        data: null,
      });
    }
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone is required",
        data: null,
      });
    }
    if (!otp) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP is required",
        data: null,
      });
    }
    if (!isValidOtp6(otp)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP must be a 6-digit number",
        data: null,
      });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    if (user.phone !== trim(phone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone number does not match user record",
        data: null,
      });
    }

    const otpValidation = await validateOTP(pool as Pool, user.id, trim(phone), trim(otp), "signup_phone");
    if (!otpValidation.valid || !otpValidation.record) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: otpValidation.error ?? "Invalid or expired OTP",
        data: null,
      });
    }
    await markOTPAsUsed(pool as Pool, otpValidation.record.id);
    await User.setPhoneVerified(user.id, true);

    const fullUser = await User.findByIdForProfile(user.id);
    if (!fullUser) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    const roleName = (fullUser as User.UserRow & { role?: string }).role ?? "customer";
    const token = generateToken({ userId: fullUser.id, email: fullUser.email, role: roleName });

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Phone verified successfully. You are now logged in.",
      data: {
        token,
        user: User.toUserResponse(fullUser, { phone_verified: true }),
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

/**
 * POST /auth/signup/email/request-otp
 * Body: { user_id, email }
 */
export const signupEmailRequestOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, email } = req.body;
    if (!user_id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID is required",
        data: null,
      });
    }
    if (!isValidUuid(user_id)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID must be a valid UUID",
        data: null,
      });
    }
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

    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!memoryRateLimiter.check(`email:${emailTrimmed}`, 3, 1)) {
      return res.status(429).json({
        success: false,
        status: "ERROR",
        message: "Too many OTP requests. Please try again later.",
        data: null,
      });
    }
    if (!memoryRateLimiter.check(`ip:${clientIp}`, 10, 1)) {
      return res.status(429).json({
        success: false,
        status: "ERROR",
        message: "Too many requests from this IP. Please try again later.",
        data: null,
      });
    }

    const userRow = await pool.query<{ id: string; email: string; email_verified: boolean }>(
      "SELECT id, email, email_verified FROM auth.users WHERE id = $1",
      [user_id]
    );
    const user = userRow.rows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    if (user.email !== emailTrimmed) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email address does not match user record",
        data: null,
      });
    }
    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email is already verified",
        data: null,
      });
    }

    const otp = await generateAndStoreOTP(pool as Pool, user.id, emailTrimmed, "signup_email", 10);
    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const emailHtml = `<!DOCTYPE html><html><body><h2>Email Verification</h2><p>Your code: <strong>${otp}</strong></p><p>Expires in 10 minutes.</p></body></html>`;
    const resp = await fetch(`${url}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: emailTrimmed,
        subject: "Food App - Email Verification Code",
        html: emailHtml,
        text: `Your verification code is: ${otp}. Expires in 10 minutes.`,
      }),
    });
    if (!resp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send OTP. Please try again.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Signup email OTP sent",
      data: {
        message: "Verification code has been sent to your email.",
        otp,
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
 * Body: { user_id, email, otp }
 */
export const signupEmailVerifyOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, email, otp } = req.body;
    if (!user_id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID is required",
        data: null,
      });
    }
    if (!isValidUuid(user_id)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User ID must be a valid UUID",
        data: null,
      });
    }
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
    if (!otp) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP is required",
        data: null,
      });
    }
    if (!isValidOtp6(otp)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP must be a 6-digit number",
        data: null,
      });
    }

    const userResult = await pool.query<User.UserRow & { role_name?: string; phone_verified?: boolean }>(
      `SELECT u.id, u.email, u.phone_verified, u.email_verified, r.name as role_name
       FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
      [user_id]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    if (user.email !== emailTrimmed) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email address does not match user record",
        data: null,
      });
    }

    const otpValidation = await validateOTP(pool as Pool, user.id, emailTrimmed, trim(otp), "signup_email");
    if (!otpValidation.valid || !otpValidation.record) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: otpValidation.error ?? "Invalid or expired OTP",
        data: null,
      });
    }
    await markOTPAsUsed(pool as Pool, otpValidation.record.id);
    await User.setEmailVerified(user.id, true);

    const fullUser = await User.findByIdForProfile(user.id);
    if (!fullUser) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }
    const roleName = (fullUser as User.UserRow & { role?: string }).role ?? user.role_name ?? "customer";
    const token = generateToken({ userId: fullUser.id, email: fullUser.email, role: roleName });

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Email verified successfully. You are now logged in.",
      data: {
        token,
        user: User.toUserResponse(fullUser, {
          phone_verified: user.phone_verified ?? false,
          email_verified: true,
        }),
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

/**
 * POST /auth/forgot-password-otp
 * Body: { email }
 */
export const forgotPasswordOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
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

    const user = await User.findByEmail(emailTrimmed);
    if (!user) {
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "Password reset OTP sent",
        data: {
          message: "If an account with that email exists, a password reset OTP has been sent to your email address.",
        },
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    await pool.query(
      `UPDATE auth.password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE AND otp IS NOT NULL`,
      [user.id]
    );
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO auth.password_reset_tokens (user_id, token, otp, expires_at) VALUES ($1, $2, $3, $4)`,
      [user.id, token, otp, expiresAt]
    );

    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const emailHtml = `<!DOCTYPE html><html><body><h2>Password Reset OTP</h2><p>Your code: <strong>${otp}</strong></p><p>Expires in 10 minutes.</p></body></html>`;
    try {
      const resp = await fetch(`${url}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTrimmed,
          subject: "Password Reset OTP - Food App",
          html: emailHtml,
          text: `Your OTP: ${otp}. Expires in 10 minutes.`,
        }),
      });
      if (!resp.ok) {
        // Email send failed – OTP still stored
      }
    } catch (_e) {
      // Email send failed – OTP still stored
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password reset OTP sent",
      data: {
        message: "If an account with that email exists, a password reset OTP has been sent to your email address.",
        otp,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Forgot password OTP failed",
      data: null,
    });
  }
};

/**
 * POST /auth/reset-password-otp
 * Body: { email, otp, newPassword }
 */
export const resetPasswordOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
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
    if (!otp) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP is required",
        data: null,
      });
    }
    if (!isValidOtp6(otp)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP must be a 6-digit number",
        data: null,
      });
    }
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password is required",
        data: null,
      });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "New password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
        data: null,
      });
    }

    const user = await User.findByEmail(emailTrimmed);
    if (!user) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid email or OTP",
        data: null,
      });
    }

    const otpRow = await PasswordResetToken.findLatestOtpByUser(user.id, trim(otp));
    if (!otpRow) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid OTP",
        data: null,
      });
    }
    if (otpRow.used) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP has already been used",
        data: null,
      });
    }
    if (new Date() > new Date(otpRow.expires_at)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "OTP has expired. Please request a new one.",
        data: null,
      });
    }

    const newHash = await hashPassword(newPassword);
    await User.updatePasswordHash(otpRow.user_id, newHash);
    await PasswordResetToken.markUsed(otpRow.id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password reset successfully",
      data: {},
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Reset password failed",
      data: null,
    });
  }
};

/**
 * PUT /auth/profile
 * Body: { full_name?, date_of_birth?, bio? } or multipart with profile_picture
 * Requires: Authorization header
 */
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    if (req.body.email !== undefined) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email cannot be updated through this endpoint.",
        data: null,
      });
    }
    if (req.body.phone !== undefined) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone number cannot be updated through this endpoint.",
        data: null,
      });
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const updates: {
      full_name?: string | null;
      date_of_birth?: string | null;
      bio?: string | null;
      profile_picture_url?: string | null;
    } = {};

    if (req.body.full_name !== undefined) {
      const val = trim(req.body.full_name);
      if (val.length > 255) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Full name must not exceed 255 characters",
          data: null,
        });
      }
      updates.full_name = val === "" ? null : val;
    }
    if (req.body.date_of_birth !== undefined) {
      const val = trim(req.body.date_of_birth);
      if (val === "") updates.date_of_birth = null;
      else {
        if (!/^\d{4}-\d{2}-\d{2}/.test(val)) {
          return res.status(400).json({
            success: false,
            status: "ERROR",
            message: "date_of_birth must be a valid ISO 8601 date",
            data: null,
          });
        }
        updates.date_of_birth = val;
      }
    }
    if (req.body.bio !== undefined) {
      const val = trim(req.body.bio);
      if (val.length > 2000) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Bio must not exceed 2000 characters",
          data: null,
        });
      }
      updates.bio = val === "" ? null : val;
    }
    if (file) updates.profile_picture_url = getFileUrl(file.filename);

    if (Object.keys(updates).length === 0) {
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
        message: "No changes",
        data: { user: User.toUserResponse(user) },
      });
    }

    await User.updateProfile(req.user.id, updates);
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
      message: "Profile updated successfully",
      data: { user: User.toUserResponse(user) },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to update profile",
      data: null,
    });
  }
};

/**
 * POST /auth/admin/create-admin
 * Body: { email, password }
 * Requires: Authorization header (admin role)
 */
export const createAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email is required",
        data: null,
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Password is required",
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
    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
        data: null,
      });
    }

    const existing = await User.existsByEmail(emailTrimmed);
    if (existing) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "User with this email already exists",
        data: null,
      });
    }

    const roleRow = await Role.findByName("admin");
    if (!roleRow) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "Admin role not found in database",
        data: null,
      });
    }

    const passwordHash = await hashPassword(password);
    await User.createAdmin({ email: emailTrimmed, password_hash: passwordHash, role_id: roleRow.id });

    const user = await User.findByEmail(emailTrimmed);
    if (!user) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "User not found after create",
        data: null,
      });
    }

    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Admin user created successfully",
      data: { user: User.toUserResponse(user) },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Create admin failed",
      data: null,
    });
  }
};
