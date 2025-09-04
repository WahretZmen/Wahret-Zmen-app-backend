// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

/* =============================================================================
   🔒 CORS CONFIGURATION
   - Allows common local dev ports
   - Allows your Vercel prod domain and all preview URLs (*.vercel.app)
   - Allows no-origin tools (Postman/cURL)
============================================================================= */
const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://localhost:4174",
  "https://wahret-zmen-app-frontend-flame.vercel.app",
];

// Optional: allow additional origins via env FRONTEND_URLS="https://a.com,https://b.com"
const envAllowed = (process.env.FRONTEND_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowed, ...envAllowed]);

// Wildcard for any Vercel preview/prod subdomain
const vercelWildcard = /\.vercel\.app$/i;

// Check if origin is allowed
const isOriginAllowed = (origin) => {
  if (!origin) return true;             // No Origin header (Postman/cURL)
  if (allowedOrigins.has(origin)) return true;
  if (vercelWildcard.test(origin)) return true;
  return false;
};

// Final CORS options (with preflight handling)
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
app.options("*", cors(corsOptions)); // Handle all preflights

/* =============================================================================
   🧱 BODY PARSERS / STATIC
============================================================================= */
// Large JSON/form payloads (e.g., image uploads)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve uploaded assets
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =============================================================================
   🚀 OPTIONAL PRELOADS
   - Preload heavy libs once at startup (if present)
============================================================================= */
try {
  const { preload } = require("./translators/xenova");
  preload().catch(console.error);
} catch (e) {
  // Module is optional; ignore if not installed
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
    await mongoose.connect(process.env.DB_URL);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error?.message || error);
    setTimeout(connectDB, 5000); // Retry on failure
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
  console.log(`🚀 Server running on port ${port}`);
});
