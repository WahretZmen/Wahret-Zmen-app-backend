const express = require("express");
const router = express.Router();
const { uploadImage, upload } = require("../controllers/uploadController");

// ✅ The key must be "image" to match frontend FormData
router.post("/upload", upload.single("image"), uploadImage);

module.exports = router;
