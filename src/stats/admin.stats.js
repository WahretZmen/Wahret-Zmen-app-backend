// src/stats/admin.stats.js
const express = require("express");

// ✅ Safe model resolver (works with CJS exports OR ESM default exports)
const pickModel = (m) => (m && m.default ? m.default : m);

const Order = pickModel(require("../orders/order.model"));
const Product = pickModel(require("../products/product.model"));

const router = express.Router();

/* ---------------- Helpers ---------------- */

function buildMatch(from, to) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  return match;
}

// ✅ Safe numeric conversion in aggregation (handles strings/nulls)
const toNumber = (field) => ({
  $convert: { input: field, to: "double", onError: 0, onNull: 0 },
});

/* ---------------- Route ---------------- */

router.get("/", async (req, res) => {
  try {
    // Prevent browser / proxy caching so every 5 sec gets fresh data
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");

    const { from, to } = req.query;
    const match = buildMatch(from, to);

    const totalProductsPromise = Product.countDocuments({}).exec();
    const trendingProductsPromise = Product.countDocuments({ trending: true }).exec();

    // ✅ Count orders
    const totalOrdersPromise = Order.countDocuments(match).exec();

    // ✅ Total sales
    const totalSalesAggPromise = Order.aggregate(
      [
        Object.keys(match).length ? { $match: match } : null,
        {
          $group: {
            _id: null,
            totalSales: { $sum: toNumber("$totalPrice") },
          },
        },
      ].filter(Boolean)
    ).exec();

    // ✅ Monthly sales + monthly orders
    const monthlySalesPromise = Order.aggregate(
      [
        Object.keys(match).length ? { $match: match } : null,
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m",
                date: "$createdAt",
              },
            },
            totalSales: { $sum: toNumber("$totalPrice") },
            totalOrders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ].filter(Boolean)
    ).exec();

    const [
      totalProducts,
      trendingProducts,
      totalOrders,
      totalSalesAgg,
      monthlySales,
    ] = await Promise.all([
      totalProductsPromise,
      trendingProductsPromise,
      totalOrdersPromise,
      totalSalesAggPromise,
      monthlySalesPromise,
    ]);

    const totalSales = totalSalesAgg?.[0]?.totalSales || 0;

    return res.status(200).json({
      totalProducts,
      totalOrders,
      totalSales,
      monthlySales,
      trendingProducts,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching admin stats:", error);
    return res.status(500).json({ message: "Failed to fetch admin stats" });
  }
});

module.exports = router;