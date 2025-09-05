// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const app = express();
const port = process.env.PORT || 5000;

/* =============================================================================
   🛡️ SECURITY + PERFORMANCE BASELINE
   - Helmet with COOP relaxed for OAuth popups
   - COEP disabled (avoids popup isolation)
   - Compression + basic request logging
============================================================================= */
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false,
    // This is an API—CSP not strictly necessary; skip to avoid surprises.
    contentSecurityPolicy: false,
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/* =============================================================================
   🔒 CORS CONFIGURATION
   - Allows common local dev ports
   - Allows your Vercel prod domain + any *.vercel.app preview
   - Allows no-origin tools (Postman/cURL)
   - You can add additional domains via FRONTEND_URLS (comma-separated)
============================================================================= */
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
  if (!origin) return true;                 // No Origin header (Postman/cURL)
  if (allowedOrigins.has(origin)) return true;
  if (vercelWildcard.test(origin)) return true; // any *.vercel.app preview
  return false;
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) cb(null, true);
    else {
      console.error(`🚫 [CORS] Blocked origin: ${origin}`);
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
};

// Handle preflight quickly
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

/* =============================================================================
   📦 BODY PARSERS / STATIC
============================================================================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =============================================================================
   🚦 RATE LIMITERS (tune as needed)
============================================================================= */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // per IP per 15 minutes for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", authLimiter);

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
============================================================================= */
app.use("/api/products", require("./src/products/product.route"));
app.use("/api/orders", require("./src/orders/order.route"));
app.use("/api/auth", require("./src/users/user.route"));
app.use("/api/admin", require("./src/stats/admin.stats"));
app.use("/api", require("./src/routes/uploadRoutes"));
app.use("/api/contact", require("./src/contact-form/contact-form.route"));

/* =============================================================================
   🗄️ DATABASE CONNECTION (MongoDB)
   - Retries on failure every 5 seconds
============================================================================= */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URL, {
      // You can add options if your Mongoose version requires them
    });
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
app.get("/api/health", (_req, res) => {
  res
    .status(200)
    .json({ status: "ok", message: "Wahret Zmen backend alive 🚀" });
});

app.get("/", (_req, res) => {
  res.send("Wahret Zmen Boutique Server is running!");
});

/* =============================================================================
   🧯 ERROR HANDLERS
============================================================================= */
app.use((err, _req, res, _next) => {
  // CORS errors or other thrown errors hit here
  const isCors = err?.message?.includes("CORS");
  if (isCors) {
    return res.status(403).json({ message: "CORS: origin not allowed" });
  }
  console.error("💥 [Server Error]:", err);
  res.status(500).json({ message: "Internal server error" });
});

// 404 fallback (only for non-matched API routes)
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/* =============================================================================
   ▶️ START SERVER
============================================================================= */
app.listen(port, () => {
  console.log(`💻 [Server] Running on port ${port}`);
});
