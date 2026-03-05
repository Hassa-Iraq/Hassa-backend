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
} from "../utils/otpCodes";
import config from "../config/index";
import { Pool } from "pg";
import pool from "../db/connection";
import { getFileUrl } from "../utils/fileUpload";

/**
 * POST /auth/register
 * Registration requires phone OTP only. Flow: signup/request-otp (send to phone or both) → register with phone_otp.
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

    /*
    if (!(await wasEmailRecentlyVerified(pool as Pool, emailTrimmed, 15))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Please verify your email with OTP first (use signup/request-otp then email/verify-otp).",
        data: null,
      });
    }
    */

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

    let restaurantData: {
      primary_restaurant: Record<string, unknown> | null;
      restaurants: Record<string, unknown>[];
    } | null = null;

    if ((user.role ?? "").toLowerCase() === "restaurant") {
      try {
        const restaurantsResult = await pool.query(
          `SELECT
             id, user_id, parent_id, name, address, zone, cuisine,
             latitude, longitude, service_radius_km,
             logo_url, cover_image_url,
             is_active, is_open, is_blocked,
             created_at, updated_at
           FROM restaurant.restaurants
           WHERE user_id = $1
           ORDER BY (CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END), created_at ASC`,
          [user.id]
        );

        const restaurants = restaurantsResult.rows.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          parent_id: r.parent_id,
          name: r.name,
          address: r.address,
          zone: r.zone,
          cuisine: r.cuisine,
          latitude: r.latitude != null ? parseFloat(String(r.latitude)) : null,
          longitude: r.longitude != null ? parseFloat(String(r.longitude)) : null,
          service_radius_km: r.service_radius_km != null ? parseFloat(String(r.service_radius_km)) : null,
          logo_url: r.logo_url,
          cover_image_url: r.cover_image_url,
          is_active: r.is_active,
          is_open: r.is_open,
          is_blocked: r.is_blocked,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

        restaurantData = {
          primary_restaurant: restaurants.find((r) => r.parent_id == null) ?? restaurants[0] ?? null,
          restaurants,
        };
      } catch {
        restaurantData = {
          primary_restaurant: null,
          restaurants: [],
        };
      }
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Profile retrieved successfully",
      data: {
        user: User.toUserResponse(user),
        restaurant: restaurantData?.primary_restaurant ?? null,
        restaurants: restaurantData?.restaurants ?? [],
      },
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
 * PATCH /auth/profile
 * Body: { full_name?, date_of_birth?, profile_picture_url?, bio?, udid?, device_info?, push_token? }
 * All fields optional. Updates only provided fields. Requires authentication.
 */
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const { full_name, date_of_birth, profile_picture_url, bio, udid, device_info, push_token } = req.body;

    const updates: Parameters<typeof User.updateProfile>[1] = {};
    if (full_name !== undefined) {
      updates.full_name = typeof full_name === "string" ? (full_name.trim() || null) : null;
    }
    if (date_of_birth !== undefined) {
      const dob = typeof date_of_birth === "string" ? date_of_birth.trim() : null;
      if (dob !== null && dob !== "") {
        const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
        if (!parsed) {
          return res.status(400).json({
            success: false,
            status: "ERROR",
            message: "date_of_birth must be YYYY-MM-DD",
            data: null,
          });
        }
        updates.date_of_birth = dob;
      } else {
        updates.date_of_birth = null;
      }
    }
    if (profile_picture_url !== undefined) {
      updates.profile_picture_url = typeof profile_picture_url === "string" ? (profile_picture_url.trim() || null) : null;
    }
    if (bio !== undefined) {
      updates.bio = typeof bio === "string" ? (bio.trim() || null) : null;
    }
    if (udid !== undefined) {
      updates.udid = typeof udid === "string" ? (udid.trim() || null) : null;
    }
    if (device_info !== undefined) {
      updates.device_info =
        device_info != null && typeof device_info === "object" && !Array.isArray(device_info)
          ? (device_info as Record<string, unknown>)
          : null;
    }
    if (push_token !== undefined) {
      updates.push_token = typeof push_token === "string" ? (push_token.trim() || null) : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Provide at least one field to update (full_name, date_of_birth, profile_picture_url, bio, udid, device_info, push_token)",
        data: null,
      });
    }

    await User.updateProfile(req.user.id, updates);
    const user = await User.findByIdForProfile(req.user.id);
    if (!user) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "Profile updated but could not load user",
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
 * POST /auth/profile/upload-image
 * multipart/form-data: profile_picture=<image>
 */
