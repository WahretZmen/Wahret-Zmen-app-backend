
import express from "express";
import verifyAdminToken from "../middleware/verifyAdminToken.js";

import {
  postAProduct,
  getAllProducts,
  getAdminProductsLite,
  getSingleProduct,
  updateProduct,
  deleteAProduct,
  updateProductPriceByPercentage,
} from "./product.controller.js";

import {
  getLatestMarketingDraft,
} from "../ai/marketingDraft.controller.js";

const router = express.Router();

// ============================================================
// ADMIN PRODUCT OPERATIONS
// ============================================================

router.post(
  "/create-product",
  verifyAdminToken,
  postAProduct
);

router.get(
  "/admin-lite",
  verifyAdminToken,
  getAdminProductsLite
);

// ============================================================
// AI MARKETING DRAFT — ADMIN ONLY
// ============================================================

router.get(
  "/admin/marketing-draft/:productId",
  verifyAdminToken,
  getLatestMarketingDraft
);

// ============================================================
// PUBLIC PRODUCT ROUTES
// ============================================================

router.get("/", getAllProducts);

router.get("/:productId", getSingleProduct);

// ============================================================
// ADMIN PRODUCT UPDATES
// ============================================================

router.put(
  "/edit/:productId",
  verifyAdminToken,
  updateProduct
);

router.delete(
  "/:productId",
  verifyAdminToken,
  deleteAProduct
);

router.put(
  "/update-price/:productId",
  verifyAdminToken,
  updateProductPriceByPercentage
);

export default router;
