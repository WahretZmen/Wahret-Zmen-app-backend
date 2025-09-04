// src/stats/admin.stats.js
const express = require("express");
const Order = require("../orders/order.model");
const Product = require("../products/product.model");
const User = require("../users/user.model.js");
const firebaseAdmin = require("../utils/firebaseAdmin");

const router = express.Router();

/* =============================================================================
   📊 Admin Stats Endpoint
   GET /api/admin
   ---------------------------------------------------------------------------
   Aggregates:
   - totalOrders           : # of orders
   - totalProducts         : # of products
   - totalSales            : Σ totalPrice across all orders
   - trendingProducts      : # of products with { trending: true }
   - monthlySales          : [{ _id: 'YYYY-MM', totalSales, totalOrders }, ...]
   - totalUsers            : Mongo users + Firebase users
============================================================================= */
router.get("/", async (_req, res) => {
  try {
    // Basic counts from Mongo
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalUsersMongo = await User.countDocuments();

    // Sum of all order totals
    const totalSalesAgg = await Order.aggregate([
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]);
    const totalSales = totalSalesAgg[0]?.totalSales || 0;

    // Count trending products
    const trendingProductsAgg = await Product.aggregate([
      { $match: { trending: true } },
      { $count: "trendingProductsCount" },
    ]);
    const trendingProducts = trendingProductsAgg[0]?.trendingProductsCount || 0;

    // Monthly sales & orders (YYYY-MM)
    const monthlySales = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          totalSales: { $sum: "$totalPrice" },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Firebase users (safe fallback if Firebase fails)
    let totalUsersFirebase = 0;
    try {
      const firebaseUsers = await firebaseAdmin.auth().listUsers(10000);
      totalUsersFirebase = firebaseUsers.users.length;
    } catch (firebaseError) {
      console.error("❌ Firebase Admin Error:", firebaseError.message);
    }

    // Combined user count
    const totalUsers = totalUsersMongo + totalUsersFirebase;

    // Debug log (non-sensitive)
    console.log("✅ Admin Stats:", {
      totalOrders,
      totalProducts,
      totalSales,
      totalUsersMongo,
      totalUsersFirebase,
      trendingProducts,
      totalUsers,
    });

    // Response
    res.status(200).json({
      totalOrders,
      totalSales,
      trendingProducts,
      totalProducts,
      monthlySales,
      totalUsers,
    });
  } catch (error) {
    console.error("❌ Error fetching admin stats:", error);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
});

module.exports = router;
