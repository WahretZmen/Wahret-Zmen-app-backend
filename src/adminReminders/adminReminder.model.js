"use strict";
const mongoose = require("mongoose");
const emailDelivery = new mongoose.Schema({
  status: { type: String, enum: ["pending", "processing", "sent", "failed", "disabled"], default: "pending" },
  attemptCount: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  messageId: { type: String, default: "" },
  lastError: { type: String, default: "" }
}, { _id: false });
const schema = new mongoose.Schema({
  adminId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  details: { type: String, default: "", maxlength: 2000 },
  scheduledFor: { type: Date, required: true, index: true },
  timezone: { type: String, default: "Africa/Tunis", enum: ["Africa/Tunis"] },
  status: { type: String, enum: ["pending", "processing", "sent", "failed", "cancelled", "partial"], default: "pending", index: true },
  recipientEmail: { type: String, required: true, trim: true, lowercase: true },
  delivery: { email: { type: emailDelivery, default: () => ({ status: "pending" }) } },
  // Retained for compatibility with existing documents and dashboards.
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  lastError: { type: String, default: "" },
  messageId: { type: String, default: "" }
}, { timestamps: true, strict: true });
schema.index({ status: 1, scheduledFor: 1, "delivery.email.nextAttemptAt": 1 });
module.exports = mongoose.models.WZAdminReminder || mongoose.model("WZAdminReminder", schema);
