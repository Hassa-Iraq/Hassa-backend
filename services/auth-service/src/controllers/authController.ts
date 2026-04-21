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
import * as EmployeeRole from "../models/EmployeeRole";
import * as DriverProfile from "../models/DriverProfile";
import * as Address from "../models/Address";

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
    let employeeRoleData:
      | {
        employee_role_id: string | null;
        employee_role_name: string | null;
        employee_permissions: Record<string, unknown> | null;
        employee_is_active: boolean | null;
      }
      | null = null;
    let driverData:
      | {
        owner_type: DriverProfile.DriverOwnerType;
        owner_restaurant_id: string | null;
        vehicle_type: string | null;
        vehicle_number: string | null;
        vehicle_image_url: string | null;
        driving_license_image_url: string | null;
        additional_data: Record<string, unknown>;
        is_active: boolean;
      }
      | null = null;

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
    if ((user.role ?? "").toLowerCase() === "employee") {
      employeeRoleData = await EmployeeRole.findEmployeeRoleForUser(user.id);
    }
    if ((user.role ?? "").toLowerCase() === "driver") {
      const driver = await DriverProfile.findDriverById(user.id);
      if (driver) {
        driverData = {
          owner_type: driver.owner_type,
          owner_restaurant_id: driver.owner_restaurant_id,
          vehicle_type: driver.vehicle_type,
          vehicle_number: driver.vehicle_number,
          vehicle_image_url: driver.vehicle_image_url,
          driving_license_image_url: driver.driving_license_image_url,
          additional_data: driver.additional_data ?? {},
          is_active: driver.is_active,
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
        employee_role: employeeRoleData,
        driver_profile: driverData,
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

async function getOwnedRestaurantIds(userId: string): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    `SELECT id
     FROM restaurant.restaurants
     WHERE user_id = $1
     ORDER BY (CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END), created_at ASC`,
    [userId]
  );
  return r.rows.map((row) => row.id);
}

async function resolveDriverOwnership(
  req: AuthRequest,
  res: Response,
  requestedRestaurantId?: string
): Promise<{ owner_type: DriverProfile.DriverOwnerType; owner_restaurant_id: string | null } | null> {
  if (req.user?.role === "admin") {
    if (requestedRestaurantId) {
      return { owner_type: "restaurant", owner_restaurant_id: requestedRestaurantId };
    }
    return { owner_type: "platform", owner_restaurant_id: null };
  }

  if (req.user?.role !== "restaurant" || !req.user.id) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "Insufficient permissions",
      data: null,
    });
    return null;
  }

  const ownedRestaurantIds = await getOwnedRestaurantIds(req.user.id);
  if (ownedRestaurantIds.length === 0) {
    res.status(400).json({
      success: false,
      status: "ERROR",
      message: "No owned restaurants found for this user",
      data: null,
    });
    return null;
  }

  const restaurantId = requestedRestaurantId ?? ownedRestaurantIds[0];
  if (!restaurantId || !ownedRestaurantIds.includes(restaurantId)) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "You can only manage drivers for your own restaurant",
      data: null,
    });
    return null;
  }

  return { owner_type: "restaurant", owner_restaurant_id: restaurantId };
}

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
 * POST /auth/admin/employee-roles
 * Body: { name, description?, permissions? }
 */
export const createEmployeeRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, permissions } = req.body as {
      name?: string;
      description?: string | null;
      permissions?: Record<string, unknown>;
    };
    if (!name || typeof name !== "string" || !trim(name)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Role name is required",
        data: null,
      });
    }
    if (permissions !== undefined && (permissions == null || typeof permissions !== "object" || Array.isArray(permissions))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "permissions must be an object",
        data: null,
      });
    }

    const existing = await EmployeeRole.findRoleByName(trim(name));
    if (existing) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Employee role with this name already exists",
        data: null,
      });
    }

    const role = await EmployeeRole.createRole({
      name: trim(name),
      description: typeof description === "string" ? trim(description) || null : null,
      permissions: permissions ?? {},
      created_by_admin_id: req.user?.id ?? null,
    });

    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Employee role created successfully",
      data: { role },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to create employee role",
      data: null,
    });
  }
};

/**
 * GET /auth/admin/employee-roles
 */
