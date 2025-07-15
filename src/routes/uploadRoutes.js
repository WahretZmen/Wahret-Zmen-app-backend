const express = require("express");
const router = express.Router();

// 🔄 Import the memory-based multer and controller
const { uploadImage, upload } = require("../controllers/uploadController");

// 🖼️ Route: POST /api/upload
router.post("/upload", upload.single("image"), uploadImage);

module.exports = router;
