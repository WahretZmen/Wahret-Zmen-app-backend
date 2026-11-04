
"use strict";

// backend/src/admin/admin.route.js

const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("./admin.model.js");

const router = express.Router();

const envStr = (key) =>
  typeof process.env[key] === "string"
    ? process.env[key].trim()
    : "";

const getJwtSecret = () =>
  envStr("JWT_SECRET_KEY") ||
  envStr("JWT_SECRET") ||
  envStr("JWT_SECRET_TOKEN");

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

router.post("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const secret = getJwtSecret();

    if (!secret) {
      console.error(
        "[Admin Login] Missing JWT secret"
      );

      return res.status(503).json({
        success: false,
        message: "Authentication service unavailable",
      });
    }

    const username =
      typeof req.body?.username === "string"
        ? req.body.username.trim()
        : "";

    const password =
      typeof req.body?.password === "string"
        ? req.body.password
        : "";

    if (
      !username ||
      !password ||
      username.length > 254 ||
      password.length > 1024
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const escaped = escapeRegex(username);

    const admin = await Admin.findOne({
      role: "admin",
      $or: [
        {
          username: {
            $regex: `^${escaped}$`,
            $options: "i",
          },
        },
        {
          email: {
            $regex: `^${escaped}$`,
            $options: "i",
          },
        },
      ],
    })
      .select("+password")
      .exec();

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (admin.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

    if (
      typeof admin.comparePassword !== "function"
    ) {
      console.error(
        "[Admin Login] comparePassword method missing"
      );

      return res.status(503).json({
        success: false,
        message: "Authentication configuration error",
      });
    }

    const passwordValid = await admin.comparePassword(
      password
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        id: String(admin._id),
        role: "admin",
        username: admin.username,
        email: admin.email,
      },
      secret,
      {
        algorithm: "HS256",
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      success: true,
      token,
      expiresIn: 3600,
      admin: {
        id: String(admin._id),
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error(
      "[Admin Login Error]",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
});

module.exports = router;
