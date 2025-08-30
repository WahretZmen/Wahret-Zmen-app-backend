// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

/**
 * ✅ Allow common local dev ports (5173/5174/4173/4174) + anything you set in FRONTEND_URLS
 * ✅ Allow your Vercel prod domain and ALL Vercel preview URLs (*.vercel.app)
 * ✅ Allow no-origin tools (Postman/cURL)
 */
const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://localhost:4174",
  "https://wahret-zmen-app-frontend-flame.vercel.app",
];

const envAllowed =
  (process.env.FRONTEND_URLS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowed, ...envAllowed]);

// wildcard checks (preview deployments, etc.)
const vercelWildcard = /\.vercel\.app$/i;

// Helper: is this origin allowed?
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Postman/cURL (no Origin header)
  if (allowedOrigins.has(origin)) return true;
  if (vercelWildcard.test(origin)) return true;
  return false;
};

// ✅ CORS setup (with preflight)
const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, true);
    } else {
      console.error(`❌ CORS blocked origin: ${origin}`);
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle all preflights

// ✅ Body parsers (large payloads)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ✅ Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ (Optional) preload any heavy libs ONCE at startup, not per-request
try {
  const { preload } = require("./translators/xenova");
  preload().catch(console.error);
} catch (e) {
  // If module is optional, ignore if missing
}

// ✅ API Routes
app.use("/api/products", require("./src/products/product.route"));
app.use("/api/orders", require("./src/orders/order.route"));
app.use("/api/auth", require("./src/users/user.route"));
app.use("/api/admin", require("./src/stats/admin.stats"));
app.use("/api", require("./src/routes/uploadRoutes"));
app.use("/api/contact", require("./src/contact-form/contact-form.route"));

// ✅ MongoDB connection (remove deprecated options)
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error?.message || error);
    setTimeout(connectDB, 5000); // retry on failure
  }
};
connectDB();

// ✅ Simple health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Wahret Zmen backend alive 🚀" });
});

// ✅ Root
app.get("/", (req, res) => {
  res.send("Wahret Zmen Boutique Server is running!");
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
