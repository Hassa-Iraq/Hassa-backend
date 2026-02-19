import express, { Request, Response, NextFunction } from "express";
import { body } from "express-validator";
import { sendSuccess, HTTP_STATUS } from "shared/api-response/index";
import { validateRequest, commonValidators } from "shared/validation/index";
import {
  asyncHandler,
  ConflictError,
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  RequestWithLogger,
  createFieldError,
} from "shared/error-handler/index";
import pool from "../db/connection";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken, verifyToken } from "../utils/jwt";
import { authenticate, authorize } from "../middleware/auth";
import { validatePhoneFormat, combineCountryCodeAndPhone } from "../utils/phone";
import { generateAndStoreOTP, validateOTP, markOTPAsUsed } from "../utils/otp";
import { memoryRateLimiter } from "../utils/rateLimit";
import { upload, getFileUrl } from "../utils/fileUpload";
import crypto from "crypto";
import config from "../config/index";

function optionalProfileUpload(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    upload.single("profile_picture")(req, res, next);
  } else {
    next();
  }
}

const router = express.Router();

interface RegisterBody {
  email: string;
  password: string;
  phone: string;
  country_code?: string;
  accept_terms: boolean;
  role?: "customer" | "restaurant" | "driver";
}

interface LoginBody {
  email: string;
  password: string;
}