export const uploadProfileImage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "profile_picture image file is required",
        data: null,
      });
    }

    const profilePictureUrl = getFileUrl(req.file.filename);
    const rawSaveToProfile = req.body?.save_to_profile;
    const saveToProfile =
      rawSaveToProfile === true ||
      rawSaveToProfile === "true" ||
      rawSaveToProfile === "1" ||
      rawSaveToProfile === 1;

    let user = null;
    if (saveToProfile) {
      await User.updateProfile(req.user.id, { profile_picture_url: profilePictureUrl });
      const updatedUser = await User.findByIdForProfile(req.user.id);
      user = updatedUser ? User.toUserResponse(updatedUser) : null;
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Profile image uploaded successfully",
      data: {
        image_url: profilePictureUrl,
        profile_picture_url: profilePictureUrl,
        path: profilePictureUrl,
        saved_to_profile: saveToProfile,
        user,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to upload profile image",
      data: null,
    });
  }
};

/**
 * POST /auth/signup/request-otp
 * Body: { email, phone, send_email?, send_phone? }
 * send_email (default true) and send_phone (default true): set to false to send only to the other channel.
 * Stores OTP only for the channel(s) we send to. When sending to both, email and phone get separate OTPs.
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

    const expiresMinutes = 10;
    let otpEmail: string | null = null;
    let otpPhone: string | null = null;

    if (sendToEmail) {
      otpEmail = getOtpForStorage();
      await storeOtpForEmail(pool as Pool, emailTrimmed, expiresMinutes, otpEmail);
    }
    if (sendToPhone) {
      otpPhone = getOtpForStorage();
      await storeOtpForPhone(pool as Pool, normalizedPhone, expiresMinutes, otpPhone);
    }

    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    type FetchResponse = Awaited<ReturnType<typeof fetch>>;
    const promises: Promise<FetchResponse>[] = [];
    if (sendToEmail && otpEmail) {
      const emailHtml = `<!DOCTYPE html><html><body><h2>Email Verification</h2><p>Your code: <strong>${otpEmail}</strong></p><p>Expires in ${expiresMinutes} minutes.</p></body></html>`;
      promises.push(
        fetch(`${url}/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: emailTrimmed,
            subject: "Food App - Email Verification Code",
            html: emailHtml,
            text: `Your verification code is ${otpEmail}. Expires in ${expiresMinutes} minutes.`,
          }),
        })
      );
    }
    if (sendToPhone && otpPhone) {
      const smsText = `Your Food App verification code is ${otpPhone}. Expires in ${expiresMinutes} minutes.`;
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
 * POST /auth/admin
 * Body: { email, password, phone? }. Only existing admin can add another admin.
 */
export const addAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, phone } = req.body;
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

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Password must be at least 8 characters and contain one uppercase letter, one lowercase letter, and one number",
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

    let normalizedPhone: string | null = null;
    if (phone != null && trim(String(phone)) !== "") {
      normalizedPhone = trim(String(phone)).startsWith("+") ? trim(String(phone)) : "+" + trim(String(phone));
      if (!validatePhoneFormat(normalizedPhone)) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
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
    }

    const roleRow = await Role.findByName("admin");
    if (!roleRow) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "Admin role not found",
        data: null,
      });
    }

    const passwordHash = await hashPassword(password);
    const created = await User.create({
      email: emailTrimmed,
      phone: normalizedPhone ?? undefined,
      password_hash: passwordHash,
      role_id: roleRow.id,
      email_verified: true,
      phone_verified: !!normalizedPhone,
    });

    const userForResponse = { ...created, role_name: "admin" } as User.UserRow & { role_name: string };
    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Admin created successfully",
      data: {
        user: User.toUserResponse(userForResponse, { email_verified: true, phone_verified: !!normalizedPhone }),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to create admin",
      data: null,
    });
  }
};

/**
 * POST /auth/admin/restaurant-owner
 * Body: { email, password, phone, full_name? }.
 */
export const addRestaurantOwner = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, phone, full_name } = req.body;
    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Email, password, and phone are required",
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

    const normalizedPhone = trim(String(phone)).startsWith("+")
      ? trim(String(phone))
      : "+" + trim(String(phone));
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

    const roleRow = await Role.findByName("restaurant");
    if (!roleRow) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "Restaurant role not found",
        data: null,
      });
    }

    const passwordHash = await hashPassword(password);
    const created = await User.create({
      email: emailTrimmed,
      phone: normalizedPhone,
      full_name: typeof full_name === "string" ? trim(full_name) || null : null,
      password_hash: passwordHash,
      role_id: roleRow.id,
      email_verified: true,
      phone_verified: true,
    });

    const userForResponse = { ...created, role_name: "restaurant" } as User.UserRow & { role_name: string };
    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Restaurant owner created successfully",
      data: {
        user: User.toUserResponse(userForResponse, { email_verified: true, phone_verified: true }),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to create restaurant owner",
      data: null,
    });
  }
};

