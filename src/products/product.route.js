// src/products/product.route.js
const express = require("express");
const {
  postAProduct,
  getAllProducts,
  getSingleProduct,
  updateProduct,
  deleteAProduct,
  updateProductPriceByPercentage,
} = require("./product.controller");
const verifyAdminToken = require("../middleware/verifyAdminToken");

const router = express.Router();

/**
 * POST /api/products/create-product
 * Admin: create a product (colors support images[]).
 */
router.post("/create-product", verifyAdminToken, postAProduct);

/**
 * GET /api/products/
 * Public: list products (newest first).
 */
router.get("/", getAllProducts);

/**
 * GET /api/products/:id
 * Public: get one product by id.
 */
router.get("/:id", getSingleProduct);

/**
 * PUT /api/products/edit/:id
 * Admin: update a product.
 */
router.put("/edit/:id", verifyAdminToken, updateProduct);

/**
 * DELETE /api/products/:id
 * Admin: delete a product.
 */
router.delete("/:id", verifyAdminToken, deleteAProduct);

/**
 * PUT /api/products/update-price/:id
 * Admin: compute discounted price from oldPrice and percentage (no persist).
 * Body: { percentage: number }
 */
router.put("/update-price/:id", verifyAdminToken, updateProductPriceByPercentage);

module.exports = router;