interface PhoneLoginBody {
  phone: string;
  password: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

interface ForgotPasswordOtpBody {
  email: string;
}

interface ResetPasswordOtpBody {
  email: string;
  otp: string;
  newPassword: string;
}

interface ForgotPasswordPhoneBody {
  phone: string;
}

interface ResetPasswordPhoneBody {
  phone: string;
  otp: string;
  newPassword: string;
}


interface SignupOtpRequestBody {
  user_id: string;
  phone: string;
}

interface SignupOtpVerifyBody {
  user_id: string;
  phone: string;
  otp: string;
}

interface SignupEmailOtpRequestBody {
  user_id: string;
  email: string;
}

interface SignupEmailOtpVerifyBody {
  user_id: string;
  email: string;
  otp: string;
}

interface UserRow {
  id: string;
  email: string;
  phone?: string;
  phone_verified?: boolean;
  email_verified?: boolean;
  password_hash?: string;
  role_id?: string;
  role_name?: string;
  role?: string;
  created_at?: Date;
  full_name?: string | null;
  date_of_birth?: string | Date | null;
  bio?: string | null;
  profile_picture_url?: string | null;
  updated_at?: Date;
}

/** Full user columns for SELECT when returning user data to client */
const USER_SELECT =
  "u.id, u.email, u.phone, u.full_name, u.date_of_birth, u.bio, u.profile_picture_url, r.name as role, u.created_at, u.updated_at";

function toUserResponse(
  user: UserRow,
  opts?: { phone_verified?: boolean; email_verified?: boolean }
): {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  role: string;
  created_at: Date;
  updated_at: Date | null;
  phone_verified?: boolean;
  email_verified?: boolean;
} {
  const dateOfBirth = user.date_of_birth
    ? (user.date_of_birth instanceof Date
      ? user.date_of_birth.toISOString().slice(0, 10)
      : String(user.date_of_birth).slice(0, 10))
    : null;
  const roleName = (user as UserRow & { role?: string }).role ?? user.role_name ?? "customer";
  return {
    id: user.id,
    email: user.email,
    phone: user.phone ?? null,
    full_name: user.full_name ?? null,
    date_of_birth: dateOfBirth,
    bio: user.bio ?? null,
    profile_picture_url: user.profile_picture_url ?? null,
    role: roleName,
    created_at: user.created_at!,
    updated_at: user.updated_at ?? null,
    ...(opts?.phone_verified !== undefined && { phone_verified: opts.phone_verified }),
    ...(opts?.email_verified !== undefined && { email_verified: opts.email_verified }),
  };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - phone
 *         - accept_terms
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         phone:
 *           type: string
 *           description: Phone number (will be normalized to E.164 format)
 *           example: "1234567890"
 *         country_code:
 *           type: string
 *           description: Country code (e.g., "+1" or "1"). Optional if phone already includes country code.
 *           example: "+1"
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: SecurePass123!
 *         accept_terms:
 *           type: boolean
 *           description: Must be true to accept Terms & Conditions
 *           example: true
 *         role:
 *           type: string
 *           enum: [customer, restaurant, driver]
 *           default: customer
 *           example: customer
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Verification code sent to your phone
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: 123e4567-e89b-12d3-a456-426614174000
 *                 email:
 *                   type: string
 *                   format: email
 *                   example: user@example.com
 *                 phone:
 *                   type: string
 *                   example: "+11234567890"
 *                 role:
 *                   type: string
 *                   example: customer
 *             requires_verification:
 *               type: boolean
 *               example: true
 *             verification_method:
 *               type: string
 *               example: "phone_otp"
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         password:
 *           type: string
 *           format: password
 *           example: SecurePass123!
 *     LoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Login successful
 *         data:
 *           type: object
 *           properties:
 *             token:
 *               type: string
 *               example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *             user:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 email:
 *                   type: string
 *                   format: email
 *                 phone:
 *                   type: string
 *                   example: "+11234567890"
 *                 phone_verified:
 *                   type: boolean
 *                   example: true
 *                 email_verified:
 *                   type: boolean
 *                   example: true
 *                 role:
 *                   type: string
 *     ValidateTokenRequest:
 *       type: object
 *       required:
 *         - token
 *       properties:
 *         token:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     ValidateTokenResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             valid:
 *               type: boolean
 *               example: true
 *             user:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 email:
 *                   type: string
 *                   format: email
 *                 role:
 *                   type: string
 * tags:
 *   - name: Authentication
 *     description: User authentication and authorization endpoints
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account with email, password, and optional role
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/register",
  [
    commonValidators.email("email"),
    commonValidators.password("password"),
    body("phone")
      .notEmpty()
      .withMessage("Phone is required")
      .isString()
      .withMessage("Phone must be a string"),
    body("country_code")
      .optional()
      .isString()
      .withMessage("Country code must be a string"),
    body("accept_terms")
      .isBoolean()
      .withMessage("Terms acceptance must be a boolean")
      .custom((value) => {
        if (value !== true) {
          throw new Error("You must accept the terms and conditions");
        }
        return true;
      }),
    body("role")
      .optional()
      .isIn(["customer", "restaurant", "driver"])
      .withMessage("Invalid role"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { email, password, phone, country_code, role = "customer" }: RegisterBody = req.body;

    let normalizedPhone: string;
    if (country_code) {
      normalizedPhone = combineCountryCodeAndPhone(country_code, phone);
    } else {
      normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
    }

    if (!validatePhoneFormat(normalizedPhone)) {
      throw new ValidationError("Validation failed", [
        createFieldError("phone", "Invalid phone number format. Please use E.164 format (e.g., +1234567890)"),
      ]);
    }
    const existingEmail = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE email = $1",
      [email]
    );

    const existingPhone = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE phone = $1",
      [normalizedPhone]
    );

    if (existingEmail.rows.length > 0 && existingPhone.rows.length > 0) {
      throw new ConflictError("Registration failed", [
        createFieldError("email", "Email is already registered"),
        createFieldError("phone", "Phone number is already registered"),
      ]);
    } else if (existingEmail.rows.length > 0) {
      throw new ConflictError("Registration failed", [
        createFieldError("email", "Email is already registered"),
      ]);
    } else if (existingPhone.rows.length > 0) {
      throw new ConflictError("Registration failed", [
        createFieldError("phone", "Phone number is already registered"),
      ]);
    }

    const roleResult = await pool.query<{ id: string }>(
      "SELECT id FROM auth.roles WHERE name = $1",
      [role]
    );

    if (roleResult.rows.length === 0) {
      throw new ValidationError("Validation failed", [
        createFieldError("role", "Invalid role specified"),
      ]);
    }

    const roleId = roleResult.rows[0].id;
    const passwordHash = await hashPassword(password);

    await pool.query(
      `INSERT INTO auth.users (email, phone, password_hash, role_id, terms_accepted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, normalizedPhone, passwordHash, roleId, new Date()]
    );

    const userResult = await pool.query<UserRow>(
      `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.email = $1`,
      [email]
    );
    const user = userResult.rows[0];

    let generatedOtp: string | null = null;
    try {
      const otp = await generateAndStoreOTP(
        pool,
        user.id,
        normalizedPhone,
        'signup_phone',
        10
      );
      generatedOtp = otp;

      try {
        const notificationServiceUrl = config.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';
        const smsText = `Your Food App verification code is: ${otp}. It will expire in 10 minutes. Do not share this code with anyone.`;

        const response = await fetch(`${notificationServiceUrl}/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: normalizedPhone,
            text: smsText,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          req.logger?.error({
            status: response.status,
            error: errorData,
          }, 'Failed to send signup OTP SMS via notification service');
        } else {
          req.logger?.info({ phone: normalizedPhone, userId: user.id }, 'Signup OTP SMS sent successfully');
        }
      } catch (error: any) {
        req.logger?.error({ error: error.message, phone: normalizedPhone }, 'Error sending signup OTP SMS');
      }
    } catch (error: any) {
      req.logger?.error({ error: error.message, userId: user.id }, 'Error generating signup OTP');
    }

    return sendSuccess(
      res,
      {
        user: toUserResponse(user),
        requires_verification: true,
        verification_method: "phone_otp",
        ...(generatedOtp ? {
          otp: generatedOtp,
        } : {}),
      },
      "Verification code sent to your phone",
      HTTP_STATUS.CREATED
    );
  })
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates a user and returns a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/login",
  [
    commonValidators.email("email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { email, password }: LoginBody = req.body;

    // Find user (full profile for response)
    const userResult = await pool.query<UserRow & { role_name?: string; phone_verified?: boolean; email_verified?: boolean }>(
      `SELECT u.id, u.email, u.phone, u.password_hash, u.role_id, u.phone_verified, u.email_verified,
              u.full_name, u.date_of_birth, u.bio, u.profile_picture_url, u.created_at, u.updated_at,
              r.name as role_name
       FROM auth.users u
       JOIN auth.roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError("Authentication failed", [
        createFieldError("email", "Email not registered"),
      ]);
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      throw new UnauthorizedError("Authentication failed", [
        createFieldError("password", "Invalid password"),
      ]);
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedError("Authentication failed", [
        createFieldError("password", "Invalid password"),
      ]);
    }

    // Check if phone is verified (required for login)
    if (!user.phone_verified) {
      throw new UnauthorizedError("Authentication failed", {
        errors: [
          createFieldError("phone", "Phone number is not verified. Please verify your phone number to login."),
        ],
        user_id: user.id,
      });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role_name!,
    });

    return sendSuccess(
      res,
      {
        token,
        user: toUserResponse(user, {
          phone_verified: user.phone_verified || false,
          email_verified: user.email_verified || false,
        }),
      },
      "Login successful"
    );
  })
);

/**
 * @swagger
 * /auth/login/phone:
 *   post:
 *     summary: Login user with phone
 *     description: Authenticates a user using phone and password and returns a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number in E.164 format
 *                 example: "+11234567890"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *                 example: "SecurePass123!"
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post(
  "/login/phone",
  [
    body("phone").notEmpty().withMessage("Phone is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { phone, password }: PhoneLoginBody = req.body;

    // Find user by phone (full profile for response)
    const userResult = await pool.query<UserRow & { role_name?: string; phone_verified?: boolean; email_verified?: boolean }>(
      `SELECT u.id, u.email, u.phone, u.password_hash, u.role_id, u.phone_verified, u.email_verified,
              u.full_name, u.date_of_birth, u.bio, u.profile_picture_url, u.created_at, u.updated_at,
              r.name as role_name
       FROM auth.users u
       JOIN auth.roles r ON u.role_id = r.id
       WHERE u.phone = $1`,
      [phone]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError("Authentication failed", [
        createFieldError("phone", "Phone number not registered"),
      ]);
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      throw new UnauthorizedError("Authentication failed", [
        createFieldError("password", "Invalid password"),
      ]);
    }

    // Verify password first (before checking phone verification status)
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedError("Authentication failed", [
        createFieldError("password", "Invalid password"),
      ]);
    }

    // Check if phone is verified (only after password is validated)
    if (!user.phone_verified) {
      throw new UnauthorizedError("Authentication failed", {
        errors: [
          createFieldError("phone", "Phone number is not verified. Please verify your phone number to login."),
        ],
        user_id: user.id,
      });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role_name!,
    });

    return sendSuccess(
      res,
      {
        token,
        user: toUserResponse(user, {
          phone_verified: user.phone_verified || false,
          email_verified: user.email_verified || false,
        }),
      },
      "Login successful"
    );
  })
);

/**
 * @swagger
 * /auth/validate:
 *   post:
 *     summary: Validate JWT token
 *     description: Validates a JWT token and returns user information. Used by other services for token validation. Accepts token in request body or Authorization header.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token validation result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidateTokenResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
router.post(
  "/validate",
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    // Try to get token from Authorization header first, then from body
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.body.token) {
      token = req.body.token;
    }

    if (!token) {
      throw new ValidationError("Token is required in Authorization header or request body");
    }

    try {
      const decoded = verifyToken(token);

      // Verify user still exists (full profile for response)
      const userResult = await pool.query<UserRow>(
        `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedError("User not found");
      }

      const user = userResult.rows[0];

      return sendSuccess(res, {
        valid: true,
        user: toUserResponse(user),
      });
    } catch (error: any) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      ) {
        return sendSuccess(res, {
          valid: false,
          error: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     description: Returns the currently authenticated user's information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         email:
 *                           type: string
 *                           format: email
 *                         role:
 *                           type: string
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Get full user details from database (including profile fields)
    const userResult = await pool.query<UserRow>(
      `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];

    return sendSuccess(res, {
      user: toUserResponse(user),
    });
  })
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout
 *     description: Logs out the current user. Client should discard the JWT token after calling this endpoint. With stateless JWT, the token remains valid until expiry; this endpoint confirms logout intent and allows the client to clear the token.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful. Client should discard the token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logout successful
 *                 data:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Unauthorized (invalid or missing token)
 */
router.post(
  "/logout",
  authenticate,
  asyncHandler(async (_req: RequestWithLogger, res: Response) => {
    // With stateless JWT, server does not store sessions. Client must discard the token.
    // This endpoint confirms logout and allows optional server-side actions (e.g. token blacklist) in the future.
    return sendSuccess(res, null, "Logout successful");
  })
);

/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     summary: Change password
 *     description: Allows authenticated users to change their password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or invalid current password
 */
router.put(
  "/change-password",
  authenticate,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    commonValidators.password("newPassword"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { currentPassword, newPassword }: ChangePasswordBody = req.body;

    // Get user with password hash
    const userResult = await pool.query<UserRow>(
      `SELECT u.id, u.email, u.password_hash
       FROM auth.users u
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      throw new UnauthorizedError("Invalid user data");
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(
      currentPassword,
      user.password_hash
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedError("Password change failed", [
        createFieldError("current_password", "Current password is incorrect"),
      ]);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await pool.query(
      `UPDATE auth.users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, req.user.id]
    );

    return sendSuccess(res, {}, "Password changed successfully");
  })
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Generates a password reset token and sends it via email to the user. The token is valid for 1 hour.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent (if account exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: If an account with that email exists, a password reset link has been sent to your email address.
 *       400:
 *         description: Validation error
 */
router.post(
  "/forgot-password",
  [
    commonValidators.email("email"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { email }: ForgotPasswordBody = req.body;

    // Find user
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE email = $1",
      [email]
    );

    // Don't reveal if user exists or not (security best practice)
    if (userResult.rows.length === 0) {
      // Still return success to prevent email enumeration
      return sendSuccess(res, {
        message: "If an account with that email exists, a password reset token has been generated.",
      });
    }

    const userId = userResult.rows[0].id;

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    // Invalidate any existing unused tokens for this user
    await pool.query(
      `UPDATE auth.password_reset_tokens 
       SET used = TRUE 
       WHERE user_id = $1 AND used = FALSE`,
      [userId]
    );

    // Store reset token
    await pool.query(
      `INSERT INTO auth.password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, resetToken, expiresAt]
    );

    // Send email via notification service
    try {
      const notificationServiceUrl = config.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';
      const resetUrl = process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
        : `Reset token: ${resetToken}`;

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .token { background-color: #f4f4f4; padding: 15px; border-radius: 4px; font-family: monospace; word-break: break-all; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password for your Food App account.</p>
            <p>Click the button below to reset your password:</p>
            ${process.env.FRONTEND_URL
          ? `<a href="${resetUrl}" class="button">Reset Password</a>`
          : ''}
            <p>Or use this reset token (valid for 1 hour):</p>
            <div class="token">${resetToken}</div>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <div class="footer">
              <p>This token will expire in 1 hour.</p>
              <p>For security reasons, please do not share this token with anyone.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Password Reset Request

You requested to reset your password for your Food App account.

Reset token (valid for 1 hour):
${resetToken}

${process.env.FRONTEND_URL ? `Or visit: ${resetUrl}` : ''}

If you didn't request this password reset, please ignore this email.

This token will expire in 1 hour.
For security reasons, please do not share this token with anyone.
      `;

      // Call notification service to send email
      const response = await fetch(`${notificationServiceUrl}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          subject: 'Password Reset Request - Food App',
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        req.logger?.error({
          status: response.status,
          error: errorData
        }, 'Failed to send password reset email via notification service');
        // Don't fail the request - token is still generated and stored
        // Log the error but continue
      } else {
        req.logger?.info?.({ email }, 'Password reset email sent successfully');
      }
    } catch (error: any) {
      // Log error but don't fail the request
      // Token is still generated and stored, user can request again if needed
      req.logger?.error({ error: error.message, email }, 'Error sending password reset email');
    }

    // Don't return token in response for security
    return sendSuccess(res, {
      message: "If an account with that email exists, a password reset link has been sent to your email address.",
    }, "Password reset email sent");
  })
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     description: Resets user password using a valid reset token from forgot-password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Validation error or invalid/expired token
 */
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    commonValidators.password("newPassword"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { token, newPassword }: ResetPasswordBody = req.body;

    // Find valid reset token
    const tokenResult = await pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used: boolean;
    }>(
      `SELECT id, user_id, expires_at, used
       FROM auth.password_reset_tokens
       WHERE token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      throw new ValidationError("Invalid reset token");
    }

    const resetToken = tokenResult.rows[0];

    // Check if token is used
    if (resetToken.used) {
      throw new ValidationError("Reset token has already been used");
    }

    // Check if token is expired
    if (new Date() > new Date(resetToken.expires_at)) {
      throw new ValidationError("Reset token has expired");
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await pool.query(
      `UPDATE auth.users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, resetToken.user_id]
    );

    // Mark token as used
    await pool.query(
      `UPDATE auth.password_reset_tokens 
       SET used = TRUE 
       WHERE id = $1`,
      [resetToken.id]
    );

    return sendSuccess(res, {}, "Password reset successfully");
  })
);

