/// routes/user.route.js
const express = require("express");
const bcrypt = require("bcrypt");
const User = require("./user.model");

const router = express.Router();

/**
 * 🌱 USER ROUTES (no admin here)
 * ----------------------------------------------------------
 * This router is mounted at: /api/auth
 * Use it for normal user operations (login, register, etc.).
 * Admin login is handled separately in:
 *   - /api/auth/admin  (plain-text login, src/admin/admin.route.js)
 *   - /api/admin/*     (stats protected by verifyAdminToken)
 */

// --- Helpers -----------------------------------------------------------------
function normalizeStr(s) {
  return typeof s === "string" ? s.trim() : "";
}

// Example: user registration (bcrypt)
router.post("/register", async (req, res) => {
  try {
    const username = normalizeStr(req.body?.username);
    const email = normalizeStr(req.body?.email);
    const password = normalizeStr(req.body?.password);

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashed, role: "user" });
    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("❌ User registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Example: user login (bcrypt)
router.post("/login", async (req, res) => {
  try {
    const email = normalizeStr(req.body?.email);
    const password = normalizeStr(req.body?.password);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password, user.password || "");
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // You can return a token here if needed, or just success.
    res.json({
      message: "Login successful",
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("❌ User login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
