
"use strict";

/* ============================================================
   WAHRET ZMEN BY SABRI
   ADMIN JWT AUTHENTICATION MIDDLEWARE

   Node.js / Express / Vercel
   Public Am Hssin routes remain independent.

   File:
   src/middleware/verifyAdminToken.js
============================================================ */

const jwt = require("jsonwebtoken");

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getJwtSecret() {
  return clean(
    process.env.JWT_SECRET_KEY ||
    process.env.JWT_SECRET ||
    process.env.JWT_SECRET_TOKEN
  );
}

function getBearerToken(req) {
  const header = clean(req.headers.authorization);

  const match = /^Bearer\s+(.+)$/i.exec(header);

  return match ? clean(match[1]) : "";
}

function getCookieToken(req) {
  if (!req.cookies || typeof req.cookies !== "object") {
    return "";
  }

  return clean(
    req.cookies.adminToken ||
    req.cookies.admin_token ||
    req.cookies.token
  );
}

function authError(res, status, code, message) {
  res.setHeader("Cache-Control", "no-store");

  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function verifyAdminToken(req, res, next) {
  try {
    const secret = getJwtSecret();

    if (!secret) {
      console.error(
        "[Admin Auth] JWT secret is not configured"
      );

      return authError(
        res,
        503,
        "ADMIN_AUTH_UNAVAILABLE",
        "Admin authentication is temporarily unavailable."
      );
    }

    const token =
      getBearerToken(req) ||
      getCookieToken(req);

    if (!token) {
      return authError(
        res,
        401,
        "ADMIN_TOKEN_MISSING",
        "Admin authentication is required."
      );
    }

    let decoded;

    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        clockTolerance: 5
      });
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return authError(
          res,
          401,
          "ADMIN_TOKEN_EXPIRED",
          "Your admin session has expired. Please log in again."
        );
      }

      if (error.name === "NotBeforeError") {
        return authError(
          res,
          401,
          "ADMIN_TOKEN_NOT_ACTIVE",
          "Admin session is not active yet."
        );
      }

      return authError(
        res,
        401,
        "ADMIN_TOKEN_INVALID",
        "Invalid admin authentication token."
      );
    }

    if (
      !decoded ||
      typeof decoded !== "object" ||
      decoded.role !== "admin"
    ) {
      return authError(
        res,
        403,
        "ADMIN_ACCESS_DENIED",
        "Administrator access is required."
      );
    }

    const adminId = clean(decoded.id || decoded._id);

    if (!adminId) {
      return authError(
        res,
        401,
        "ADMIN_ID_MISSING",
        "Invalid administrator identity."
      );
    }

    const admin = {
      id: adminId,
      _id: adminId,
      role: "admin",
      username: clean(decoded.username),
      email: clean(decoded.email)
    };

    // Compatibility with existing backend controllers.
    req.admin = admin;
    req.adminId = adminId;
    req.user = admin;
    req.auth = {
      adminId,
      role: "admin"
    };

    return next();
  } catch (error) {
    console.error(
      "[Admin Auth] Unexpected error:",
      error.message
    );

    return authError(
      res,
      500,
      "ADMIN_AUTH_ERROR",
      "Unable to verify administrator authentication."
    );
  }
}

module.exports = verifyAdminToken;
module.exports.verifyAdminToken = verifyAdminToken;
module.exports.default = verifyAdminToken;
