"use strict";
const express = require("express");
const { sendContactEmail } = require("./contact-form.controller.js");
const router = express.Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestStore = new Map();
function contactRateLimiter(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();
  const now = Date.now();
  const clientIP = req.ip || req.socket?.remoteAddress || "unknown";
  let record = requestStore.get(clientIP);
  if (!record || now >= record.resetAt) {
    record = { count: 0, resetAt: now + WINDOW_MS };
    requestStore.set(clientIP, record);
  }
  if (record.count >= MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ success: false, message: "Vous avez envoyé trop de messages. Veuillez patienter quelques minutes.", retryAfter });
  }
  record.count += 1;
  if (requestStore.size > 10000) {
    for (const [key, value] of requestStore) if (now >= value.resetAt) requestStore.delete(key);
  }
  return next();
}
router.post("/", contactRateLimiter, sendContactEmail);
module.exports = router;
