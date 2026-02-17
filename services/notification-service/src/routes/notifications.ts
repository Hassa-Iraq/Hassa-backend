import express, { Response } from 'express';
import { body } from 'express-validator';
import { sendSuccess } from 'shared/api-response/index';
import { validateRequest, commonValidators } from 'shared/validation/index';
import { asyncHandler, RequestWithLogger } from 'shared/error-handler/index';
import nodemailer from 'nodemailer';
import config from '../config/index';

const router = express.Router();

// Create email transporter
// In production, configure with real SMTP settings
// For development, you can use services like Gmail, SendGrid, AWS SES, etc.
const createTransporter = () => {
  // Check if SMTP is configured
  const smtpHost = config.SMTP_HOST;
  const smtpPort = config.SMTP_PORT;
  const smtpUser = config.SMTP_USER;
  const smtpPassword = config.SMTP_PASSWORD;
  const smtpSecure = config.SMTP_SECURE === 'true';

  if (smtpHost && smtpPort && smtpUser && smtpPassword) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: smtpSecure, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }

  // Fallback: Use console logging for development (no actual email sent)
  // In production, SMTP must be configured
  // This will log emails to console instead of sending
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
};

const transporter = createTransporter();

interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendSMSBody {
  to: string;
  text: string;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     SendEmailRequest:
 *       type: object
 *       required:
 *         - to
 *         - subject
 *         - html
 *       properties:
 *         to:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         subject:
 *           type: string
 *           example: Password Reset Request
 *         html:
 *           type: string
 *           example: <h1>Reset your password</h1><p>Click here to reset...</p>
 *         text:
 *           type: string
 *           example: Reset your password. Click here to reset...
 *     SendEmailResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             messageId:
 *               type: string
 * tags:
 *   - name: Notifications
 *     description: Email and notification endpoints
 */

/**
 * @swagger
 * /notifications/send-email:
 *   post:
 *     summary: Send email
 *     description: Sends an email to the specified recipient. Requires SMTP configuration in environment variables. Accessible at /api/notifications/send-email through gateway.
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendEmailRequest'
 *     responses:
 *       200:
 *         description: Email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SendEmailResponse'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Email sending failed
 */
router.post(
  '/send-email',
  [
    commonValidators.email('to'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('html').notEmpty().withMessage('HTML content is required'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { to, subject, html, text }: SendEmailBody = req.body;

    const from = config.SMTP_FROM || config.SMTP_USER || 'noreply@foodapp.com';

    // Check if SMTP is configured
    const isSmtpConfigured = !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD);

    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
      });

      // In development mode (no SMTP), log email to console
      if (!isSmtpConfigured) {
        console.log('\n=== EMAIL (Development Mode - Not Actually Sent) ===');
        console.log('To:', to);
        console.log('From:', from);
        console.log('Subject:', subject);
        console.log('HTML Content:', html);
        if (text) console.log('Text Content:', text);
        console.log('==================================================\n');
      }

      // Log email
      if (req.logger) {
        req.logger.info({
          to,
          subject,
          messageId: info.messageId,
          smtpConfigured: isSmtpConfigured,
        }, 'Email sent');
      }

      return sendSuccess(
        res,
        {
          messageId: info.messageId,
          ...(isSmtpConfigured ? {} : { note: 'Email logged to console (SMTP not configured)' }),
        },
        isSmtpConfigured ? 'Email sent successfully' : 'Email logged to console (development mode)'
      );
    } catch (error: unknown) {
      // Log full error for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (req.logger) {
        req.logger.error({ 
          error: errorMessage, 
          stack: errorStack,
          to, 
          subject,
          smtpConfigured: isSmtpConfigured
        }, 'Failed to send email');
      } else {
        console.error('Failed to send email:', error);
      }

      // If SMTP is not configured OR if SMTP fails, log to console in development
      // This allows testing without proper SMTP setup
      const isDevelopment = process.env.NODE_ENV !== 'production' || !isSmtpConfigured;
      
      if (isDevelopment) {
        console.log('\n=== EMAIL (Development Mode - Logged Instead) ===');
        console.log('To:', to);
        console.log('From:', from);
        console.log('Subject:', subject);
        console.log('HTML:', html);
        if (text) console.log('Text:', text);
        console.log('Error:', errorMessage);
        console.log('==================================================\n');
        
        return sendSuccess(
          res,
          {
            messageId: 'dev-mode-' + Date.now(),
            note: isSmtpConfigured 
              ? 'Email logged to console (SMTP configuration error)' 
              : 'Email logged to console (SMTP not configured)',
          },
          'Email logged to console (development mode)'
        );
      }

      // In production with SMTP configured, throw error
      throw new Error('Failed to send email. Please check SMTP configuration.');
    }
  })
);

