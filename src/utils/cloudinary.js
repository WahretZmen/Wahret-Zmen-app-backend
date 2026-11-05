"use strict";
const path = require("node:path");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;

// Local development only. Vercel/Render inject variables through their dashboards.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false, quiet: true });
const KEYS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
function getCloudinaryStatus() {
  const missing = KEYS.filter((key) => {
    const value = String(process.env[key] || "").trim();
    return !value || /[<>\r\n]/.test(value) || /^(YOUR_|REPLACE_|PLACEHOLDER|undefined|null)/i.test(value);
  });
  return { configured: missing.length === 0, missing };
}
function configureCloudinary() {
  const status = getCloudinaryStatus();
  if (!status.configured) {
    console.error("[Cloudinary] Missing or invalid variables:", status.missing.join(", "));
    return false;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
    secure: true,
  });
  return true;
}
configureCloudinary();
module.exports = cloudinary;
module.exports.getCloudinaryStatus = getCloudinaryStatus;
module.exports.configureCloudinary = configureCloudinary;
