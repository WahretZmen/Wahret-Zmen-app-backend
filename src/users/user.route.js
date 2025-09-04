const express = require("express");
const User = require("./user.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET_KEY;

/* =============================================================================
   🔑 ADMIN LOGIN
============================================================================= */
router.post("/admin", async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Find admin by username
    const adminUser = await User.findOne({ username });
    if (!adminUser) {
      return res.status(404).json({ message: "❌ Admin not found" });
    }

    // 2. Check role
    if (adminUser.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "⛔ Access denied. Not an admin." });
    }

    // 3. Verify password (bcrypt compare)
    const isPasswordValid = await bcrypt.compare(password, adminUser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "⚠️ Invalid password" });
    }

    // 4. Sign JWT
    const token = jwt.sign(
      { id: adminUser._id, username: adminUser.username, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // 5. Respond success
    return res.status(200).json({
      message: "✅ Authentication successful",
      token,
      user: {
        username: adminUser.username,
        role: adminUser.role,
      },
    });
  } catch (error) {
    console.error("❌ Failed to login as admin:", error.message);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
});

/* =============================================================================
   👥 GET TOTAL USERS (MongoDB only)
============================================================================= */
router.get("/admin/users/count", async (_req, res) => {
  try {
    const mongoUsersCount = await User.countDocuments();
    return res.status(200).json({ totalUsers: mongoUsersCount });
  } catch (error) {
    console.error("❌ Error counting users:", error.message);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
