// src/middleware/verifyAdminToken.js
const jwt = require("jsonwebtoken");
const User = require("../users/user.model"); // Adjust path if needed

const JWT_SECRET = process.env.JWT_SECRET_KEY;

/**
 * 🔐 verifyAdminToken Middleware
 * ---------------------------------------------------
 * - Extracts JWT from Authorization header ("Bearer <token>")
 * - Verifies token with secret
 * - Checks if user exists and has role "admin"
 * - Attaches user to req.user if valid
 * - Rejects request if invalid or unauthorized
 */
const verifyAdminToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ message: "Access Denied. No token provided" });
    }

    // Verify token and decode payload
    const decoded = jwt.verify(token, JWT_SECRET);

    // Lookup user by ID from token
    const user = await User.findById(decoded.id);

    // Ensure user exists and has admin role
    if (!user || user.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Access Denied. Admins only" });
    }

    // Attach user to request for downstream usage
    req.user = user;
    next();
  } catch (err) {
    console.error("❌ Error in verifyAdminToken middleware:", err);
    return res
      .status(403)
      .json({ message: "Invalid or expired token" });
  }
};

module.exports = verifyAdminToken;
