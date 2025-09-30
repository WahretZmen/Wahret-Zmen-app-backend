const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("./admin.model");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET_KEY;

function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// POST /api/auth/admin (plain text)
router.post("/", async (req, res) => {
  try {
    let { username, password } = req.body || {};
    username = (username || "").trim();
    password = (password || "").trim();

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    // Case-insensitive username OR email, role: admin, plain password match
    const query = {
      role: "admin",
      password, // plain text, as requested
      $or: [
        { username: { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
        { email:    { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
      ],
    };

    const admin = await Admin.findOne(query).lean();

    if (!admin) {
      // Minimal debug (safe): helps confirm which DB/collection is used
      console.warn("Auth/admin no match", {
        tried: username,
        collection: "users",
        db: process.env.DB_URL?.split("@")?.pop(), // tail of uri (debug hint)
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
      admin: { id: admin._id, username: admin.username, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error("❌ Admin login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
