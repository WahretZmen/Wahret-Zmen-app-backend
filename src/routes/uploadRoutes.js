// src/routes/uploadRoutes.js
const express = require("express");
const router = express.Router();

const { uploadImage, upload } = require("../controllers/uploadController");

/* =============================================================================
   📤 Upload Routes
   - Single image upload via Cloudinary
   - Key must be `image` in FormData (frontend: formData.append("image", file))
============================================================================= */

// ✅ POST /api/upload
router.post("/upload", upload.single("image"), uploadImage);

module.exports = router;

