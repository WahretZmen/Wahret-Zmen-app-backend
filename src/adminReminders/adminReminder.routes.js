"use strict";
// Mount behind verifyAdminToken and requireDatabase.
const { Router } = require("express");
const mongoose = require("mongoose");
const Reminder = require("./adminReminder.model.js");
const router = Router();
const adminId = req => String(req.user?._id || req.user?.id || req.admin?.id || "");
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const emailAddress = () => String(process.env.REMINDER_ADMIN_EMAIL || "contact@wahretzmen.com").trim().toLowerCase();
const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
function parseUTC(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const canonical = value.includes(".") ? value.replace(/\.(\d{1,3})Z$/, (_, ms) => `.${ms.padEnd(3, "0")}Z`) : value.replace("Z", ".000Z");
  return date.toISOString() === canonical ? date : null;
}
const validFuture = date => date instanceof Date && date.getTime() > Date.now() && date.getTime() <= Date.now() + 366 * 86400000;
router.use((req, res, next) => { res.set("Cache-Control", "no-store, private"); next(); });
router.get("/", async (req, res) => {
  const id = adminId(req); if (!id) return fail(res, 401, "Admin identity unavailable");
  try { return res.json({ success: true, reminders: await Reminder.find({ adminId: id }).sort({ scheduledFor: -1 }).limit(200).lean() }); }
  catch (err) { console.error("[Reminders list]", err); return fail(res, 500, "Unable to load reminders"); }
});
router.get("/:id", async (req, res) => {
  const id = adminId(req); if (!id) return fail(res, 401, "Admin identity unavailable");
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid reminder ID");
  try { const reminder = await Reminder.findOne({ _id: req.params.id, adminId: id }).lean(); return reminder ? res.json({ success: true, reminder }) : fail(res, 404, "Reminder not found"); }
  catch (err) { console.error("[Reminders get]", err); return fail(res, 500, "Unable to load reminder"); }
});
router.post("/", async (req, res) => {
  const id = adminId(req); if (!id) return fail(res, 401, "Admin identity unavailable");
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const details = typeof req.body?.details === "string" ? req.body.details.trim() : "";
  const when = parseUTC(req.body?.scheduledFor);
  if (!title || title.length > 180 || details.length > 2000 || !validFuture(when)) return fail(res, 400, "Valid title and future UTC timestamp required (within one year)");
  if (req.body?.timezone && req.body.timezone !== "Africa/Tunis") return fail(res, 400, "Unsupported timezone");
  if (!smtpReady()) return fail(res, 503, "Reminder email service is unavailable");
  const recipientEmail = emailAddress(); if (!emailValid(recipientEmail)) return fail(res, 503, "Reminder recipient email is invalid");
  try {
    const reminder = await Reminder.create({ adminId: id, title, details, scheduledFor: when, timezone: "Africa/Tunis", recipientEmail, status: "pending", attemptCount: 0, nextAttemptAt: null, delivery: { email: { status: "pending", attemptCount: 0, nextAttemptAt: null } } });
    console.info("[Reminder created]", { id: String(reminder._id), scheduledFor: reminder.scheduledFor.toISOString(), status: reminder.status });
    return res.status(201).json({ success: true, reminder, notice: "Rappel enregistré. L'envoi SMTP sera tenté après l'échéance par le worker; réception non garantie." });
  } catch (err) { console.error("[Reminders create]", err); return fail(res, 500, "Unable to create reminder"); }
});
router.patch("/:id", async (req, res) => {
  const id = adminId(req); if (!id) return fail(res, 401, "Admin identity unavailable");
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid reminder ID");
  const updates = {};
  if (req.body?.title !== undefined) { if (typeof req.body.title !== "string" || !req.body.title.trim() || req.body.title.trim().length > 180) return fail(res, 400, "Invalid title"); updates.title = req.body.title.trim(); }
  if (req.body?.details !== undefined) { if (typeof req.body.details !== "string" || req.body.details.length > 2000) return fail(res, 400, "Invalid details"); updates.details = req.body.details.trim(); }
  if (req.body?.scheduledFor !== undefined) { const when = parseUTC(req.body.scheduledFor); if (!validFuture(when)) return fail(res, 400, "Invalid future UTC date"); updates.scheduledFor = when; }
  if (req.body?.timezone !== undefined && req.body.timezone !== "Africa/Tunis") return fail(res, 400, "Unsupported timezone");
  if (!Object.keys(updates).length) return fail(res, 400, "No updates provided");
  try {
    const reminder = await Reminder.findOneAndUpdate({ _id: req.params.id, adminId: id, status: "pending", scheduledFor: { $gt: new Date() }, "delivery.email.status": "pending", "delivery.email.attemptCount": 0 }, { $set: updates }, { new: true, runValidators: true });
    return reminder ? res.json({ success: true, reminder }) : fail(res, 409, "Reminder cannot be edited after processing begins or its scheduled time has passed");
  } catch (err) { console.error("[Reminders edit]", err); return fail(res, 500, "Unable to edit reminder"); }
});
router.post("/:id/cancel", async (req, res) => {
  const id = adminId(req); if (!id) return fail(res, 401, "Admin identity unavailable");
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid reminder ID");
  try {
    const reminder = await Reminder.findOneAndUpdate({ _id: req.params.id, adminId: id, status: "pending", "delivery.email.status": "pending", "delivery.email.attemptCount": 0 }, { $set: { status: "cancelled" } }, { new: true });
    return reminder ? res.json({ success: true, reminder }) : fail(res, 409, "Reminder cannot be cancelled after processing begins");
  } catch (err) { console.error("[Reminders cancel]", err); return fail(res, 500, "Unable to cancel reminder"); }
});
module.exports = router;