/**
 * @swagger
 * /auth/forgot-password-phone:
 *   post:
 *     summary: Request password reset via phone
 *     description: Generates a password reset OTP and sends it via SMS to the user's phone. The OTP is valid for 10 minutes.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+11234567890"
 *                 description: Phone number in E.164 format
 *     responses:
 *       200:
 *         description: Password reset OTP sent (if account exists)
 *       400:
 *         description: Validation error
 */
router.post(
  "/forgot-password-phone",
  [
    body("phone").notEmpty().withMessage("Phone is required"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { phone }: ForgotPasswordPhoneBody = req.body;

    // Find user by phone
    const userResult = await pool.query<{ id: string; phone_verified: boolean | null }>(
      "SELECT id, phone_verified FROM auth.users WHERE phone = $1",
      [phone]
    );

    // Don't reveal if user exists or not (security best practice)
    if (userResult.rows.length === 0 || userResult.rows[0].phone_verified === false) {
      return sendSuccess(res, {
        message: "If an account with that phone exists, a password reset OTP has been sent to your phone.",
      });
    }

    const userId = userResult.rows[0].id;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes

    // Invalidate any existing unused OTPs for this user
    await pool.query(
      `UPDATE auth.password_reset_tokens 
       SET used = TRUE 
       WHERE user_id = $1 AND used = FALSE AND otp IS NOT NULL`,
      [userId]
    );

    // Store OTP (we can also store a token for backward compatibility, but OTP will be used)
    const resetToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO auth.password_reset_tokens (user_id, token, otp, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, resetToken, otp, expiresAt]
    );

    // Send OTP via notification service as SMS
    let isSmsConfigured = true;
    try {
      const notificationServiceUrl = config.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';

      const smsText = `Your Food App password reset code is: ${otp}. It will expire in 10 minutes. Do not share this code with anyone.`;

      const response = await fetch(`${notificationServiceUrl}/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phone,
          text: smsText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        req.logger?.error({
          status: response.status,
          error: errorData,
        }, 'Failed to send password reset OTP SMS via notification service');
      } else {
        const responseData = await response.json().catch(() => ({})) as { data?: { note?: string } };
        // Check if SMS is configured based on response
        isSmsConfigured = !responseData.data?.note || !responseData.data.note.includes('not configured');
        req.logger?.info?.({ phone, smsConfigured: isSmsConfigured }, 'Password reset OTP SMS sent successfully');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      req.logger?.error({ error: errorMessage, phone }, 'Error sending password reset OTP SMS');
      isSmsConfigured = false;
    }

    // Include OTP in response
    return sendSuccess(res, {
      message: "If an account with that phone exists, a password reset OTP has been sent to your phone.",
      otp: otp,
    }, "Password reset OTP SMS sent");
  })
);

/**
 * @swagger
 * /auth/reset-password-phone:
 *   post:
 *     summary: Reset password with phone OTP
 *     description: Resets user password using a valid OTP sent to the user's phone
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *               - newPassword
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+11234567890"
 *                 description: Phone number in E.164 format
 *               otp:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: '123456'
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Validation error or invalid/expired OTP
 */
router.post(
  "/reset-password-phone",
  [
    body("phone").notEmpty().withMessage("Phone is required"),
    body("otp")
      .notEmpty().withMessage("OTP is required")
      .matches(/^[0-9]{6}$/).withMessage("OTP must be a 6-digit number"),
    commonValidators.password("newPassword"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { phone, otp, newPassword }: ResetPasswordPhoneBody = req.body;

    // Find user by phone
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE phone = $1",
      [phone]
    );

    if (userResult.rows.length === 0) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "Invalid phone or OTP"),
      ]);
    }

    const userId = userResult.rows[0].id;

    // Find valid OTP for this user
    const otpResult = await pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used: boolean;
      otp: string;
    }>(
      `SELECT id, user_id, expires_at, used, otp
       FROM auth.password_reset_tokens
       WHERE user_id = $1 AND otp = $2 AND otp IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, otp]
    );

    if (otpResult.rows.length === 0) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "Invalid OTP"),
      ]);
    }

    const resetOtp = otpResult.rows[0];

    // Check if OTP is used
    if (resetOtp.used) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "OTP has already been used"),
      ]);
    }

    // Check if OTP is expired
    if (new Date() > new Date(resetOtp.expires_at)) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "OTP has expired. Please request a new one."),
      ]);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await pool.query(
      `UPDATE auth.users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, resetOtp.user_id]
    );

    // Mark OTP as used
    await pool.query(
      `UPDATE auth.password_reset_tokens 
       SET used = TRUE 
       WHERE id = $1`,
      [resetOtp.id]
    );

    return sendSuccess(res, {}, "Password reset successfully");
  })
);

/**
 * @swagger
 * /auth/signup/phone/request-otp:
 *   post:
 *     summary: Resend signup OTP
 *     description: Resends OTP to user's phone during signup process. Does not require authentication. Rate limited to 3 requests per 15 minutes per phone.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - phone
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 description: User ID from registration response
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               phone:
 *                 type: string
 *                 description: Phone number in E.164 format (must match registration)
 *                 example: "+11234567890"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     otp:
 *                       type: string
 *                       description: OTP code (only in development mode)
 *                     note:
 *                       type: string
 *                       description: Development note (only in development mode)
 *       400:
 *         description: Validation error, rate limit exceeded, or phone already verified
 *       404:
 *         description: User not found
 */
router.post(
  "/signup/phone/request-otp",
  [
    body("user_id")
      .notEmpty()
      .withMessage("User ID is required")
      .isUUID()
      .withMessage("User ID must be a valid UUID"),
    body("phone")
      .notEmpty()
      .withMessage("Phone is required")
      .isString()
      .withMessage("Phone must be a string"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { user_id, phone }: SignupOtpRequestBody = req.body;

    // Check rate limiting (1 minute window for local testing)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const phoneRateLimitKey = `phone:${phone}`;
    const ipRateLimitKey = `ip:${clientIp}`;

    if (!memoryRateLimiter.check(phoneRateLimitKey, 3, 1)) {
      throw new ValidationError("Too many OTP requests. Please try again later.");
    }

    if (!memoryRateLimiter.check(ipRateLimitKey, 10, 1)) {
      throw new ValidationError("Too many requests from this IP. Please try again later.");
    }

    // Verify user exists and phone matches
    const userResult = await pool.query<{ id: string; phone: string; phone_verified: boolean }>(
      "SELECT id, phone, phone_verified FROM auth.users WHERE id = $1",
      [user_id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];

    if (user.phone !== phone) {
      throw new ValidationError("Validation failed", [
        createFieldError("phone", "Phone number does not match user record"),
      ]);
    }

    if (user.phone_verified) {
      throw new ValidationError("Validation failed", [
        createFieldError("phone", "Phone is already verified"),
      ]);
    }

    // Generate and store OTP
    const otp = await generateAndStoreOTP(
      pool,
      user.id,
      phone,
      'signup_phone',
      10 // 10 minutes expiry
    );

    // Send OTP via notification service as SMS
    try {
      const notificationServiceUrl = config.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';
      const smsText = `Your Food App verification code is: ${otp}. It will expire in 10 minutes. Do not share this code with anyone.`;

      const response = await fetch(`${notificationServiceUrl}/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phone,
          text: smsText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        req.logger?.error({
          status: response.status,
          error: errorData,
        }, 'Failed to send signup OTP SMS via notification service');
        throw new ValidationError("Failed to send OTP. Please try again.");
      } else {
        req.logger?.info?.({ phone, userId: user.id }, 'Signup OTP SMS sent successfully');
      }
    } catch (error: any) {
      if (error instanceof ValidationError) {
        throw error;
      }
      req.logger?.error({ error: error.message, phone }, 'Error sending signup OTP SMS');
      throw new ValidationError("Failed to send OTP. Please try again.");
    }

    return sendSuccess(
      res,
      {
        message: "Verification code has been sent to your phone.",
        otp: otp,
      },
      "Signup OTP SMS sent"
    );
  })
);

