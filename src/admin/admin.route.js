const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("./admin.model");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET_KEY;

// Escape regex meta chars
function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// POST /api/auth/admin  (plain text login)
router.post("/", async (req, res) => {
  try {
    let { username, password } = req.body || {};
    username = (username || "").trim();
    password = (password || "").trim();

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    // Allow login with username OR email (case-insensitive), require role=admin and plain password match
    const query = {
      role: "admin",
      password, // plain text comparison by your request
      $or: [
        { username: { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
        { email:    { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
      ],
    };

    const admin = await Admin.findOne(query).lean();

    if (!admin) {
      // Minimal, safe debug to help you see why it failed
      console.warn("Admin login failed (no match):", {
        tried: username,
        // DO NOT log password value here
        collection: "users",
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin", username: admin.username, email: admin.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

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
    console.error("❌ Admin login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
