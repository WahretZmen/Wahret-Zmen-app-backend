"use strict";
const { Router } = require("express");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const Reminder = require("./adminReminder.model.js");
const router = Router();
const MAX_ATTEMPTS = 5;
const MAX_BATCH = 12;
const LEASE_MS = 120000;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateText = date => new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "full", timeStyle: "short" }).format(new Date(date));
const errorText = err => String(err?.message || err || "Unknown error").slice(0, 400);
const retryDate = attempts => new Date(Date.now() + Math.min(60, 2 ** attempts) * 60000);
function authorized(req) {
  const expected = String(process.env.REMINDER_CRON_SECRET || process.env.CRON_SECRET || "").trim();
  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const supplied = bearer || String(req.get("x-reminder-cron-secret") || "").trim();
  if (!expected || !supplied) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(supplied).digest();
  return crypto.timingSafeEqual(a, b);
}
function smtpTransport() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASSWORD || "");
  if (!host || !user || !pass) throw new Error("SMTP configuration incomplete");
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT");
  const secure = process.env.SMTP_SECURE == null ? port === 465 : String(process.env.SMTP_SECURE).toLowerCase() === "true";
  return nodemailer.createTransport({ host, port, secure, requireTLS: !secure, auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, tls: { servername: host } });
}
async function sendEmail(item) {
  const transport = smtpTransport();
  const recipient = String(item.recipientEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Invalid reminder recipient");
  const date = dateText(item.scheduledFor);
  try {
    const receipt = await transport.sendMail({
      from: { name: "Am Hssin · Wahret Zmen", address: String(process.env.MAIL_FROM || process.env.SMTP_USER).trim() },
      to: recipient,
      subject: `Rappel Am Hssin — ${item.title}`,
      text: `Bonjour,\n\nAm Hssin vous rappelle : ${item.title}\n\n${item.details || ""}\n\nDate prévue : ${date} (heure de Tunis)\n\nWahret Zmen By Sabri`,
      html: `<div style="font:15px/1.7 Arial,sans-serif;max-width:620px;margin:auto;padding:24px;border:1px solid #ded5cb"><h2 style="color:#8B5C3E">Rappel Am Hssin</h2><h3>${esc(item.title)}</h3><p style="white-space:pre-wrap">${esc(item.details || "")}</p><p><strong>${esc(date)} · Tunis</strong></p><hr><small>Wahret Zmen By Sabri</small></div>`
    });
    if (!receipt.accepted?.some(email => String(email).toLowerCase() === recipient)) throw new Error("SMTP did not accept recipient");
    return receipt.messageId || "smtp-accepted";
  } finally { transport.close(); }
}
// Compatibility: old records may lack delivery.email.attemptCount/status.
// Do not revive records already marked sent, cancelled, or failed.
function eligibleQuery(now) {
  return {
    status: { $in: ["pending", "processing", "partial"] },
    scheduledFor: { $lte: now },
    "delivery.email.status": { $nin: ["sent", "failed", "disabled"] },
    "delivery.email.sentAt": null,
    sentAt: null,
    messageId: { $in: [null, ""] },
    $and: [
      { $or: [
        { "delivery.email.attemptCount": { $lt: MAX_ATTEMPTS } },
        { "delivery.email.attemptCount": { $exists: false }, attemptCount: { $lt: MAX_ATTEMPTS } },
        { "delivery.email.attemptCount": { $exists: false }, attemptCount: { $exists: false } }
      ] },
      { $or: [
        { status: { $in: ["pending", "partial"] }, "delivery.email.status": { $in: ["pending", null] }, "delivery.email.nextAttemptAt": { $lte: now } },
        { status: { $in: ["pending", "partial"] }, "delivery.email.status": { $in: ["pending", null] }, "delivery.email.nextAttemptAt": null, nextAttemptAt: { $lte: now } },
        { status: { $in: ["pending", "partial"] }, "delivery.email.status": { $in: ["pending", null] }, "delivery.email.nextAttemptAt": null, nextAttemptAt: null },
        { status: "processing", "delivery.email.status": { $in: ["processing", null] }, "delivery.email.leaseUntil": { $lte: now } },
        { status: "processing", "delivery.email.status": { $in: ["processing", null] }, "delivery.email.leaseUntil": null, leaseUntil: { $lte: now } },
        { status: "processing", "delivery.email.status": { $in: ["processing", null] }, "delivery.email.leaseUntil": null, leaseUntil: null, updatedAt: { $lte: new Date(now.getTime() - LEASE_MS) } }
      ] }
    ]
  };
}
async function processOne() {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const item = await Reminder.findOneAndUpdate(eligibleQuery(now), {
    $set: { status: "processing", "delivery.email.status": "processing", "delivery.email.leaseUntil": leaseUntil, leaseUntil },
    $inc: { "delivery.email.attemptCount": 1, attemptCount: 1 }
  }, { sort: { scheduledFor: 1 }, new: true });
  if (!item) return null;
  const attempt = item.delivery.email.attemptCount;
  const owner = { _id: item._id, "delivery.email.status": "processing", "delivery.email.attemptCount": attempt, "delivery.email.leaseUntil": leaseUntil };
  try {
    const messageId = await sendEmail(item);
    const sentAt = new Date();
    const result = await Reminder.updateOne(owner, {
      $set: { status: "sent", sentAt, messageId, "delivery.email.status": "sent", "delivery.email.sentAt": sentAt, "delivery.email.messageId": messageId, "delivery.email.lastError": "", lastError: "" },
      $unset: { "delivery.email.leaseUntil": 1, "delivery.email.nextAttemptAt": 1, leaseUntil: 1, nextAttemptAt: 1 }
    });
    if (!result.modifiedCount) console.error("[Reminder] SMTP accepted but status update not confirmed", String(item._id));
    console.info("[Reminder SMTP accepted]", { id: String(item._id), attempt, recorded: Boolean(result.modifiedCount) });
    return { outcome: "accepted", recorded: Boolean(result.modifiedCount) };
  } catch (err) {
    const exhausted = attempt >= MAX_ATTEMPTS;
    const message = errorText(err);
    const next = exhausted ? null : retryDate(attempt);
    console.error("[Reminder SMTP error]", { id: String(item._id), attempt, message });
    const updated = await Reminder.updateOne(owner, {
      $set: { status: exhausted ? "failed" : "pending", lastError: message, nextAttemptAt: next, "delivery.email.status": exhausted ? "failed" : "pending", "delivery.email.lastError": message, "delivery.email.nextAttemptAt": next },
      $unset: { "delivery.email.leaseUntil": 1, leaseUntil: 1 }
    });
    if (!updated.modifiedCount) console.error("[Reminder] Error state update not confirmed", String(item._id));
    return { outcome: exhausted ? "failed" : "retry" };
  }
}
async function diagnostics(now) {
  const [total, due, pendingDue, future, sent, failed, processing, eligible] = await Promise.all([
    Reminder.countDocuments({}),
    Reminder.countDocuments({ scheduledFor: { $lte: now } }),
    Reminder.countDocuments({ scheduledFor: { $lte: now }, status: "pending" }),
    Reminder.countDocuments({ scheduledFor: { $gt: now }, status: "pending" }),
    Reminder.countDocuments({ status: "sent" }),
    Reminder.countDocuments({ status: "failed" }),
    Reminder.countDocuments({ status: "processing" }),
    Reminder.countDocuments(eligibleQuery(now))
  ]);
  return { total, due, pendingDue, future, sent, failed, processing, eligible };
}
async function run(req, res) {
  res.set("Cache-Control", "no-store, private");
  if (!authorized(req)) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ success: false, message: "Database unavailable" });
  try {
    const results = { accepted: 0, retry: 0, failed: 0, unrecorded: 0 };
    let processed = 0;
    for (let i = 0; i < MAX_BATCH; i++) {
      const result = await processOne();
      if (!result) break;
      processed++;
      results[result.outcome]++;
      if (result.outcome === "accepted" && !result.recorded) results.unrecorded++;
    }
    const checkedAt = new Date();
    const counts = await diagnostics(checkedAt);
    return res.json({ success: true, processed, ...results, checkedAt: checkedAt.toISOString(), diagnostics: counts, note: "accepted means SMTP accepted the message, not confirmed inbox delivery. Diagnostics count documents in this worker's MongoDB database." });
  } catch (err) {
    console.error("[Reminder worker]", errorText(err));
    return res.status(500).json({ success: false, message: "Reminder worker failed. Inspect Vercel logs." });
  }
}
router.get("/run", run);
router.post("/run", run);
module.exports = router;
