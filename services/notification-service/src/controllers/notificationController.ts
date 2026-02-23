import { Request, Response } from "express";
import { transporter, isSmtpConfigured, getFromAddress } from "../utils/email";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendEmail(req: Request, res: Response) {
  const { to, subject, html, text } = req.body;

  if (!to || typeof to !== "string" || !to.trim()) {
    return res.status(400).json({
      success: false,
      status: "ERROR",
      message: "Recipient email is required",
      data: null,
    });
  }
  const toTrimmed = String(to).trim().toLowerCase();
  if (!EMAIL_REGEX.test(toTrimmed)) {
    return res.status(400).json({
      success: false,
      status: "ERROR",
      message: "Invalid email address",
      data: null,
    });
  }
  if (!subject || typeof subject !== "string" || !String(subject).trim()) {
    return res.status(400).json({
      success: false,
      status: "ERROR",
      message: "Subject is required",
      data: null,
    });
  }
  if (!html || typeof html !== "string" || !String(html).trim()) {
    return res.status(400).json({
      success: false,
      status: "ERROR",
      message: "HTML content is required",
      data: null,
    });
  }

  const from = getFromAddress();
  const configured = isSmtpConfigured();

  try {
    const info = await transporter.sendMail({
      from,
      to: toTrimmed,
      subject: String(subject).trim(),
      html: String(html).trim(),
      text: typeof text === "string" && text.trim() ? text.trim() : String(html).replace(/<[^>]*>/g, ""),
    });

    if (!configured) {
      console.log("\n=== EMAIL (Development - Not Sent) ===");
      console.log("To:", toTrimmed, "Subject:", subject);
      console.log("=====================================\n");
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: configured ? "Email sent successfully" : "Email logged to console (development)",
      data: {
        messageId: info.messageId,
        ...(configured ? {} : { note: "SMTP not configured" }),
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to send email:", error);

    const isDev = process.env.NODE_ENV !== "production" || !configured;
    if (isDev) {
      console.log("\n=== EMAIL (Development - Logged) ===");
      console.log("To:", toTrimmed, "Subject:", subject, "Error:", errMsg);
      console.log("=====================================\n");
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "Email logged to console (development)",
        data: {
          messageId: "dev-" + Date.now(),
          note: configured ? "SMTP error" : "SMTP not configured",
        },
      });
    }

    return res.status(502).json({
      success: false,
      status: "ERROR",
      message: "Failed to send email. Please check SMTP configuration.",
      data: null,
    });
  }
}

const isSmsConfigured = (): boolean => false;

export async function sendSms(req: Request, res: Response) {
  const { to, text } = req.body;

  if (!to || typeof to !== "string" || !String(to).trim()) {
    return res.status(400).json({
      success: false,
      status: "ERROR",
      message: "Phone number is required",
      data: null,
    });
  }
  if (!text || typeof text !== "string" || !String(text).trim()) {
    return res.status(400).json({
      success: false,
      status: "ERROR",
      message: "Message text is required",
      data: null,
    });
  }

  const toTrimmed = String(to).trim();
  const textTrimmed = String(text).trim();
  const configured = isSmsConfigured();

  try {
    if (!configured) {
      console.log("\n=== SMS (Development - Not Sent) ===");
      console.log("To:", toTrimmed, "Message:", textTrimmed);
      console.log("====================================\n");
    }

    return res.status(200).json({
      success: true,
      status: "OK",
      message: configured ? "SMS sent successfully" : "SMS logged to console (development)",
      data: {
        messageId: "sms-" + Date.now(),
        ...(configured
          ? {}
          : {
              note: "SMS provider not configured",
              otp: textTrimmed.match(/\d{6}/)?.[0] ?? null,
              message: textTrimmed,
            }),
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to send SMS:", error);

    const isDev = process.env.NODE_ENV !== "production" || !configured;
    if (isDev) {
      console.log("\n=== SMS (Development - Logged) ===");
      console.log("To:", toTrimmed, "Message:", textTrimmed, "Error:", errMsg);
      console.log("===================================\n");
      return res.status(200).json({
        success: true,
        status: "OK",
        message: "SMS logged to console (development)",
        data: {
          messageId: "dev-sms-" + Date.now(),
          note: configured ? "SMS provider error" : "SMS provider not configured",
        },
      });
    }

    return res.status(502).json({
      success: false,
      status: "ERROR",
      message: "Failed to send SMS. Please check SMS provider configuration.",
      data: null,
    });
  }
}
