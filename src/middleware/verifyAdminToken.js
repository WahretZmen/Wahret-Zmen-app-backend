// src/middleware/verifyAdminToken.js
// ============================================================================
// Middleware: verifyAdminToken
// ----------------------------------------------------------------------------
// Purpose:
//   • Verify a JWT issued by the admin login (POST /api/auth/admin).
//   • Ensure the subject exists in the shared "users" collection.
//   • Enforce role === "admin" (case-insensitive).
//
// Contract (Frontend):
//   • Send header: Authorization: Bearer <token>
//   • We also accept cookie tokens (future-proof), but header is preferred.
//
// Env Requirements:
//   • JWT_SECRET_KEY  ← MUST match the key used in admin.route.js when signing.
//
// Responses:
//   • 401 for auth failures (missing/invalid/expired token, user not found)
//   • 403 for non-admin users
// ============================================================================

"use strict";

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Both Admin and User models point to the same Mongo collection: "users".
// Using the User model is sufficient to read any document in that collection.
const User = require("../users/user.model");

// IMPORTANT: Use the SAME secret used to sign in admin.route.js
const JWT_SECRET = process.env.JWT_SECRET_KEY;

module.exports = async function verifyAdminToken(req, res, next) {
  try {
    // Fail fast if server misconfigured
    if (!JWT_SECRET) {
      console.error("[verifyAdminToken] Missing env JWT_SECRET_KEY");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // 1) Extract token (prefer Authorization header; allow cookie fallback)
    const authHeader = req.headers.authorization || req.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const headerToken = match ? match[1] : null;

    // Optional cookie fallback for future compatibility
    const cookieToken =
      (req.cookies && (req.cookies.token || req.cookies.access_token)) || null;

    const token = headerToken || cookieToken;
    if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    // 2) Verify token
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET); // same key as signer
    } catch (err) {
      const expired = err?.name === "TokenExpiredError";
      return res
        .status(401)
        .json({ message: expired ? "Token expired" : "Invalid token" });
    }

    // 3) Validate payload & resolve user from the shared "users" collection
    const userId = payload.id || payload._id || payload.sub;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 4) Enforce admin role (accept string or array, case-insensitive)
    const role = (user.role && String(user.role)) || "";
    const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];
    const isAdmin =
      role.toLowerCase() === "admin" ||
      roles.some((r) => r.toLowerCase() === "admin");

    if (!isAdmin) {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    // 5) Attach auth context for downstream handlers
    req.user = user;
    req.auth = { id: String(user._id), role: "admin" };

    return next();
  } catch (err) {
    console.error("❌ [verifyAdminToken] Unexpected error:", err);
    return res.status(401).json({ message: "Authentication failed" });
  }
};