export const listEmployeeRoles = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const isActive =
      typeof req.query.is_active === "string"
        ? req.query.is_active.toLowerCase() === "true"
        : undefined;

    const roles = await EmployeeRole.listRoles({ is_active: isActive, limit, offset });
    const total = await EmployeeRole.countRoles({ is_active: isActive });
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee roles listed",
      data: {
        roles,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to list employee roles",
      data: null,
    });
  }
};

/**
 * GET /auth/admin/employee-roles/:id
 */
export const getEmployeeRole = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Role id is required",
        data: null,
      });
    }
    const role = await EmployeeRole.findRoleById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Employee role not found",
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee role retrieved",
      data: { role },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to get employee role",
      data: null,
    });
  }
};

/**
 * PATCH /auth/admin/employee-roles/:id
 */
export const updateEmployeeRole = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Role id is required",
        data: null,
      });
    }
    const body = req.body as {
      name?: string;
      description?: string | null;
      permissions?: Record<string, unknown>;
      is_active?: boolean;
    };
    if (body.permissions !== undefined && (body.permissions == null || typeof body.permissions !== "object" || Array.isArray(body.permissions))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "permissions must be an object",
        data: null,
      });
    }
    const updated = await EmployeeRole.updateRole(id, {
      name: body.name !== undefined ? trim(String(body.name)) : undefined,
      description: body.description === undefined ? undefined : (body.description == null ? null : trim(String(body.description))),
      permissions: body.permissions,
      is_active: body.is_active,
    });
    if (!updated) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Employee role not found",
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee role updated successfully",
      data: { role: updated },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to update employee role",
      data: null,
    });
  }
};

/**
 * POST /auth/admin/employees
 * Body: { email, password, phone, full_name?, image_url?, employee_role_id, is_active? }
 */
export const addEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, phone, full_name, image_url, employee_role_id, is_active } = req.body as {
      email?: string;
      password?: string;
      phone?: string;
      full_name?: string;
      image_url?: string;
      employee_role_id?: string;
      is_active?: boolean;
    };
    if (!email || !password || !phone || !employee_role_id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "email, password, phone, and employee_role_id are required",
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

    const employeeRole = await EmployeeRole.findRoleById(employee_role_id);
    if (!employeeRole || !employeeRole.is_active) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "employee_role_id is invalid or inactive",
        data: null,
      });
    }
    const roleRow = await Role.findByName("employee");
    if (!roleRow) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "Employee role not found in auth.roles",
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

    try {
      await EmployeeRole.createEmployeeProfile({
        user_id: created.id,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        created_by_admin_id: req.user?.id ?? null,
      });
      await EmployeeRole.assignRoleToEmployee({
        user_id: created.id,
        employee_role_id,
        assigned_by_admin_id: req.user?.id ?? null,
      });
      if (image_url !== undefined) {
        await User.updateProfile(created.id, {
          profile_picture_url: typeof image_url === "string" ? trim(image_url) || null : null,
        });
      }
    } catch (innerError) {
      await User.deleteById(created.id);
      throw innerError;
    }

    const employee = await EmployeeRole.findEmployeeById(created.id);
    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Employee created successfully",
      data: { employee },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to create employee",
      data: null,
    });
  }
};

/**
 * GET /auth/admin/employees
 */
export const listEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const employee_role_id = typeof req.query.employee_role_id === "string" ? req.query.employee_role_id : undefined;
    const is_active =
      typeof req.query.is_active === "string"
        ? req.query.is_active.toLowerCase() === "true"
        : undefined;

    const employees = await EmployeeRole.listEmployees({
      search,
      employee_role_id,
      is_active,
      limit,
      offset,
    });
    const total = await EmployeeRole.countEmployees({
      search,
      employee_role_id,
      is_active,
    });

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employees listed",
      data: {
        employees,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to list employees",
      data: null,
    });
  }
};

/**
 * GET /auth/admin/employees/:id
 */
export const getEmployeeById = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Employee id is required",
        data: null,
      });
    }
    const employee = await EmployeeRole.findEmployeeById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Employee not found",
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee retrieved",
      data: { employee },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to get employee",
      data: null,
    });
  }
};

