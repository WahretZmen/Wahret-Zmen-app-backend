const express = require('express');
const User = require('./user.model');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET_KEY;

// ✅ Admin login
router.post("/admin", async (req, res) => {
  const { username, password } = req.body;

  try {
    const adminUser = await User.findOne({ username });
    if (!adminUser) {
      return res.status(404).send({ message: "Admin not found!" });
    }

    const isPasswordValid = adminUser.password === password; // Ideally use bcrypt
    if (!isPasswordValid) {
      return res.status(401).send({ message: "Invalid password!" });
    }

    const token = jwt.sign(
      { id: adminUser._id, username: adminUser.username, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      message: "Authentication successful",
      token,
      user: {
        username: adminUser.username,
        role: adminUser.role,
      },
    });

  } catch (error) {
    console.error("Failed to login as admin", error);
    return res.status(500).send({ message: "Failed to login as admin" });
  }
});

// ✅ Get total users (MongoDB only)
router.get("/admin/users/count", async (req, res) => {
  try {
    const mongoUsersCount = await User.countDocuments();

    return res.status(200).json({
      totalUsers: mongoUsersCount,
    });
  } catch (error) {
    console.error("Error counting users:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
