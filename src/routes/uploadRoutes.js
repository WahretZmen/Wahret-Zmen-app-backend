"use strict";
const express = require("express");
const multer = require("multer");
const { uploadImage, upload } = require("../controllers/uploadController");
const router = express.Router();

// Preserve existing index.js mount: app.use('/api', uploadRoutes).
// IMPORTANT: Protect this endpoint with your existing admin JWT middleware at the mount.
router.post("/upload", (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    console.warn("[Image upload] Rejected file:", error.message);
    return res.status(tooLarge ? 413 : 400).json({
      success: false, code: tooLarge ? "IMAGE_TOO_LARGE" : "IMAGE_INVALID",
      message: tooLarge ? "Image trop volumineuse (maximum 15 Mo)." : "Image non acceptée.",
      error: String(error.message || error),
    });
  });
}, uploadImage);
module.exports = router;
