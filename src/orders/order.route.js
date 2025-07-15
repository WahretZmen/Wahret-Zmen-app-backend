const express = require("express");
const {
  createAOrder,
  getAllOrders,
  getOrderByEmail,
  getOrderById,
  updateOrder,
  deleteOrder,
  sendOrderNotification,
  removeProductFromOrder, // ✅ make sure this is defined in controller
} = require("./order.controller");


const router = express.Router();

// 🟢 This must be BEFORE router.patch("/:id", ...)
router.patch("/remove-product", removeProductFromOrder); // ✅ FIXED order

router.get("/", getAllOrders);
router.get("/email/:email", getOrderByEmail);
router.get("/:id", getOrderById);
router.patch("/:id", updateOrder);
router.delete("/:id", deleteOrder);
router.post("/notify", sendOrderNotification);
router.post("/", createAOrder);

module.exports = router;
