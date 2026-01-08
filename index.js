/// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const verifyAdminToken = require("./src/middleware/verifyAdminToken");

const app = express();
const port = process.env.PORT || 5000;

/* =============================================================================
   🔒 CORS CONFIGURATION
   - Allows common local dev ports
   - Allows your Vercel prod domain and all preview URLs (*.vercel.app)
   - Allows no-origin tools (Postman/cURL)
============================================================================== */
const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://localhost:4174",
  "https://wahret-zmen-app-frontend-aw75.vercel.app",
];

const envAllowed = (process.env.FRONTEND_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowed, ...envAllowed]);

const vercelWildcard = /\.vercel\.app$/i;

const isOriginAllowed = (origin) => {
  if (!origin) return true; // No Origin header (Postman/cURL)
  if (allowedOrigins.has(origin)) return true;
  if (vercelWildcard.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, true);
    } else {
      console.error(`🚫 [CORS] Blocked origin: ${origin}`);
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =============================================================================
   📦 BODY PARSERS / STATIC
============================================================================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =============================================================================
   ⚡ OPTIONAL PRELOADS
============================================================================= */
try {
  const { preload } = require("./translators/xenova");
  preload().catch(console.error);
} catch (e) {
  // Ignore if xenova is not installed
}

/* =============================================================================
   🛣️ API ROUTES
   - Users auth (Firebase/regular users) stays under /api/auth
   - Admin auth (PLAIN TEXT in Mongo) is mounted at /api/auth/admin
   - Admin stats are protected by verifyAdminToken
============================================================================= */
app.use("/api/products", require("./src/products/product.route"));
app.use("/api/orders", require("./src/orders/order.route"));

/** Users (keep your existing user routes) */
app.use("/api/auth", require("./src/users/user.route"));

/** Admin (plain-text login) — expects route.post("/") in ./src/admin/admin.route.js
 *  Final endpoint: POST /api/auth/admin
 */
app.use("/api/auth/admin", require("./src/admin/admin.route"));

/** Admin stats (protected) */
app.use("/api/admin", verifyAdminToken, require("./src/stats/admin.stats"));

/** Uploads + contact */
app.use("/api", require("./src/routes/uploadRoutes"));
app.use("/api/contact", require("./src/contact-form/contact-form.route"));

/* =============================================================================
   🗄️ DATABASE CONNECTION (MongoDB)
   - Retries on failure every 5 seconds
============================================================================= */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("🟢 [MongoDB] Connected successfully ✅");
  } catch (error) {
    console.error("🔴 [MongoDB] Connection error ❌:", error?.message || error);
    setTimeout(connectDB, 5000);
  }
};
connectDB();

/* =============================================================================
   ✅ HEALTHCHECK / ROOT
============================================================================= */
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Wahret Zmen backend alive 🚀" });
});

app.get("/", (req, res) => {
  res.send("Wahret Zmen Boutique Server is running!");
});

/* =============================================================================
   ▶️ START SERVER
============================================================================= */
app.listen(port, () => {
  console.log(`💻 [Server] Running on port ${port}`);
});