/**
 * @swagger
 * /auth/signup/phone/verify-otp:
 *   post:
 *     summary: Verify signup OTP and auto-login
 *     description: Verifies OTP sent during signup and automatically logs in the user. Returns JWT token.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - phone
 *               - otp
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               phone:
 *                 type: string
 *                 example: "+11234567890"
 *                 description: Phone number in E.164 format
 *               otp:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: OTP verified successfully, user logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Validation error or invalid/expired OTP
 *       404:
 *         description: User not found
 */
router.post(
  "/signup/phone/verify-otp",
  [
    body("user_id")
      .notEmpty()
      .withMessage("User ID is required")
      .isUUID()
      .withMessage("User ID must be a valid UUID"),
    body("phone")
      .notEmpty()
      .withMessage("Phone is required")
      .isString()
      .withMessage("Phone must be a string"),
    body("otp")
      .notEmpty()
      .withMessage("OTP is required")
      .matches(/^[0-9]{6}$/)
      .withMessage("OTP must be a 6-digit number"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { user_id, phone, otp }: SignupOtpVerifyBody = req.body;

    // Verify user exists and phone matches
    const userResult = await pool.query<UserRow & { role_name?: string }>(
      `SELECT u.id, u.email, u.phone, u.phone_verified, u.role_id, r.name as role_name
       FROM auth.users u
       JOIN auth.roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];

    if (user.phone !== phone) {
      throw new ValidationError("Phone number does not match user record");
    }

    // Validate OTP using utility function
    const otpValidation = await validateOTP(
      pool,
      user.id,
      phone,
      otp,
      'signup_phone'
    );

    if (!otpValidation.valid || !otpValidation.record) {
      throw new ValidationError(otpValidation.error || "Invalid or expired OTP");
    }

    // Mark OTP as used
    await markOTPAsUsed(pool, otpValidation.record.id);

    // Update user's phone_verified status
    await pool.query(
      `UPDATE auth.users
       SET phone_verified = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    // Fetch full user for response
    const fullUserResult = await pool.query<UserRow>(
      `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
      [user.id]
    );
    const fullUser = fullUserResult.rows[0];

    // Generate JWT token for auto-login
    const token = generateToken({
      userId: fullUser.id,
      email: fullUser.email,
      role: (fullUser as UserRow & { role?: string }).role ?? "customer",
    });

    return sendSuccess(
      res,
      {
        token,
        user: toUserResponse(fullUser, { phone_verified: true }),
      },
      "Phone verified successfully. You are now logged in."
    );
  })
);

/**
 * @swagger
 * /auth/signup/email/request-otp:
 *   post:
 *     summary: Resend signup email OTP
 *     description: Resends OTP to user's email during signup process. Does not require authentication. Rate limited to 3 requests per 15 minutes per email.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - email
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 description: User ID from registration response
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address (must match registration)
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     otp:
 *                       type: string
 *                       description: OTP code (only in development mode)
 *                     note:
 *                       type: string
 *                       description: Development note (only in development mode)
 *       400:
 *         description: Validation error, rate limit exceeded, or email already verified
 *       404:
 *         description: User not found
 */
router.post(
  "/signup/email/request-otp",
  [
    body("user_id")
      .notEmpty()
      .withMessage("User ID is required")
      .isUUID()
      .withMessage("User ID must be a valid UUID"),
    commonValidators.email("email"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { user_id, email }: SignupEmailOtpRequestBody = req.body;

    // Check rate limiting (1 minute window for local testing)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const emailRateLimitKey = `email:${email}`;
    const ipRateLimitKey = `ip:${clientIp}`;

    if (!memoryRateLimiter.check(emailRateLimitKey, 3, 1)) {
      throw new ValidationError("Too many OTP requests. Please try again later.");
    }

    if (!memoryRateLimiter.check(ipRateLimitKey, 10, 1)) {
      throw new ValidationError("Too many requests from this IP. Please try again later.");
    }

    // Verify user exists and email matches
    const userResult = await pool.query<{ id: string; email: string; email_verified: boolean }>(
      "SELECT id, email, email_verified FROM auth.users WHERE id = $1",
      [user_id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];

    if (user.email !== email) {
      throw new ValidationError("Validation failed", [
        createFieldError("email", "Email address does not match user record"),
      ]);
    }

    if (user.email_verified) {
      throw new ValidationError("Validation failed", [
        createFieldError("email", "Email is already verified"),
      ]);
    }

    // Generate and store OTP
    const otp = await generateAndStoreOTP(
      pool,
      user.id,
      email, // Using email as identifier for email OTPs
      'signup_email',
      10 // 10 minutes expiry
    );

    // Send OTP via notification service as Email
    try {
      const notificationServiceUrl = config.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .otp-box { background-color: #f4f4f4; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 8px; margin: 30px 0; color: #007bff; border: 2px solid #007bff; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .warning { background-color: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffc107; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Email Verification</h2>
            <p>Thank you for registering with Food App!</p>
            <p>Use the following verification code to verify your email address:</p>
            <div class="otp-box">${otp}</div>
            <div class="warning">
              <strong>Important:</strong> This code will expire in 10 minutes. Do not share this code with anyone.
            </div>
            <p>If you didn't create an account, please ignore this email.</p>
            <div class="footer">
              <p>For security reasons, please do not share this code with anyone.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Email Verification

Thank you for registering with Food App!

Your verification code is: ${otp}

This code will expire in 10 minutes.

Important: Do not share this code with anyone.

If you didn't create an account, please ignore this email.
      `;

      const response = await fetch(`${notificationServiceUrl}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          subject: 'Food App - Email Verification Code',
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        req.logger?.error({
          status: response.status,
          error: errorData,
        }, 'Failed to send signup email OTP via notification service');
        throw new ValidationError("Failed to send OTP. Please try again.");
      } else {
        req.logger?.info?.({ email, userId: user.id }, 'Signup email OTP sent successfully');
      }
    } catch (error: any) {
      if (error instanceof ValidationError) {
        throw error;
      }
      req.logger?.error({ error: error.message, email }, 'Error sending signup email OTP');
      throw new ValidationError("Failed to send OTP. Please try again.");
    }

    return sendSuccess(
      res,
      {
        message: "Verification code has been sent to your email.",
        otp: otp,
      },
      "Signup email OTP sent"
    );
  })
);

/**
 * @swagger
 * /auth/signup/email/verify-otp:
 *   post:
 *     summary: Verify signup email OTP and auto-login
 *     description: Verifies email OTP sent during signup and automatically logs in the user. Returns JWT token.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - email
 *               - otp
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               otp:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Email OTP verified successfully, user logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Validation error or invalid/expired OTP
 *       404:
 *         description: User not found
 */
router.post(
  "/signup/email/verify-otp",
  [
    body("user_id")
      .notEmpty()
      .withMessage("User ID is required")
      .isUUID()
      .withMessage("User ID must be a valid UUID"),
    commonValidators.email("email"),
    body("otp")
      .notEmpty()
      .withMessage("OTP is required")
      .matches(/^[0-9]{6}$/)
      .withMessage("OTP must be a 6-digit number"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { user_id, email, otp }: SignupEmailOtpVerifyBody = req.body;

    // Verify user exists and email matches
    const userResult = await pool.query<UserRow & { role_name?: string; phone_verified?: boolean }>(
      `SELECT u.id, u.email, u.phone, u.phone_verified, u.email_verified, u.role_id, r.name as role_name
       FROM auth.users u
       JOIN auth.roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];

    if (user.email !== email) {
      throw new ValidationError("Validation failed", [
        createFieldError("email", "Email address does not match user record"),
      ]);
    }

    // Validate OTP using utility function (using email as identifier)
    const otpValidation = await validateOTP(
      pool,
      user.id,
      email, // Using email as identifier for email OTPs
      otp,
      'signup_email'
    );

    if (!otpValidation.valid || !otpValidation.record) {
      throw new ValidationError(otpValidation.error || "Invalid or expired OTP");
    }

    // Mark OTP as used
    await markOTPAsUsed(pool, otpValidation.record.id);

    // Update user's email_verified status
    await pool.query(
      `UPDATE auth.users
       SET email_verified = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    // Fetch full user for response
    const fullUserResult = await pool.query<UserRow>(
      `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
      [user.id]
    );
    const fullUser = fullUserResult.rows[0];

    // Generate JWT token for auto-login
    const token = generateToken({
      userId: fullUser.id,
      email: fullUser.email,
      role: (fullUser as UserRow & { role?: string }).role ?? "customer",
    });

    return sendSuccess(
      res,
      {
        token,
        user: toUserResponse(fullUser, {
          phone_verified: user.phone_verified || false,
          email_verified: true,
        }),
      },
      "Email verified successfully. You are now logged in."
    );
  })
);

/**
 * @swagger
 * /auth/forgot-password-otp:
 *   post:
 *     summary: Request password reset via OTP
 *     description: Generates a 6-digit OTP and sends it via email to the user. The OTP is valid for 10 minutes.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent successfully (if account exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: If an account with that email exists, an OTP has been sent to your email address.
 *       400:
 *         description: Validation error
 */
router.post(
  "/forgot-password-otp",
  [
    commonValidators.email("email"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { email }: ForgotPasswordOtpBody = req.body;

    // Find user
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE email = $1",
      [email]
    );

    // Don't reveal if user exists or not (security best practice)
    if (userResult.rows.length === 0) {
      // Still return success to prevent email enumeration
      return sendSuccess(res, {
        message: "If an account with that email exists, a password reset OTP has been sent to your email address.",
      });
    }

    const userId = userResult.rows[0].id;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes

    // Invalidate any existing unused OTPs for this user
    await pool.query(
      `UPDATE auth.password_reset_tokens 
       SET used = TRUE 
       WHERE user_id = $1 AND used = FALSE AND otp IS NOT NULL`,
      [userId]
    );

    // Store OTP (we can also store a token for backward compatibility, but OTP will be used)
    const resetToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO auth.password_reset_tokens (user_id, token, otp, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, resetToken, otp, expiresAt]
    );

    // Send OTP via notification service
    try {
      const notificationServiceUrl = config.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .otp-box { background-color: #f4f4f4; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 8px; margin: 30px 0; color: #007bff; border: 2px solid #007bff; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .warning { background-color: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffc107; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Password Reset OTP</h2>
            <p>You requested to reset your password for your Food App account.</p>
            <p>Use the following OTP to reset your password:</p>
            <div class="otp-box">${otp}</div>
            <div class="warning">
              <strong>Important:</strong> This OTP will expire in 10 minutes. Do not share this OTP with anyone.
            </div>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <div class="footer">
              <p>For security reasons, please do not share this OTP with anyone.</p>
              <p>If you need assistance, please contact our support team.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Password Reset OTP

You requested to reset your password for your Food App account.

Your OTP is: ${otp}

This OTP will expire in 10 minutes.

Important: Do not share this OTP with anyone.

If you didn't request this password reset, please ignore this email.

For security reasons, please do not share this OTP with anyone.
      `;

      // Call notification service to send email
      const response = await fetch(`${notificationServiceUrl}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          subject: 'Password Reset OTP - Food App',
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        req.logger?.error({
          status: response.status,
          error: errorData
        }, 'Failed to send password reset OTP email via notification service');
        // Don't fail the request - OTP is still generated and stored
        // Log the error but continue
      } else {
        req.logger?.info?.({ email }, 'Password reset OTP sent successfully');
      }
    } catch (error: any) {
      // Log error but don't fail the request
      // OTP is still generated and stored, user can request again if needed
      req.logger?.error({ error: error.message, email }, 'Error sending password reset OTP email');
    }

    // Include OTP in response
    return sendSuccess(res, {
      message: "If an account with that email exists, a password reset OTP has been sent to your email address.",
      otp: otp,
    }, "Password reset OTP sent");
  })
);

