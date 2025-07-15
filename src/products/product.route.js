const express = require('express');
const { 
    postAProduct, 
    getAllProducts, 
    getSingleProduct, 
    updateProduct, 
    deleteAProduct,
    updateProductPriceByPercentage
} = require('./product.controller');

const verifyAdminToken = require('../middleware/verifyAdminToken');

const router = express.Router();

// ✅ POST - Create a product
router.post("/create-product", verifyAdminToken, postAProduct);

// ✅ GET - All products
router.get("/", getAllProducts);

// ✅ GET - Single product by ID
router.get("/:id", getSingleProduct);

// ✅ PUT - Update a product by ID
router.put("/edit/:id", verifyAdminToken, updateProduct);

// ✅ DELETE - Delete a product by ID
router.delete("/:id", verifyAdminToken, deleteAProduct);

// ✅ PUT - Update product price based on percentage
router.put("/update-price/:id", verifyAdminToken, updateProductPriceByPercentage);

module.exports = router;