/**
 * PATCH /auth/admin/employees/:id
 * Body (all optional): { email?, phone?, full_name?, image_url?, is_active?, employee_role_id? }
 */
export const updateEmployeeByAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Employee id is required",
        data: null,
      });
    }

    const employee = await EmployeeRole.findEmployeeById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Employee not found",
        data: null,
      });
    }

    const { email, phone, full_name, image_url, is_active, employee_role_id } = req.body as {
      email?: string;
      phone?: string | null;
      full_name?: string | null;
      image_url?: string | null;
      is_active?: boolean;
      employee_role_id?: string;
    };

    if (
      email === undefined &&
      phone === undefined &&
      full_name === undefined &&
      image_url === undefined &&
      is_active === undefined &&
      employee_role_id === undefined
    ) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message:
          "Provide at least one field to update (email, phone, full_name, image_url, is_active, employee_role_id)",
        data: null,
      });
    }

    const userUpdates: {
      email?: string;
      phone?: string | null;
      full_name?: string | null;
      profile_picture_url?: string | null;
    } = {};

    if (email !== undefined) {
      const normalizedEmail = trim(String(email)).toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Please provide a valid email address",
          data: null,
        });
      }
      if (await User.existsByEmailExcludingId(normalizedEmail, id)) {
        return res.status(409).json({
          success: false,
          status: "ERROR",
          message: "Email is already registered",
          data: null,
        });
      }
      userUpdates.email = normalizedEmail;
    }

    if (phone !== undefined) {
      if (phone == null || trim(String(phone)) === "") {
        userUpdates.phone = null;
      } else {
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
        if (await User.existsByPhoneExcludingId(normalizedPhone, id)) {
          return res.status(409).json({
            success: false,
            status: "ERROR",
            message: "Phone number is already registered",
            data: null,
          });
        }
        userUpdates.phone = normalizedPhone;
      }
    }

    if (full_name !== undefined) {
      userUpdates.full_name = typeof full_name === "string" ? trim(full_name) || null : null;
    }

    if (image_url !== undefined) {
      userUpdates.profile_picture_url = typeof image_url === "string" ? trim(image_url) || null : null;
    }

    if (Object.keys(userUpdates).length > 0) {
      await User.updateAdminManagedFields(id, userUpdates);
    }

    if (is_active !== undefined) {
      await EmployeeRole.updateEmployeeProfile(id, { is_active: Boolean(is_active) });
    }

    if (employee_role_id !== undefined) {
      const nextRole = await EmployeeRole.findRoleById(employee_role_id);
      if (!nextRole || !nextRole.is_active) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "employee_role_id is invalid or inactive",
          data: null,
        });
      }
      await EmployeeRole.assignRoleToEmployee({
        user_id: id,
        employee_role_id,
        assigned_by_admin_id: req.user?.id ?? null,
      });
    }

    const updated = await EmployeeRole.findEmployeeById(id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee updated successfully",
      data: { employee: updated },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to update employee",
      data: null,
    });
  }
};

/**
 * PATCH /auth/admin/employees/:id/role
 * Body: { employee_role_id }
 */
export const assignEmployeeRole = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { employee_role_id } = req.body as { employee_role_id?: string };
    if (!id || !employee_role_id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Employee id and employee_role_id are required",
        data: null,
      });
    }
    const employee = await EmployeeRole.findEmployeeById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Employee not found",
        data: null,
      });
    }
    const employeeRole = await EmployeeRole.findRoleById(employee_role_id);
    if (!employeeRole || !employeeRole.is_active) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "employee_role_id is invalid or inactive",
        data: null,
      });
    }

    await EmployeeRole.assignRoleToEmployee({
      user_id: id,
      employee_role_id,
      assigned_by_admin_id: req.user?.id ?? null,
    });
    const updated = await EmployeeRole.findEmployeeById(id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee role assigned successfully",
      data: { employee: updated },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to assign employee role",
      data: null,
    });
  }
};

/**
 * PATCH /auth/admin/employees/:id/status
 * Body: { is_active }
 */