/**
 * @swagger
 * /auth/reset-password-otp:
 *   post:
 *     summary: Reset password with OTP
 *     description: Resets user password using a valid OTP from forgot-password-otp
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: '123456'
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Validation error or invalid/expired OTP
 */
router.post(
  "/reset-password-otp",
  [
    commonValidators.email("email"),
    body("otp")
      .notEmpty().withMessage("OTP is required")
      .matches(/^[0-9]{6}$/).withMessage("OTP must be a 6-digit number"),
    commonValidators.password("newPassword"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { email, otp, newPassword }: ResetPasswordOtpBody = req.body;

    // Find user
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      throw new ValidationError("Validation failed", [
        createFieldError("email", "Invalid email or OTP"),
      ]);
    }

    const userId = userResult.rows[0].id;

    // Find valid OTP for this user
    const otpResult = await pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used: boolean;
      otp: string;
    }>(
      `SELECT id, user_id, expires_at, used, otp
       FROM auth.password_reset_tokens
       WHERE user_id = $1 AND otp = $2 AND otp IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, otp]
    );

    if (otpResult.rows.length === 0) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "Invalid OTP"),
      ]);
    }

    const resetOtp = otpResult.rows[0];

    // Check if OTP is used
    if (resetOtp.used) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "OTP has already been used"),
      ]);
    }

    // Check if OTP is expired
    if (new Date() > new Date(resetOtp.expires_at)) {
      throw new ValidationError("Validation failed", [
        createFieldError("otp", "OTP has expired. Please request a new one."),
      ]);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await pool.query(
      `UPDATE auth.users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, resetOtp.user_id]
    );

    // Mark OTP as used
    await pool.query(
      `UPDATE auth.password_reset_tokens 
       SET used = TRUE 
       WHERE id = $1`,
      [resetOtp.id]
    );

    return sendSuccess(res, {}, "Password reset successfully");
  })
);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     summary: Update user profile
 *     description: Update profile. All fields optional. Select "multipart/form-data" content type in Swagger UI to upload profile picture image in the same request as full_name, date_of_birth, bio. Profile picture is set only by uploading the image (no URL). Email and phone cannot be changed.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 maxLength: 255
 *                 description: Display name (optional)
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *                 description: Date of birth (ISO 8601, e.g. 2004-01-02) (optional)
 *               bio:
 *                 type: string
 *                 description: Short bio (optional)
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 description: Display name (optional)
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *                 description: Date of birth (ISO 8601, e.g. 2004-01-02) (optional)
 *               bio:
 *                 type: string
 *                 description: Short bio (optional)
 *               profile_picture:
 *                 type: string
 *                 format: binary
 *                 description: Upload profile picture image directly (optional, max 2MB). Use multipart/form-data to send image in the same request as other fields.
 *           encoding:
 *             profile_picture:
 *               contentType: image/jpeg
 *     responses:
 *       200:
 *         description: Profile updated successfully (or current profile if no fields provided)
 *       400:
 *         description: Validation error or email/phone update attempted
 */
