// routes/user.route.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("./user.model");

const router = express.Router();

// --- Config & Guards ---------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET_KEY;
if (!JWT_SECRET) {
  // Crash early in dev; in prod you may prefer a loud log + 500 responses.
  console.warn("⚠️  JWT_SECRET_KEY is not set. Set it in your environment variables.");
}

// Optional cookie auth toggles (kept flexible for your frontend)
const USE_COOKIE_AUTH = process.env.USE_COOKIE_AUTH === "true";
const COOKIE_NAME = process.env.JWT_COOKIE_NAME || "auth_token";
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false"; // default true on prod
const COOKIE_SAME_SITE = process.env.COOKIE_SAMESITE || "Lax";

// --- Helpers -----------------------------------------------------------------
function normalizeStr(s) {
  return typeof s === "string" ? s.trim() : "";
}

function sendAuthToken(res, token) {
  // Always return token in JSON (backwards compatible with your frontend)
  // Optionally also set httpOnly cookie if USE_COOKIE_AUTH=true
  if (USE_COOKIE_AUTH) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      // 30 days
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
  return res.json({ token });
}

// Minimal admin gate using the same JWT
function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, raw] = header.split(" "); // "Bearer <token>"
    const token = raw || (USE_COOKIE_AUTH ? req.cookies?.[COOKIE_NAME] : null);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.role || String(payload.role).toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// --- Routes ------------------------------------------------------------------

/* =============================================================================
   🔑 ADMIN LOGIN
   Body: { username, password }
============================================================================= */
router.post("/admin", async (req, res) => {
  try {
    const username = normalizeStr(req.body?.username);
    const password = normalizeStr(req.body?.password);

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfiguration." });
    }

    // If your schema has password select:false, add .select('+password')
    const adminUser = await User.findOne({ username /* case-sensitive by default */ }).select(
      "+password"
    );

    // Avoid leaking which field failed
    if (!adminUser) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isAdmin = String(adminUser.role || "").toLowerCase() === "admin";
    if (!isAdmin) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const ok = await bcrypt.compare(password, adminUser.password || "");
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { id: String(adminUser._id), username: adminUser.username, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      message: "Authentication successful",
      user: { username: adminUser.username, role: adminUser.role },
      ...(USE_COOKIE_AUTH ? {} : { token }), // if cookie mode, omit token field (still returned by sendAuthToken below if you use it)
    });
  } catch (error) {
    console.error("❌ Admin login error:", error);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
});

/* =============================================================================
   👥 GET TOTAL USERS (MongoDB only)
   - Protected: admin only
============================================================================= */
router.get("/admin/users/count", requireAdmin, async (_req, res) => {
  try {
    const mongoUsersCount = await User.countDocuments();
    return res.status(200).json({ totalUsers: mongoUsersCount });
  } catch (error) {
    console.error("❌ Error counting users:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
