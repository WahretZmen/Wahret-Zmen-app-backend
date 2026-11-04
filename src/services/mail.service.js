import nodemailer from "nodemailer";

let transporter = null;
let transporterKey = null;

const normalize = (value) => String(value ?? "").trim();
export const normalizeEmail = (value) => normalize(value).toLowerCase();
export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

function getMailConfig() {
  const host = normalize(process.env.SMTP_HOST || "ssl0.ovh.net");
  const port = Number(process.env.SMTP_PORT || 465);
  const user = normalize(process.env.SMTP_USER);
  const pass = process.env.SMTP_PASSWORD;
  const from = normalize(process.env.MAIL_FROM || user);

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass) {
    throw new Error("SMTP configuration missing or invalid (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)");
  }
  if (from.toLowerCase() !== user.toLowerCase()) {
    throw new Error("MAIL_FROM must match SMTP_USER");
  }
  return { host, port, user, pass, from };
}

export function getMailTransporter() {
  const config = getMailConfig();
  const key = JSON.stringify([config.host, config.port, config.user, config.pass]);
  if (!transporter || transporterKey !== key) {
    if (transporter) transporter.close();
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: { servername: config.host, minVersion: "TLSv1.2" },
    });
    transporterKey = key;
  }
  return transporter;
}

// Named export preserved for src/orders/order.controller.js.
export async function sendProfessionalMail({ to, subject, text, html, replyTo, attachments, cc, bcc } = {}) {
  const config = getMailConfig();
  if (!to || !subject || (!text && !html)) {
    throw new Error("Incomplete email payload (to, subject, text/html required)");
  }
  try {
    return await getMailTransporter().sendMail({
    from: {
      name: process.env.MAIL_FROM_NAME || "Wahret Zmen By Sabri",
      address: config.from,
    },
    to,
    subject,
    ...(text != null ? { text } : {}),
    ...(html != null ? { html } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(attachments ? { attachments } : {}),
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    });
  } catch (error) {
    console.error('[Wahret Zmen SMTP]', {
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
      message: error?.message,
    });
    throw error;
  }
}

export const sendMail = sendProfessionalMail;
export async function verifyMailTransporter() {
  return getMailTransporter().verify();
}
export const MAIL_FROM = normalize(process.env.MAIL_FROM || process.env.SMTP_USER);
export const MAIL_TO = normalize(process.env.MAIL_TO);
