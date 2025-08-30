// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

/* ----------------------------- CORS ALLOWLIST ----------------------------- */
/**
 * ✅ Allow common local dev ports (5173/5174/4173/4174)
 * ✅ Allow your Vercel prod domain
 * ✅ Allow *any* Vercel preview URL (*.vercel.app)
 * ✅ Allow no-origin tools (Postman/cURL)
 * 👉 Add more via FRONTEND_URLS env, comma-separated
 */
const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://localhost:4174",
  "https://wahret-zmen-app-frontend-flame.vercel.app",
];

const envAllowed = (process.env.FRONTEND_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowed, ...envAllowed]);
const vercelWildcard = /\.vercel\.app$/i;

const isOriginAllowed = (origin) => {
  if (!origin) return true; // e.g., Postman/cURL or same-origin SSR
  if (allowedOrigins.has(origin)) return true;
  if (vercelWildcard.test(origin)) return true; // any *.vercel.app
  return false;
};

// Keep responses cache-friendly for CDN with varying Origin
app.use((_, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) cb(null, true);
    else {
      console.error(`❌ CORS blocked origin: ${origin}`);
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
};
app.use(cors(corsOptions));

// Fast-path preflight (some proxies are picky)
app.options("*", cors(corsOptions));

/* ------------------------------- MIDDLEWARE ------------------------------- */
app.set("trust proxy", 1); // Vercel/Proxies
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ------------------------------ STATIC FILES ------------------------------ */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* --------------------------- OPTIONAL PRELOADERS -------------------------- */
try {
  const { preload } = require("./translators/xenova");
  preload().catch(console.error);
} catch (_) {
  // optional module—ignore if missing
}

/* --------------------------------- ROUTES -------------------------------- */
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Wahret Zmen backend alive 🚀" });
});

app.get("/", (req, res) => {
  res.send("Wahret Zmen Boutique Server is running!");
});

// API routes (keep after parsers)
app.use("/api/products", require("./src/products/product.route"));
app.use("/api/orders", require("./src/orders/order.route"));
app.use("/api/auth", require("./src/users/user.route"));
app.use("/api/admin", require("./src/stats/admin.stats"));
app.use("/api", require("./src/routes/uploadRoutes"));
app.use("/api/contact", require("./src/contact-form/contact-form.route"));

/* -------------------------- ERROR-HANDLING LAYER -------------------------- */
// Unified error handler (helps avoid opaque 500s without CORS headers)
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err?.message || err);
  // Ensure CORS headers still present on failures
  if (isOriginAllowed(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  }
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Internal Server Error" });
});

/* ------------------------------ MONGODB INIT ------------------------------ */
const connectDB = async () => {
  try {
    // Use DB_URL in your Vercel env. Example: mongodb+srv://...
    await mongoose.connect(process.env.DB_URL);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error?.message || error);
    // Retry after 5s (useful on cold starts / transient network)
    setTimeout(connectDB, 5000);
  }
};
connectDB();

/* ------------------------ START (LOCAL) / EXPORT (CI) --------------------- */
/**
 * On Vercel serverless you should export the app (no app.listen).
 * Locally (npm run dev) we listen on a port.
 */
const runningOnVercel = !!process.env.VERCEL;

if (!runningOnVercel) {
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
  });
} else {
  module.exports = app; // CommonJS export for Vercel
}