export const updateEmployeeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { is_active } = req.body as { is_active?: boolean };
    if (!id || is_active === undefined) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Employee id and is_active are required",
        data: null,
      });
    }
    const employee = await EmployeeRole.findEmployeeById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Employee not found",
        data: null,
      });
    }

    await EmployeeRole.updateEmployeeProfile(id, { is_active: Boolean(is_active) });
    const updated = await EmployeeRole.findEmployeeById(id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Employee status updated successfully",
      data: { employee: updated },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to update employee status",
      data: null,
    });
  }
};

/**
 * POST /auth/drivers
 * Body: { email, password, phone, full_name?, image_url?, vehicle_type?, vehicle_number?, vehicle_image_url?, driving_license_image_url?, additional_data?, is_active?, restaurant_id? }
 */
export const addDriver = async (req: AuthRequest, res: Response) => {
  try {
    const {
      email,
      password,
      phone,
      full_name,
      image_url,
      vehicle_type,
      vehicle_number,
      vehicle_image_url,
      driving_license_image_url,
      additional_data,
      is_active,
      restaurant_id,
    } = req.body as {
      email?: string;
      password?: string;
      phone?: string;
      full_name?: string;
      image_url?: string;
      vehicle_type?: string;
      vehicle_number?: string;
      vehicle_image_url?: string;
      driving_license_image_url?: string;
      additional_data?: Record<string, unknown>;
      is_active?: boolean;
      restaurant_id?: string;
    };

    if (!email || !password || !phone) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "email, password, and phone are required",
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
    const normalizedPhone = trim(String(phone)).startsWith("+") ? trim(String(phone)) : "+" + trim(String(phone));
    if (!validatePhoneFormat(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
        data: null,
      });
    }
    if (additional_data !== undefined && (additional_data == null || typeof additional_data !== "object" || Array.isArray(additional_data))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "additional_data must be an object",
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

    const ownership = await resolveDriverOwnership(req, res, typeof restaurant_id === "string" ? restaurant_id : undefined);
    if (!ownership) return;

    const roleRow = await Role.findByName("driver");
    if (!roleRow) {
      return res.status(500).json({
        success: false,
        status: "ERROR",
        message: "Driver role not found in auth.roles",
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

    try {
      await DriverProfile.createDriverProfile({
        user_id: created.id,
        owner_type: ownership.owner_type,
        owner_restaurant_id: ownership.owner_restaurant_id,
        vehicle_type: typeof vehicle_type === "string" ? trim(vehicle_type) || null : null,
        vehicle_number: typeof vehicle_number === "string" ? trim(vehicle_number) || null : null,
        vehicle_image_url: typeof vehicle_image_url === "string" ? trim(vehicle_image_url) || null : null,
        driving_license_image_url:
          typeof driving_license_image_url === "string" ? trim(driving_license_image_url) || null : null,
        additional_data: additional_data ?? {},
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        approval_status: "approved",
        created_by_user_id: req.user?.id ?? null,
      });
      if (image_url !== undefined) {
        await User.updateProfile(created.id, {
          profile_picture_url: typeof image_url === "string" ? trim(image_url) || null : null,
        });
      }
    } catch (innerError) {
      await User.deleteById(created.id);
      throw innerError;
    }

    const driver = await DriverProfile.findDriverById(created.id);
    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Driver created successfully",
      data: { driver },
    });
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Duplicate value detected (email/phone/vehicle number)",
        data: null,
      });
    }
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to create driver",
      data: null,
    });
  }
};

/**
 * GET /auth/drivers
 */
