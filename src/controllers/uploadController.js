"use strict";
const multer = require("multer");
const cloudinary = require("../utils/cloudinary");

const MAX_FILE_SIZE_MB = 15;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"]);
const cleanText = (value, max = 180) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const pickText = (value) => typeof value === "object" && value !== null
  ? cleanText(value.ar || value.fr || value.en || value.name || "") : cleanText(value);
const safeName = (value) => String(value ?? "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\.(jpe?g|png|webp|avif)$/i, "")
  .replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-")
  .replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  .toLowerCase().slice(0, 90) || `wahret-zmen-${Date.now()}`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Formats acceptés : JPG, PNG, WEBP, AVIF."));
    }
    cb(null, true);
  },
});

async function uploadImage(req, res) {
  if (!req.file?.buffer) {
    return res.status(400).json({ success: false, message: "Aucune image reçue (champ attendu : image)." });
  }
  const status = cloudinary.getCloudinaryStatus();
  if (!status.configured || !cloudinary.configureCloudinary()) {
    console.error("[Image upload] Cloudinary configuration missing:", status.missing.join(", "));
    return res.status(503).json({
      success: false, code: "CLOUDINARY_NOT_CONFIGURED",
      message: "Cloudinary n'est pas configuré sur le serveur. Vérifiez les variables Vercel.",
    });
  }
  try {
    const seoFileName = safeName(req.file.originalname);
    const rawProductId = cleanText(req.body?.productId, 100);
    const productId = rawProductId ? safeName(rawProductId) : "";
    const folder = productId ? `wahret-zmen/products/${productId}` : "wahret-zmen/products";
    const title = pickText(req.body?.title || req.body?.productTitle);
    const category = pickText(req.body?.category);
    const subCategory = pickText(req.body?.subCategory);
    const embroidery = pickText(req.body?.embroideryCategory);
    const alt = cleanText(req.body?.alt) || [title, category, subCategory, embroidery, "وهرة زمان"].filter(Boolean).join(" - ") || seoFileName;
    const caption = cleanText(req.body?.caption) || [title, category, subCategory, embroidery, "Wahret Zmen"].filter(Boolean).join(" - ");
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder, resource_type: "image", use_filename: true, unique_filename: true,
        filename_override: seoFileName, overwrite: false,
        context: { alt, caption },
        tags: ["wahret-zmen", "product-image", productId || "generic-product"],
      }, (error, uploaded) => {
        if (error) return reject(error);
        if (!uploaded?.secure_url) return reject(new Error("Cloudinary n'a pas retourné d'URL sécurisée."));
        resolve(uploaded);
      });
      stream.on("error", reject);
      stream.end(req.file.buffer);
    });
    return res.status(200).json({
      success: true, image: result.secure_url, public_id: result.public_id,
      width: result.width, height: result.height, format: result.format,
      bytes: result.bytes, originalName: req.file.originalname,
      seoFileName, alt, caption,
    });
  } catch (error) {
    const code = Number(error?.http_code);
    console.error("[Image upload] Cloudinary upload failed:", { status: code || null, message: error?.message });
    return res.status(code >= 400 && code < 500 ? 400 : 502).json({
      success: false, code: "CLOUDINARY_UPLOAD_FAILED",
      message: "Échec du téléversement de l'image sur Cloudinary.",
      error: String(error?.message || error),
    });
  }
}
module.exports = { uploadImage, upload };