/**
 * DELETE /auth/admin/restaurant-owner/:id
 * Admin-only helper used by onboarding rollback to remove a newly created restaurant owner.
 */
export const deleteRestaurantOwner = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "User id is required",
        data: null,
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        data: null,
      });
    }

    const role = user.role ?? user.role_name ?? "customer";
    if (role !== "restaurant") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Only restaurant users can be deleted using this endpoint",
        data: null,
      });
    }

    const deleted = await User.deleteById(id);
    if (!deleted) {
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
      message: "Restaurant owner deleted successfully",
      data: { user_id: id },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to delete restaurant owner",
      data: null,
    });
  }
};

/**
 * POST /auth/signup/email/verify-otp
 * Body: { email, otp }
 * Marks email OTP used. Optional: registration only requires phone OTP; use this if you also verify email.
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

/**
 * POST /auth/forgot-password
 * Body: { phone }
 * Sends OTP to the given phone if it is registered. Same response either way (no user enumeration).
 */
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== "string" || !trim(phone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone number is required",
        data: null,
      });
    }

    const normalizedPhone = trim(phone).startsWith("+") ? trim(phone) : "+" + trim(phone);
    if (!validatePhoneFormat(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
        data: null,
      });
    }

    const user = await User.findByPhone(normalizedPhone);
    if (!user) {
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "If this number is registered, you will receive a verification code shortly.",
        data: null,
      });
    }

    const otp = getOtpForStorage();
    const expiresMinutes = 10;
    await storeOtpForPhone(pool as Pool, normalizedPhone, expiresMinutes, otp);

    const url = config.NOTIFICATION_SERVICE_URL || "http://notification-service:3006";
    const smsText = `Your Food App password reset code is ${otp}. Valid for ${expiresMinutes} minutes.`;

    const fetchResp = await fetch(`${url}/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: normalizedPhone, text: smsText }),
    });

    if (!fetchResp.ok) {
      return res.status(502).json({
        success: false,
        status: "ERROR",
        message: "Failed to send verification code. Please try again.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "If this number is registered, you will receive a verification code shortly.",
      data: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to process request",
      data: null,
    });
  }
};

/**
 * POST /auth/forgot-password/verify-otp
 * Body: { phone, otp }
 * Validates the reset OTP only (does not mark used). Use on the OTP screen before navigating to the new-password screen.
 * Next step: POST /auth/reset-password with same phone, otp, and new_password.
 */
export const verifyForgotPasswordOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || typeof phone !== "string" || !trim(phone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone number is required",
        data: null,
      });
    }
    if (!otp || !isValidOtp6(trim(String(otp)))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Verification code is required (6 digits)",
        data: null,
      });
    }

    const normalizedPhone = trim(phone).startsWith("+") ? trim(phone) : "+" + trim(phone);
    if (!validatePhoneFormat(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
        data: null,
      });
    }

    const otpValidation = await validateOtpForPhone(pool as Pool, normalizedPhone, trim(String(otp)));
    if (!otpValidation.valid || !otpValidation.record) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: otpValidation.error ?? "Invalid or expired verification code",
        data: null,
      });
    }

    const user = await User.findByPhone(normalizedPhone);
    if (!user) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Account not found for this phone number",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Code verified. You can now set your new password.",
      data: {
        next_step: "reset_password",
        phone: normalizedPhone,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to verify code",
      data: null,
    });
  }
};

/**
 * POST /auth/reset-password
 * Body: { phone, otp, new_password }
 * Verifies OTP sent to phone and sets new password. User can then log in with phone + new password.
 */
export const resetPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { phone, otp, new_password } = req.body;
    if (!phone || typeof phone !== "string" || !trim(phone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Phone number is required",
        data: null,
      });
    }
    if (!otp || !isValidOtp6(trim(String(otp)))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Verification code is required (6 digits)",
        data: null,
      });
    }
    if (!new_password || !isValidPassword(new_password)) {
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
        message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
        data: null,
      });
    }

    const otpValidation = await validateOtpForPhone(pool as Pool, normalizedPhone, trim(String(otp)));
    if (!otpValidation.valid || !otpValidation.record) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: otpValidation.error ?? "Invalid or expired verification code",
        data: null,
      });
    }

    const user = await User.findByPhone(normalizedPhone);
    if (!user) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Account not found for this phone number",
        data: null,
      });
    }

    await markOtpCodeUsed(pool as Pool, otpValidation.record.id);
    const passwordHash = await hashPassword(new_password);
    await User.updatePasswordHash(user.id, passwordHash);

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Password has been reset. You can now log in with your new password.",
      data: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to reset password",
      data: null,
    });
  }
};