export const listDrivers = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const ownerType =
      typeof req.query.owner_type === "string" && ["platform", "restaurant"].includes(req.query.owner_type)
        ? (req.query.owner_type as DriverProfile.DriverOwnerType)
        : undefined;
    const ownerRestaurantId =
      typeof req.query.restaurant_id === "string" && req.query.restaurant_id.trim().length > 0
        ? req.query.restaurant_id.trim()
        : undefined;
    const isActive =
      typeof req.query.is_active === "string"
        ? req.query.is_active.toLowerCase() === "true"
        : undefined;
    const approvalStatus =
      typeof req.query.approval_status === "string" && ["pending", "approved", "rejected"].includes(req.query.approval_status)
        ? req.query.approval_status
        : undefined;

    if (req.user?.role === "restaurant" && req.user.id) {
      const ownedRestaurantIds = await getOwnedRestaurantIds(req.user.id);
      if (ownedRestaurantIds.length === 0) {
        return res.status(200).json({
          success: true,
          status: "OK",
          message: "Drivers listed",
          data: {
            drivers: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          },
        });
      }
      const drivers = await DriverProfile.listDrivers({
        search,
        owner_type: "restaurant",
        owner_restaurant_ids: ownedRestaurantIds,
        is_active: isActive,
        approval_status: approvalStatus,
        limit,
        offset,
      });
      const total = await DriverProfile.countDrivers({
        search,
        owner_type: "restaurant",
        owner_restaurant_ids: ownedRestaurantIds,
        is_active: isActive,
        approval_status: approvalStatus,
      });
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "Drivers listed",
        data: {
          drivers,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
      });
    }

    const drivers = await DriverProfile.listDrivers({
      search,
      owner_type: ownerType,
      owner_restaurant_id: ownerRestaurantId,
      is_active: isActive,
      approval_status: approvalStatus,
      limit,
      offset,
    });
    const total = await DriverProfile.countDrivers({
      search,
      owner_type: ownerType,
      owner_restaurant_id: ownerRestaurantId,
      is_active: isActive,
      approval_status: approvalStatus,
    });
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Drivers listed",
      data: {
        drivers,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to list drivers",
      data: null,
    });
  }
};

/**
 * GET /auth/drivers/:id
 */
export const getDriverById = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Driver id is required",
        data: null,
      });
    }
    const driver = await DriverProfile.findDriverById(id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Driver not found",
        data: null,
      });
    }

    if (req.user?.role === "restaurant" && req.user.id) {
      const ownedRestaurantIds = await getOwnedRestaurantIds(req.user.id);
      if (!driver.owner_restaurant_id || !ownedRestaurantIds.includes(driver.owner_restaurant_id)) {
        return res.status(403).json({
          success: false,
          status: "ERROR",
          message: "You do not have permission to view this driver",
          data: null,
        });
      }
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver retrieved",
      data: { driver },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to get driver",
      data: null,
    });
  }
};

/**
 * PATCH /auth/drivers/:id
 */
