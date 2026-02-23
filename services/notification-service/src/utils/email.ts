import nodemailer from "nodemailer";
import config from "../config/index";

const smtpHost = config.SMTP_HOST;
const smtpPort = config.SMTP_PORT;
const smtpUser = config.SMTP_USER;
const smtpPassword = config.SMTP_PASSWORD;
const smtpSecure = config.SMTP_SECURE === "true";

function createTransporter() {
  if (smtpHost && smtpPort && smtpUser && smtpPassword) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    });
  }
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
}

export const transporter = createTransporter();

export function isSmtpConfigured(): boolean {
  return !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD);
}

export function getFromAddress(): string {
  return config.SMTP_FROM || config.SMTP_USER || "noreply@foodapp.com";
}
