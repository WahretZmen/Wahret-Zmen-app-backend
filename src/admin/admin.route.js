// src/admin/admin.route.js
const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("./admin.model");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET_KEY;

/* =============================================================================
   🧩 Helper: Escape regex to safely match usernames/emails
============================================================================= */
function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =============================================================================
   🔐 POST /api/auth/admin
   - Plain text login for admin panel
   - Matches username OR email (case-insensitive)
   - Verifies role = "admin"
   - Issues JWT valid for 1 hour
============================================================================= */
router.post("/", async (req, res) => {
  try {
    let { username, password } = req.body || {};
    username = (username || "").trim();
    password = (password || "").trim();

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    // Match admin by username or email, plain-text password
    const query = {
      role: "admin",
      password, // plain text as requested
      $or: [
        { username: { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
        { email: { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
      ],
    };

    const admin = await Admin.findOne(query).lean();

    if (!admin) {
      console.warn("⚠️ [Admin Login] No match found", {
        tried: username,
        collection: "admins",
        db: process.env.DB_URL?.split("@")?.pop(), // Debug hint
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: admin._id,
        role: "admin",
        username: admin.username,
        email: admin.email,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Success
    return res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("❌ [Admin Login Error]:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