export const updateDriver = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Driver id is required",
        data: null,
      });
    }
    const existing = await DriverProfile.findDriverById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Driver not found",
        data: null,
      });
    }

    if (req.user?.role === "restaurant" && req.user.id) {
      const ownedRestaurantIds = await getOwnedRestaurantIds(req.user.id);
      if (!existing.owner_restaurant_id || !ownedRestaurantIds.includes(existing.owner_restaurant_id)) {
        return res.status(403).json({
          success: false,
          status: "ERROR",
          message: "You can only update your own restaurant drivers",
          data: null,
        });
      }
    }

    const {
      email,
      phone,
      full_name,
      image_url,
      vehicle_type,
      vehicle_number,
      vehicle_image_url,
      driving_license_image_url,
      additional_data,
      is_active,
      restaurant_id,
    } = req.body as {
      email?: string;
      phone?: string | null;
      full_name?: string | null;
      image_url?: string | null;
      vehicle_type?: string | null;
      vehicle_number?: string | null;
      vehicle_image_url?: string | null;
      driving_license_image_url?: string | null;
      additional_data?: Record<string, unknown>;
      is_active?: boolean;
      restaurant_id?: string | null;
    };

    if (
      email === undefined &&
      phone === undefined &&
      full_name === undefined &&
      image_url === undefined &&
      vehicle_type === undefined &&
      vehicle_number === undefined &&
      vehicle_image_url === undefined &&
      driving_license_image_url === undefined &&
      additional_data === undefined &&
      is_active === undefined &&
      restaurant_id === undefined
    ) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message:
          "Provide at least one field to update (email, phone, full_name, image_url, vehicle_type, vehicle_number, vehicle_image_url, driving_license_image_url, additional_data, is_active, restaurant_id)",
        data: null,
      });
    }

    if (additional_data !== undefined && (additional_data == null || typeof additional_data !== "object" || Array.isArray(additional_data))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "additional_data must be an object",
        data: null,
      });
    }

    const userUpdates: {
      email?: string;
      phone?: string | null;
      full_name?: string | null;
      profile_picture_url?: string | null;
    } = {};
    if (email !== undefined) {
      const normalizedEmail = trim(String(email)).toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Please provide a valid email address",
          data: null,
        });
      }
      if (await User.existsByEmailExcludingId(normalizedEmail, id)) {
        return res.status(409).json({
          success: false,
          status: "ERROR",
          message: "Email is already registered",
          data: null,
        });
      }
      userUpdates.email = normalizedEmail;
    }
    if (phone !== undefined) {
      if (phone == null || trim(String(phone)) === "") {
        userUpdates.phone = null;
      } else {
        const normalizedPhone = trim(String(phone)).startsWith("+") ? trim(String(phone)) : "+" + trim(String(phone));
        if (!validatePhoneFormat(normalizedPhone)) {
          return res.status(400).json({
            success: false,
            status: "ERROR",
            message: "Invalid phone number. Use E.164 format (e.g. +923001234567)",
            data: null,
          });
        }
        if (await User.existsByPhoneExcludingId(normalizedPhone, id)) {
          return res.status(409).json({
            success: false,
            status: "ERROR",
            message: "Phone number is already registered",
            data: null,
          });
        }
        userUpdates.phone = normalizedPhone;
      }
    }
    if (full_name !== undefined) {
      userUpdates.full_name = typeof full_name === "string" ? trim(full_name) || null : null;
    }
    if (image_url !== undefined) {
      userUpdates.profile_picture_url = typeof image_url === "string" ? trim(image_url) || null : null;
    }
    if (Object.keys(userUpdates).length > 0) {
      await User.updateAdminManagedFields(id, userUpdates);
    }

    const profileUpdates: Parameters<typeof DriverProfile.updateDriverProfile>[1] = {
      vehicle_type: vehicle_type === undefined ? undefined : (typeof vehicle_type === "string" ? trim(vehicle_type) || null : null),
      vehicle_number:
        vehicle_number === undefined ? undefined : (typeof vehicle_number === "string" ? trim(vehicle_number) || null : null),
      vehicle_image_url:
        vehicle_image_url === undefined
          ? undefined
          : (typeof vehicle_image_url === "string" ? trim(vehicle_image_url) || null : null),
      driving_license_image_url:
        driving_license_image_url === undefined
          ? undefined
          : (typeof driving_license_image_url === "string" ? trim(driving_license_image_url) || null : null),
      additional_data,
      is_active: is_active === undefined ? undefined : Boolean(is_active),
    };

    if (restaurant_id !== undefined) {
      if (req.user?.role === "restaurant") {
        return res.status(403).json({
          success: false,
          status: "ERROR",
          message: "Restaurant users cannot move driver ownership",
          data: null,
        });
      }
      if (restaurant_id === null || (typeof restaurant_id === "string" && restaurant_id.trim() === "")) {
        profileUpdates.owner_type = "platform";
        profileUpdates.owner_restaurant_id = null;
      } else if (typeof restaurant_id === "string") {
        profileUpdates.owner_type = "restaurant";
        profileUpdates.owner_restaurant_id = restaurant_id.trim();
      }
    }

    await DriverProfile.updateDriverProfile(id, profileUpdates);
    const updated = await DriverProfile.findDriverById(id);

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver updated successfully",
      data: { driver: updated },
    });
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Vehicle number already exists",
        data: null,
      });
    }
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to update driver",
      data: null,
    });
  }
};

/**
 * POST /auth/drivers/upload-assets
 * multipart form-data fields: delivery_man_picture, vehicle_image, driving_license_picture
 * optional: save_to_driver=true, driver_user_id=<uuid>
 */
