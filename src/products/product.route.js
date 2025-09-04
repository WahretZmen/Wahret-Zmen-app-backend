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

/* =============================================================================
   🛒 Product Routes
   - Create / Read / Update / Delete
   - Admin-only routes protected with verifyAdminToken
============================================================================= */

// ✅ CREATE a new product
router.post("/create-product", verifyAdminToken, postAProduct);

// ✅ READ all products
router.get("/", getAllProducts);

// ✅ READ a single product by ID
router.get("/:id", getSingleProduct);

// ✅ UPDATE a product by ID
router.put("/edit/:id", verifyAdminToken, updateProduct);

// ✅ DELETE a product by ID
router.delete("/:id", verifyAdminToken, deleteAProduct);

// ✅ UPDATE product price by percentage (utility)
router.put("/update-price/:id", verifyAdminToken, updateProductPriceByPercentage);

module.exports = router;
