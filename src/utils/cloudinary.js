
"use strict";

const path = require("path");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
  override: false,
});

const REQUIRED_KEYS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

function getCloudinaryStatus() {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = String(process.env[key] || "").trim();

    return (
      !value ||
      /[<>\r\n]/.test(value) ||
      /^(YOUR_|REPLACE_|PLACEHOLDER|undefined|null)/i.test(value)
    );
  });

  return {
    configured: missing.length === 0,
    missing,
  };
}

function configureCloudinary() {
  const status = getCloudinaryStatus();

  if (!status.configured) {
    console.error(
      "[Cloudinary] Missing or invalid environment variables:",
      status.missing.join(", ")
    );

    return false;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
    secure: true,
  });

  console.log("[Cloudinary] Client configured");
  return true;
}

configureCloudinary();

module.exports = cloudinary;
module.exports.getCloudinaryStatus = getCloudinaryStatus;
module.exports.configureCloudinary = configureCloudinary;