export const uploadDriverAssets = async (req: AuthRequest, res: Response) => {
  try {
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const driverPicture = files.delivery_man_picture?.[0];
    const vehicleImage = files.vehicle_image?.[0];
    const licensePicture = files.driving_license_picture?.[0];

    if (!driverPicture && !vehicleImage && !licensePicture) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Upload at least one file: delivery_man_picture, vehicle_image, driving_license_picture",
        data: null,
      });
    }

    const saveToDriverRaw = req.body.save_to_driver;
    const saveToDriver =
      saveToDriverRaw === true || String(saveToDriverRaw ?? "").toLowerCase() === "true";
    const driverUserId =
      typeof req.body.driver_user_id === "string" && req.body.driver_user_id.trim().length > 0
        ? req.body.driver_user_id.trim()
        : undefined;

    if (saveToDriver) {
      if (!driverUserId) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "driver_user_id is required when save_to_driver=true",
          data: null,
        });
      }
      const driver = await DriverProfile.findDriverById(driverUserId);
      if (!driver) {
        return res.status(404).json({
          success: false,
          status: "ERROR",
          message: "Driver not found",
          data: null,
        });
      }
      if (req.user?.role === "restaurant" && req.user.id) {
        const ownedRestaurantIds = await getOwnedRestaurantIds(req.user.id);
        if (!driver.owner_restaurant_id || !ownedRestaurantIds.includes(driver.owner_restaurant_id)) {
          return res.status(403).json({
            success: false,
            status: "ERROR",
            message: "You can only update assets for your own restaurant drivers",
            data: null,
          });
        }
      }

      if (driverPicture) {
        await User.updateProfile(driverUserId, {
          profile_picture_url: getFileUrl(driverPicture.filename, driverPicture.fieldname),
        });
      }
      await DriverProfile.updateDriverProfile(driverUserId, {
        vehicle_image_url: vehicleImage ? getFileUrl(vehicleImage.filename, vehicleImage.fieldname) : undefined,
        driving_license_image_url: licensePicture ? getFileUrl(licensePicture.filename, licensePicture.fieldname) : undefined,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver assets uploaded successfully",
      data: {
        delivery_man_picture_url: driverPicture
          ? getFileUrl(driverPicture.filename, driverPicture.fieldname)
          : null,
        vehicle_image_url: vehicleImage ? getFileUrl(vehicleImage.filename, vehicleImage.fieldname) : null,
        driving_license_picture_url: licensePicture
          ? getFileUrl(licensePicture.filename, licensePicture.fieldname)
          : null,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to upload driver assets",
      data: null,
    });
  }
};

/**
 * POST /auth/drivers/profile
 * Driver submits their own vehicle info after self-registration. Creates profile with approval_status=pending.
 */
export const submitDriverProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const existing = await DriverProfile.findDriverById(userId);
    if (existing) {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Driver profile already submitted",
        data: null,
      });
    }

    const {
      vehicle_type,
      vehicle_number,
      vehicle_image_url,
      driving_license_image_url,
      additional_data,
    } = req.body as {
      vehicle_type?: string;
      vehicle_number?: string;
      vehicle_image_url?: string;
      driving_license_image_url?: string;
      additional_data?: Record<string, unknown>;
    };

    if (additional_data !== undefined && (additional_data == null || typeof additional_data !== "object" || Array.isArray(additional_data))) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "additional_data must be an object",
        data: null,
      });
    }

    await DriverProfile.createDriverProfile({
      user_id: userId,
      owner_type: "platform",
      owner_restaurant_id: null,
      vehicle_type: typeof vehicle_type === "string" ? trim(vehicle_type) || null : null,
      vehicle_number: typeof vehicle_number === "string" ? trim(vehicle_number) || null : null,
      vehicle_image_url: typeof vehicle_image_url === "string" ? trim(vehicle_image_url) || null : null,
      driving_license_image_url: typeof driving_license_image_url === "string" ? trim(driving_license_image_url) || null : null,
      additional_data: additional_data ?? {},
      is_active: false,
      approval_status: "pending",
      created_by_user_id: null,
    });

    const driver = await DriverProfile.findDriverById(userId);
    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Driver profile submitted. Awaiting admin approval.",
      data: { driver },
    });
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return res.status(409).json({
        success: false,
        status: "ERROR",
        message: "Duplicate value detected (vehicle number)",
        data: null,
      });
    }
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to submit driver profile",
      data: null,
    });
  }
};

/**
 * PATCH /auth/admin/drivers/:id/approve
 */
export const approveDriver = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const driver = await DriverProfile.findDriverById(id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Driver not found",
        data: null,
      });
    }
    await DriverProfile.updateDriverProfile(id, {
      approval_status: "approved",
      is_active: true,
      rejection_reason: null,
    });
    const updated = await DriverProfile.findDriverById(id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver approved successfully",
      data: { driver: updated },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to approve driver",
      data: null,
    });
  }
};

