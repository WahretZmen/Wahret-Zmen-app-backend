// src/stats/admin.stats.js
// ============================================================================
// Admin Stats Router
// ----------------------------------------------------------------------------
// Purpose:
//   • Provide consolidated KPIs for the admin dashboard.
//   • Returns counts and aggregates from MongoDB + Firebase Authentication.
//
// Security:
//   • Protected by verifyAdminToken middleware (JWT-based, admin role).
//
// Response shape:
//   {
//     totalOrders: number,
//     totalSales: number,              // Σ(Order.totalPrice)
//     trendingProducts: number,        // count of { trending: true }
//     totalProducts: number,
//     monthlySales: [                  // aggregated by YYYY-MM
//       { _id: "2025-01", totalSales: 1234.56, totalOrders: 12 }, ...
//     ],
//     totalUsers: number               // Mongo users + Firebase users
//   }
//
// Notes:
//   • Supports large Firebase user bases via pagination.
//   • Optional query params `from` and `to` (ISO date strings) to time-bound
//     order-based statistics (totalSales, totalOrders, monthlySales).
//     - If omitted, stats are computed for all time.
//   • Uses lean Mongo aggregations for efficiency.
// ============================================================================

const express = require("express");
const Order = require("../orders/order.model");
const Product = require("../products/product.model");
const User = require("../users/user.model.js");
const firebaseAdmin = require("../utils/firebaseAdmin");


const router = express.Router();

/* -----------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

/**
 * Count all Firebase users, paginating through the listUsers API.
 * Falls back to 0 if Firebase Admin SDK is not configured or errors out.
 */
async function countAllFirebaseUsers() {
  if (!firebaseAdmin?.auth) return 0;

  try {
    let nextPageToken = undefined;
    let total = 0;

    do {
      // listUsers returns up to 1000 per page. We loop until no token remains.
      const page = await firebaseAdmin.auth().listUsers(1000, nextPageToken);
      total += (page.users?.length || 0);
      nextPageToken = page.pageToken;
    } while (nextPageToken);

    return total;
  } catch (err) {
    console.error("❌ Firebase Admin: listUsers failed:", err?.message || err);
    return 0;
  }
}

/**
 * Build an optional $match stage for date filtering on Order.createdAt.
 * Accepts `from` and/or `to` query params as ISO-8601 date strings.
 */
function buildDateMatch(from, to) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  return Object.keys(match).length ? [{ $match: match }] : [];
}

/* -----------------------------------------------------------------------------
 * GET /api/admin
 * Admin-only consolidated stats.
 * Optional query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * --------------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;

    // -----------------------------
    // Users (Mongo + Firebase)
    // -----------------------------
    const totalUsersMongoPromise = User.countDocuments().exec();
    const totalUsersFirebasePromise = countAllFirebaseUsers();

    // -----------------------------
    // Products
    // -----------------------------
    const totalProductsPromise = Product.countDocuments().exec();

    // Count trending products quickly via aggregation (or .countDocuments({ trending: true }))
    const trendingProductsPromise = Product.countDocuments({ trending: true }).exec();

    // -----------------------------
    // Orders (with optional date filters)
    // -----------------------------
    const dateMatchStage = buildDateMatch(from, to);

    // Total orders (respecting date range)
    const totalOrdersPromise = Order.aggregate([
      ...dateMatchStage,
      { $count: "count" },
    ]).exec();

    // Total sales (Σ totalPrice) (respecting date range)
    const totalSalesAggPromise = Order.aggregate([
      ...dateMatchStage,
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]).exec();

    // Monthly sales (YYYY-MM) (respecting date range)
    const monthlySalesPromise = Order.aggregate([
      ...dateMatchStage,
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          totalSales: { $sum: "$totalPrice" },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    // Await in parallel
    const [
      totalUsersMongo,
      totalUsersFirebase,
      totalProducts,
      trendingProducts,
      totalOrdersAgg,
      totalSalesAgg,
      monthlySales,
    ] = await Promise.all([
      totalUsersMongoPromise,
      totalUsersFirebasePromise,
      totalProductsPromise,
      trendingProductsPromise,
      totalOrdersPromise,
      totalSalesAggPromise,
      monthlySalesPromise,
    ]);

    const totalOrders = totalOrdersAgg?.[0]?.count || 0;
    const totalSales = totalSalesAgg?.[0]?.totalSales || 0;
    const totalUsers = (totalUsersMongo || 0) + (totalUsersFirebase || 0);

    // Non-sensitive debug log
    console.log("✅ Admin Stats", {
      totalOrders,
      totalProducts,
      totalSales,
      totalUsersMongo,
      totalUsersFirebase,
      trendingProducts,
      filteredFrom: from || null,
      filteredTo: to || null,
    });

    // Response
    return res.status(200).json({
      totalOrders,
      totalSales,
      trendingProducts,
      totalProducts,
      monthlySales,
      totalUsers,
    });
  } catch (error) {
    console.error("❌ Error fetching admin stats:", error);
    return res.status(500).json({ message: "Failed to fetch admin stats" });
  }
});

module.exports = router;