/**
 * @swagger
 * /notifications/send-sms:
 *   post:
 *     summary: Send SMS
 *     description: Sends an SMS to the specified phone number. In development mode, logs to console. In production, requires SMS provider configuration (Twilio, AWS SNS, etc.).
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - text
 *             properties:
 *               to:
 *                 type: string
 *                 description: Phone number in E.164 format
 *                 example: "+1234567890"
 *               text:
 *                 type: string
 *                 description: SMS message text
 *                 example: "Your verification code is: 123456"
 *     responses:
 *       200:
 *         description: SMS sent successfully (or logged in development)
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
 *                     messageId:
 *                       type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: SMS sending failed
 */
router.post(
  '/send-sms',
  [
    body('to')
      .notEmpty()
      .withMessage('Phone number is required')
      .isString()
      .withMessage('Phone number must be a string'),
    body('text')
      .notEmpty()
      .withMessage('Message text is required')
      .isString()
      .withMessage('Message text must be a string'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { to, text }: SendSMSBody = req.body;

    // TODO: In production, integrate with SMS provider (Twilio, AWS SNS, etc.)
    // For now, log to console in development mode
    const isSmsConfigured = false; // Set to true when SMS provider is configured

    try {
      // In development mode (no SMS provider), log SMS to console
      if (!isSmsConfigured) {
        console.log('\n=== SMS (Development Mode - Not Actually Sent) ===');
        console.log('To:', to);
        console.log('Message:', text);
        console.log('==================================================\n');
      }

      // Log SMS
      if (req.logger) {
        req.logger.info({
          to,
          messageLength: text.length,
          smsConfigured: isSmsConfigured,
        }, 'SMS sent');
      }

      return sendSuccess(
        res,
        {
          messageId: 'sms-' + Date.now(),
          ...(isSmsConfigured ? {} : { 
            note: 'SMS logged to console (SMS provider not configured)',
            // Include OTP in response for development/testing purposes
            otp: text.match(/\d{6}/)?.[0] || null,
            message: text
          }),
        },
        isSmsConfigured ? 'SMS sent successfully' : 'SMS logged to console (development mode)'
      );
    } catch (error: unknown) {
      // Log full error for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (req.logger) {
        req.logger.error({ 
          error: errorMessage, 
          stack: errorStack,
          to, 
          smsConfigured: isSmsConfigured
        }, 'Failed to send SMS');
      } else {
        console.error('Failed to send SMS:', error);
      }

      // In development mode, still log to console even on error
      const isDevelopment = process.env.NODE_ENV !== 'production' || !isSmsConfigured;
      
      if (isDevelopment) {
        console.log('\n=== SMS (Development Mode - Logged Instead) ===');
        console.log('To:', to);
        console.log('Message:', text);
        console.log('Error:', errorMessage);
        console.log('==================================================\n');
        
        return sendSuccess(
          res,
          {
            messageId: 'dev-sms-' + Date.now(),
            note: isSmsConfigured 
              ? 'SMS logged to console (SMS provider error)' 
              : 'SMS logged to console (SMS provider not configured)',
          },
          'SMS logged to console (development mode)'
        );
      }

      // In production with SMS provider configured, throw error
      throw new Error('Failed to send SMS. Please check SMS provider configuration.');
    }
  })
);

export default router;