/**
 * PATCH /auth/admin/drivers/:id/reject
 * Body: { reason?: string }
 */
export const rejectDriver = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : null;

    const driver = await DriverProfile.findDriverById(id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Driver not found",
        data: null,
      });
    }
    if (driver.approval_status === "approved") {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot reject an already approved driver. Deactivate them instead.",
        data: null,
      });
    }
    await DriverProfile.updateDriverProfile(id, {
      approval_status: "rejected",
      is_active: false,
      rejection_reason: reason,
    });
    const updated = await DriverProfile.findDriverById(id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver rejected",
      data: { driver: updated },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to reject driver",
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

/**
 * GET /auth/addresses
 */
export const listAddresses = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const rows = await Address.listByUserId(req.user.id);
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Addresses listed",
      data: {
        addresses: rows.map(Address.toResponse),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to list addresses",
      data: null,
    });
  }
};

/**
 * POST /auth/addresses
 */
export const createAddress = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const {
      complete_address,
      category,
      landmark,
      location_details,
      latitude,
      longitude,
      is_default,
    } = req.body as Record<string, unknown>;

    if (!complete_address || typeof complete_address !== "string" || complete_address.trim().length === 0) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "complete_address is required",
        data: null,
      });
    }

    const created = await Address.create({
      user_id: req.user.id,
      complete_address: complete_address.trim(),
      category: typeof category === "string" && category.trim().length > 0 ? category.trim() : "Other",
      landmark: typeof landmark === "string" ? landmark.trim() || null : null,
      location_details:
        typeof location_details === "string" ? location_details.trim() || null : null,
      latitude: typeof latitude === "number" ? latitude : null,
      longitude: typeof longitude === "number" ? longitude : null,
      is_default: Boolean(is_default),
    });

    return res.status(201).json({
      success: true,
      status: "OK",
      message: "Address created successfully",
      data: {
        address: Address.toResponse(created),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to create address",
      data: null,
    });
  }
};

/**
 * PATCH /auth/addresses/:id
 */
export const updateAddress = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Address id is required",
        data: null,
      });
    }

    const body = req.body as Record<string, unknown>;
    const updates: Address.UpdateAddressInput = {};

    if (body.complete_address !== undefined) {
      if (typeof body.complete_address !== "string" || body.complete_address.trim().length === 0) {
        return res.status(400).json({
          success: false,
          status: "ERROR",
          message: "complete_address must be a non-empty string",
          data: null,
        });
      }
      updates.complete_address = body.complete_address.trim();
    }
    if (body.category !== undefined) {
      updates.category =
        typeof body.category === "string" && body.category.trim().length > 0 ? body.category.trim() : "Other";
    }
    if (body.landmark !== undefined) {
      updates.landmark = typeof body.landmark === "string" ? body.landmark.trim() || null : null;
    }
    if (body.location_details !== undefined) {
      updates.location_details =
        typeof body.location_details === "string"
          ? body.location_details.trim() || null
          : null;
    }
    if (body.latitude !== undefined) {
      updates.latitude = typeof body.latitude === "number" ? body.latitude : null;
    }
    if (body.longitude !== undefined) {
      updates.longitude = typeof body.longitude === "number" ? body.longitude : null;
    }
    if (body.is_default !== undefined) {
      updates.is_default = Boolean(body.is_default);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message:
          "Provide at least one field to update (complete_address, category, landmark, location_details, latitude, longitude, is_default)",
        data: null,
      });
    }

    const updated = await Address.updateForUser(id, req.user.id, updates);
    if (!updated) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Address not found",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Address updated successfully",
      data: {
        address: Address.toResponse(updated),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to update address",
      data: null,
    });
  }
};

/**
 * DELETE /auth/addresses/:id
 */
export const deleteAddress = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
    }

    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Address id is required",
        data: null,
      });
    }

    const deleted = await Address.deleteForUser(id, req.user.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Address not found",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Address deleted successfully",
      data: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: (err as Error).message || "Failed to delete address",
      data: null,
    });
  }
};