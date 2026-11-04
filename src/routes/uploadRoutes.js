"use strict";
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { uploadImage, upload } = require("../controllers/uploadController");

// Keep the existing mount in index.js: app.use("/api", uploadRoutes).
router.post("/upload", (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    console.error("[Image upload] Multer failure:", error);
    const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      message: tooLarge ? "Image trop volumineuse (maximum 15 Mo)." : "Image non acceptée.",
      error: String(error.message || error),
    });
  });
}, uploadImage);
module.exports = router;