router.put(
  "/profile",
  authenticate,
  optionalProfileUpload,
  [
    body("full_name")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Full name must not exceed 255 characters"),
    commonValidators.date("date_of_birth"),
    body("bio")
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage("Bio must not exceed 2000 characters"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Email and phone are not changeable via profile update
    if (req.body.email !== undefined) {
      throw new ValidationError("Validation failed", [
        createFieldError("email", "Email cannot be updated through this endpoint."),
      ]);
    }
    if (req.body.phone !== undefined) {
      throw new ValidationError("Validation failed", [
        createFieldError("phone", "Phone number cannot be updated through this endpoint."),
      ]);
    }

    const { full_name, date_of_birth, bio } = req.body;
    const file = (req as Request & { file?: Express.Multer.File }).file;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(full_name === "" ? null : full_name);
    }
    if (date_of_birth !== undefined) {
      updates.push(`date_of_birth = $${paramIndex++}`);
      values.push(date_of_birth === "" ? null : date_of_birth);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio === "" ? null : bio);
    }

    // Profile picture: set only by uploading image directly in the same request (multipart/form-data)
    if (file) {
      updates.push(`profile_picture_url = $${paramIndex++}`);
      values.push(getFileUrl(file.filename));
    }

    // All fields are optional - if nothing to update, just return current profile
    if (updates.length === 0) {
      const userResult = await pool.query<UserRow>(
        `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
        [req.user.id]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError("User not found");
      }

      const user = userResult.rows[0];
      return sendSuccess(res, {
        user: toUserResponse(user),
      }, "Profile retrieved");
    }

    values.push(req.user.id);
    await pool.query(
      `UPDATE auth.users
       SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}`,
      values
    );

    const userResult = await pool.query<UserRow>(
      `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult.rows[0];
    return sendSuccess(res, {
      user: toUserResponse(user),
    }, "Profile updated successfully");
  })
);

