// utils/cloudinary.js
const cloudinary = require("cloudinary").v2;

// ✅ Ensure required ENV vars are present
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn("⚠️ Cloudinary config missing: check .env for CLOUDINARY_* variables");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Log status (without exposing secrets)
console.log("☁️ Cloudinary connected:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "❌ missing",
  api_key: process.env.CLOUDINARY_API_KEY ? "✅ provided" : "❌ missing",
});

module.exports = cloudinary;
