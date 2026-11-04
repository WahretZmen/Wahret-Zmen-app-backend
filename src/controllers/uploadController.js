"use strict";
const multer = require("multer");
const cloudinary = require("../utils/cloudinary");

const MAX_FILE_SIZE_MB = 15;
const BRAND_NAME_AR = "وهرة زمان";
const BRAND_NAME_EN = "Wahret Zmen";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"]);

const sanitizeFileName = (value = "") =>
  String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-")
    .replace(/-+/g, "-").replace(/\.(jpe?g|png|webp|avif)$/i, "")
    .trim().toLowerCase().slice(0, 90) || `wahret-zmen-${Date.now()}`;
const sanitizeText = (value = "", max = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const pickText = (value = "") => {
  if (!value) return "";
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "object") return sanitizeText(value.ar || value.fr || value.en || value.name || "");
  return sanitizeText(String(value));
};
const normalizeCategoryLabel = (value = "") => {
  const raw = pickText(value).toLowerCase();
  if (["men", "homme", "hommes", "رجال"].includes(raw)) return "رجال";
  if (["women", "femme", "femmes", "نساء"].includes(raw)) return "نساء";
  if (["children", "child", "kids", "kid", "enfant", "enfants", "أطفال"].includes(raw)) return "أطفال";
  return pickText(value);
};
const normalizeSubCategoryLabel = (value = "") => {
  const raw = pickText(value).toLowerCase();
  const labels = {
    accessories: "إكسسوارات", accessoire: "إكسسوارات", accessoires: "إكسسوارات",
    costume: "بدلة", vest: "صدريّة", gilet: "صدريّة",
    mens_abaya: "عباية رجالي", "mens abaya": "عباية رجالي", "abaya homme": "عباية رجالي",
    jebba: "جبّة", jebbah: "جبّة", keswa: "كسوة",
  };
  return labels[raw] || pickText(value);
};
const buildSeoAlt = ({ seoFileName, alt, title, category, subCategory, embroidery }) =>
  sanitizeText(alt) || [sanitizeText(title, 80), normalizeCategoryLabel(category),
    normalizeSubCategoryLabel(subCategory), pickText(embroidery), BRAND_NAME_AR].filter(Boolean).join(" - ") ||
  `${seoFileName.replace(/-/g, " ")} - ${BRAND_NAME_AR}`;
const buildSeoCaption = ({ title, category, subCategory, embroidery }) =>
  sanitizeText([sanitizeText(title, 80), normalizeCategoryLabel(category),
    normalizeSubCategoryLabel(subCategory), pickText(embroidery), BRAND_NAME_EN].filter(Boolean).join(" - "));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP and AVIF images are allowed"));
    }
    cb(null, true);
  },
});

const uploadImage = async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "No image file provided" });
    const status = cloudinary.getCloudinaryStatus();

if (!status.configured) {
  return res.status(503).json({
    success: false,
    message: "Image upload service temporarily unavailable",
  });
}{
      console.error("[Image upload] Cloudinary client is not configured");
      return res.status(503).json({ message: "Cloudinary is not configured" });
    }
    const seoFileName = sanitizeFileName(req.file.originalname);
    const productId = sanitizeFileName(String(req.body?.productId || ""));
    const assetFolder = req.body?.productId ? `wahret-zmen/products/${productId}` : "wahret-zmen/products";
    const metadata = {
      seoFileName,
      title: req.body?.title || req.body?.productTitle,
      category: req.body?.category,
      subCategory: req.body?.subCategory,
      embroidery: req.body?.embroideryCategory,
    };
    const alt = buildSeoAlt({ ...metadata, alt: req.body?.alt });
    const caption = sanitizeText(req.body?.caption) || buildSeoCaption(metadata);
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: assetFolder,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
        filename_override: seoFileName,
        overwrite: false,
        // Store original supported format; automatic delivery transformations
        // can be applied to the returned URL separately.
        context: { alt, caption },
        tags: ["wahret-zmen", "product-image", productId || "generic-product"],
      }, (error, uploaded) => {
        if (error) return reject(error);
        if (!uploaded?.secure_url) return reject(new Error("Cloudinary returned no secure_url"));
        resolve(uploaded);
      });
      stream.on("error", reject);
      stream.end(req.file.buffer);
    });
    return res.status(200).json({
      image: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      originalName: req.file.originalname,
      seoFileName, alt, caption,
    });
  } catch (error) {
    console.error("[Image upload] Cloudinary failure:", error);
    const status = Number(error?.http_code);
    return res.status(status >= 400 && status < 500 ? 400 : 502).json({
      message: "Image upload failed on Cloudinary",
      error: String(error?.message || error),
    });
  }
};
module.exports = { uploadImage, upload };