/**
 * @swagger
 * /auth/admin/create-admin:
 *   post:
 *     summary: Create admin user (Admin only)
 *     description: Creates a new admin user. Only existing admin users can create new admin users.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: SecurePass123!
 *     responses:
 *       201:
 *         description: Admin user created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/admin/create-admin",
  authenticate,
  authorize("admin"),
  [
    commonValidators.email("email"),
    commonValidators.password("password"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await pool.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError("Registration failed", [
        createFieldError("email", "User with this email already exists"),
      ]);
    }

    // Get admin role ID
    const roleResult = await pool.query<{ id: string }>(
      "SELECT id FROM auth.roles WHERE name = $1",
      ["admin"]
    );

    if (roleResult.rows.length === 0) {
      throw new ValidationError("Admin role not found in database");
    }

    const roleId = roleResult.rows[0].id;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user
    await pool.query(
      `INSERT INTO auth.users (email, password_hash, role_id)
       VALUES ($1, $2, $3)`,
      [email, passwordHash, roleId]
    );

    const userResult = await pool.query<UserRow>(
      `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.email = $1`,
      [email]
    );
    const user = userResult.rows[0];

    return sendSuccess(
      res,
      {
        user: toUserResponse(user),
      },
      "Admin user created successfully",
      HTTP_STATUS.CREATED
    );
  })
);

export default router;
