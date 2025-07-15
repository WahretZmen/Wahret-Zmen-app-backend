const express = require("express");
const Order = require("../orders/order.model");
const Product = require("../products/product.model");
const User = require("../users/user.model.js");
const firebaseAdmin = require("../utils/firebaseAdmin");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalUsersMongo = await User.countDocuments();

    const totalSalesAgg = await Order.aggregate([
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]);
    const totalSales = totalSalesAgg[0]?.totalSales || 0;

    const trendingProductsAgg = await Product.aggregate([
      { $match: { trending: true } },
      { $count: "trendingProductsCount" },
    ]);
    const trendingProducts = trendingProductsAgg[0]?.trendingProductsCount || 0;

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

    // ✅ Get Firebase users (safe fallback if Firebase fails)
    let totalUsersFirebase = 0;
    try {
      const firebaseUsers = await firebaseAdmin.auth().listUsers(10000);
      totalUsersFirebase = firebaseUsers.users.length;
    } catch (firebaseError) {
      console.error("❌ Firebase Admin Error:", firebaseError.message);
    }

    const totalUsers = totalUsersMongo + totalUsersFirebase;

    console.log("✅ Admin Stats:", {
      totalOrders,
      totalProducts,
      totalSales,
      totalUsersMongo,
      totalUsersFirebase,
      trendingProducts,
      totalUsers,
    });

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
