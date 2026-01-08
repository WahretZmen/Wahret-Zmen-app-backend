const multer = require("multer");
const cloudinary = require("../utils/cloudinary");

// ✅ Use memoryStorage so file is in memory buffer (not disk)
const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const buffer = req.file.buffer;

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "wahret-zmen", resource_type: "image" },
        (error, result) => {
          if (result) {
            resolve(result);
          } else {
            reject(error);
          }
        }
      );
      stream.end(buffer);
    });

    res.status(200).json({ image: result.secure_url });
  } catch (error) {
    console.error("❌ Upload failed:", error);
    res.status(500).json({ message: "Image upload failed", error: error.message });
  }
};

module.exports = { uploadImage, upload };
