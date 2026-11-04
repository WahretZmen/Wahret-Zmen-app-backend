const express = require("express");
const multer = require("multer");

const router = express.Router();

const verifyAdminTokenModule = require(
  "../middleware/verifyAdminToken"
);

const verifyAdminToken =
  verifyAdminTokenModule.default ||
  verifyAdminTokenModule;

const {
  getPublicBlogPosts,
  getPublicBlogPostBySlug,
  getAdminBlogPosts,
  createBlogPost,
  updateBlogPost,
  toggleBlogPostStatus,
  deleteBlogPost,
  uploadBlogImage,
} = require("./blog.controller");

/* =========================================================
   MULTER CONFIGURATION
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Format non autorisé. Utilisez JPG, PNG, WEBP ou AVIF."
        )
      );
    }

    callback(null, true);
  },
});

/* =========================================================
   MULTER MIDDLEWARE
========================================================= */

const uploadBlogImageMiddleware = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    console.error("🔴 [Blog Multer]", error);

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message:
            "L’image dépasse la taille maximale de 10 Mo.",
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Impossible de traiter l’image.",
    });
  });
};

/* =========================================================
   PUBLIC ROUTES
========================================================= */

router.get(
  "/",
  getPublicBlogPosts
);

router.get(
  "/slug/:slug",
  getPublicBlogPostBySlug
);

/* =========================================================
   ADMIN — GET ALL POSTS
========================================================= */

router.get(
  "/admin/all",
  verifyAdminToken,
  getAdminBlogPosts
);

/* =========================================================
   ADMIN — UPLOAD BLOG IMAGE
========================================================= */

router.post(
  "/admin/upload-image",
  verifyAdminToken,
  uploadBlogImageMiddleware,
  uploadBlogImage
);

/* =========================================================
   ADMIN — CREATE
========================================================= */

router.post(
  "/admin/create",
  verifyAdminToken,
  createBlogPost
);

/* =========================================================
   ADMIN — UPDATE
========================================================= */

router.put(
  "/admin/update/:id",
  verifyAdminToken,
  updateBlogPost
);

/* =========================================================
   ADMIN — TOGGLE STATUS
========================================================= */

router.patch(
  "/admin/toggle-status/:id",
  verifyAdminToken,
  toggleBlogPostStatus
);

/* =========================================================
   ADMIN — DELETE
========================================================= */

router.delete(
  "/admin/delete/:id",
  verifyAdminToken,
  deleteBlogPost
);

module.exports = router;