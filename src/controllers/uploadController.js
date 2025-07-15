const cloudinary = require("../utils/cloudinary");
const multer = require("multer");

// ✅ Use memory storage (recommended for Vercel/serverless environments)
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @desc Upload an image to Cloudinary via memory buffer
 * @route POST /api/upload
 * @access Public
 */
const uploadImage = async (req, res) => {
  try {
    // 🛑 Validate file presence
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // 📤 Upload buffer stream to Cloudinary
    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "image",
            folder: "wahret-zmen", // Optional: change folder if needed
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        stream.end(buffer);
      });
    };

    const result = await streamUpload(req.file.buffer);

    return res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      image: result.secure_url,
    });
  } catch (error) {
    console.error("❌ Image upload failed:", error);
    return res.status(500).json({
      success: false,
      message: "Image upload failed",
      error: error.message,
    });
  }
};

module.exports = { uploadImage, upload };
