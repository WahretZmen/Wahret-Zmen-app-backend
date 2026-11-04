
"use strict";

/* ============================================================
   WAHRET ZMEN BY SABRI
   NODE.JS / EXPRESS / MONGODB / VERCEL

   PUBLIC AM HSSIN AI
   PRIVATE ADMIN AI
   ADMIN AUTHENTICATION
   EMAIL REMINDERS
   CRON WORKER
============================================================ */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const path = require("node:path");

const app = express();

const PORT = Number(process.env.PORT || 5000);
const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);

/* ============================================================
   1. CORS
============================================================ */

const normalizeOrigin = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const allowedOrigins = new Set([
  "https://wahretzmen.com",
  "https://www.wahretzmen.com",
  "https://wahret-zmen-app-frontend-eta.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://127.0.0.1:4173",

  ...String(process.env.FRONTEND_URLS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean),
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);

  return (
    allowedOrigins.has(normalized) ||
    /^https:\/\/wahret-zmen-app-frontend-[a-z0-9-]+\.vercel\.app$/i.test(
      normalized
    )
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      const error = new Error("CORS origin denied");
      error.status = 403;

      return callback(error);
    },

    credentials: true,

    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
      "Cache-Control",
      "Pragma",
      "X-Internal-AI-Key",
    ],

    exposedHeaders: [
      "Content-Type",
      "Content-Length",
      "X-AI-Request-ID",
    ],

    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);

/* ============================================================
   2. BODY PARSERS
============================================================ */

app.use(cookieParser());

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

/* ============================================================
   3. SECURITY HEADERS
============================================================ */

app.use((req, res, next) => {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");

    res.setHeader(
      "X-Robots-Tag",
      "noindex, nofollow"
    );
  }

  next();
});

/* ============================================================
   4. REQUEST LOGGING
============================================================ */

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    if (res.statusCode >= 400 || !IS_PRODUCTION) {
      console.log("[HTTP]", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  next();
});

/* ============================================================
   5. MONGODB CONNECTION
============================================================ */

const DB_URL = String(
  process.env.DB_URL ||
  process.env.MONGODB_URL ||
  ""
).trim();

mongoose.set("bufferCommands", false);

let mongoPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!DB_URL) {
    throw new Error("DB_URL is missing");
  }

  if (
    !DB_URL.startsWith("mongodb://") &&
    !DB_URL.startsWith("mongodb+srv://")
  ) {
    throw new Error("Invalid MongoDB URI");
  }

  if (mongoPromise) {
    return mongoPromise;
  }

  mongoPromise = mongoose.connect(DB_URL, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    autoIndex: !IS_PRODUCTION,
    family: 4,
  });

  try {
    await mongoPromise;

    console.log("[MongoDB] Connected");

    return mongoose.connection;
  } catch (error) {
    mongoPromise = null;

    console.error(
      "[MongoDB] Connection failed:",
      error.message
    );

    throw error;
  }
}

mongoose.connection.on("disconnected", () => {
  mongoPromise = null;
  console.warn("[MongoDB] Disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("[MongoDB]", error.message);
});

async function requireDatabase(req, res, next) {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error("[Database]", error.message);

    return res.status(503).json({
      success: false,
      code: "DATABASE_UNAVAILABLE",
      message: "Database temporarily unavailable",
    });
  }
}

/* ============================================================
   6. ROUTER EXPORT NORMALIZATION
============================================================ */

function resolveRouter(value, name) {
  const router =
    value && typeof value === "object" && value.default
      ? value.default
      : value;

  if (typeof router !== "function") {
    throw new TypeError(
      `Invalid router export: ${name}`
    );
  }

  return router;
}

/* ============================================================
   7. REQUIRED ROUTES

   Static require() calls help Vercel include
   route dependencies during bundling.
============================================================ */

const verifyAdminToken = resolveRouter(
  require("./src/middleware/verifyAdminToken.js"),
  "verifyAdminToken"
);

const adminAuthRoute = resolveRouter(
  require("./src/admin/admin.route.js"),
  "adminAuthRoute"
);

const productsRoute = resolveRouter(
  require("./src/products/product.route.js"),
  "productsRoute"
);

const ordersRoute = resolveRouter(
  require("./src/orders/order.route.js"),
  "ordersRoute"
);

const adminStatsRoute = resolveRouter(
  require("./src/stats/admin.stats.js"),
  "adminStatsRoute"
);

const uploadRoutes = resolveRouter(
  require("./src/routes/uploadRoutes.js"),
  "uploadRoutes"
);

const blogRoutes = resolveRouter(
  require("./src/blog/blog.route.js"),
  "blogRoutes"
);

const contactRoute = resolveRouter(
  require("./src/contact-form/contact-form.route.js"),
  "contactRoute"
);

const seoRoutes = resolveRouter(
  require("./src/seo/seo.routes.js"),
  "seoRoutes"
);

const amHssinRoute = resolveRouter(
  require("./src/ai/amHssin.route.js"),
  "amHssinRoute"
);

const amHssinSessionRoute = resolveRouter(
  require("./src/ai/amHssinSession.route.js"),
  "amHssinSessionRoute"
);

const aiCheckoutRoute = resolveRouter(
  require("./src/ai/aiCheckout.route.js"),
  "aiCheckoutRoute"
);

const progressNotificationsRoute = resolveRouter(
  require("./src/ai/progressNotifications.routes.js"),
  "progressNotificationsRoute"
);

const communicationSettingsRoute = resolveRouter(
  require("./src/settings/communicationSettings.route.js"),
  "communicationSettingsRoute"
);

/* ============================================================
   8. OPTIONAL ADMIN AI / REMINDERS
============================================================ */

function optionalRouter(loader, name) {
  try {
    return resolveRouter(loader(), name);
  } catch (error) {
    // A missing optional module may be skipped.
    // A broken module must not be silently ignored.
    if (
      error.code === "MODULE_NOT_FOUND" &&
      error.message.includes(name)
    ) {
      console.warn(
        `[Optional route unavailable] ${name}`
      );

      return null;
    }

    throw error;
  }
}

const amHssinAdminRoute = optionalRouter(
  () => require("./src/ai/amHssinAdmin.route.js"),
  "amHssinAdmin.route.js"
);

const adminRemindersRoute = optionalRouter(
  () => require("./src/adminReminders/adminReminder.routes.js"),
  "adminReminder.routes.js"
);

const adminReminderWorker = optionalRouter(
  () => require("./src/adminReminders/adminReminder.worker.js"),
  "adminReminder.worker.js"
);

/* ============================================================
   9. HEALTH ENDPOINTS
============================================================ */

app.get("/api/health/live", (req, res) => {
  return res.status(200).json({
    success: true,
    project: "Wahret Zmen",
    service: "Node Backend",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await connectDB();

    return res.status(200).json({
      success: true,
      project: "Wahret Zmen",
      assistant: "Am Hssin",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      success: false,
      database: "disconnected",
    });
  }
});

/* ============================================================
   10. ADMIN AUTHENTICATION
============================================================ */

app.use(
  "/api/auth/admin",
  requireDatabase,
  adminAuthRoute
);

/* ============================================================
   11. PRODUCTS
============================================================ */

app.use(
  "/api/products",
  requireDatabase,
  productsRoute
);

/* ============================================================
   12. ORDERS
============================================================ */

app.use(
  "/api/orders",
  requireDatabase,
  ordersRoute
);

/* ============================================================
   13. ADMIN PROGRESS NOTIFICATIONS
============================================================ */

app.use(
  "/api/admin/progress-notifications",
  verifyAdminToken,
  requireDatabase,
  progressNotificationsRoute
);

/* ============================================================
   14. ADMIN COMMUNICATION SETTINGS
============================================================ */

app.use(
  "/api/admin/communication-settings",
  verifyAdminToken,
  requireDatabase,
  communicationSettingsRoute
);

/* ============================================================
   15. PRIVATE AM HSSIN ADMIN AI
============================================================ */

if (amHssinAdminRoute) {
  app.use(
    "/api/admin/ai",
    verifyAdminToken,
    requireDatabase,
    amHssinAdminRoute
  );
}

/* ============================================================
   16. ADMIN REMINDERS
============================================================ */

if (adminRemindersRoute) {
  app.use(
    "/api/admin/reminders",
    verifyAdminToken,
    requireDatabase,
    adminRemindersRoute
  );
}

/* ============================================================
   17. CRON REMINDER WORKER

   The worker performs its own secret validation.
   Do not protect this route with admin JWT.
============================================================ */

if (adminReminderWorker) {
  app.use(
    "/api/internal/reminders",
    requireDatabase,
    adminReminderWorker
  );
}

/* ============================================================
   18. ADMIN DASHBOARD
============================================================ */

app.use(
  "/api/admin",
  verifyAdminToken,
  requireDatabase,
  adminStatsRoute
);

/* ============================================================
   19. UPLOADS
============================================================ */

app.use("/api", uploadRoutes);

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads"),
    {
      maxAge: "7d",
      etag: true,
      lastModified: true,
    }
  )
);

/* ============================================================
   20. BLOG
============================================================ */

app.use(
  "/api/blog",
  requireDatabase,
  blogRoutes
);

/* ============================================================
   21. CONTACT
============================================================ */

app.use(
  "/api/contact",
  contactRoute
);

/* ============================================================
   22. PUBLIC AI CHECKOUT
============================================================ */

app.use(
  "/api/ai/orders",
  requireDatabase,
  aiCheckoutRoute
);

/* ============================================================
   23. PUBLIC AI SESSIONS
============================================================ */

app.use(
  "/api/ai",
  amHssinSessionRoute
);

/* ============================================================
   24. PUBLIC AM HSSIN AI

   POST /api/ai/chat
   POST /api/ai/chat/stream
============================================================ */

app.use(
  "/api/ai",
  amHssinRoute
);

/* ============================================================
   25. SEO
============================================================ */

app.use("/", seoRoutes);

/* ============================================================
   26. ROOT
============================================================ */

app.get("/", (req, res) => {
  return res
    .type("text/plain; charset=utf-8")
    .send(
      "Wahret Zmen By Sabri — Backend running"
    );
});

/* ============================================================
   27. 404 HANDLER
============================================================ */

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: "Route not found",
    method: req.method,
    path: req.path,
  });
});

/* ============================================================
   28. GLOBAL ERROR HANDLER
============================================================ */

app.use((error, req, res, next) => {
  console.error("[Express Error]", {
    method: req.method,
    path: req.path,
    message: error.message,
  });

  if (res.headersSent) {
    return next(error);
  }

  const status =
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 500;

  return res.status(status).json({
    success: false,

    code:
      status === 403
        ? "FORBIDDEN"
        : "SERVER_ERROR",

    message:
      IS_PRODUCTION && status >= 500
        ? "Internal server error"
        : error.message,
  });
});

/* ============================================================
   29. START SERVER
============================================================ */

let server = null;

function startServer() {
  server = app.listen(PORT, () => {
    console.log(
      "======================================"
    );

    console.log(
      "WAHRET ZMEN BY SABRI — BACKEND"
    );

    console.log(`Port: ${PORT}`);

    console.log(
      "Admin Login: POST /api/auth/admin"
    );

    console.log(
      "Public AI: POST /api/ai/chat"
    );

    console.log(
      "Public AI SSE: POST /api/ai/chat/stream"
    );

    console.log(
      "Admin AI: POST /api/admin/ai/chat"
    );

    console.log(
      "Admin Reminders: /api/admin/reminders"
    );

    console.log(
      "Cron Worker: /api/internal/reminders"
    );

    console.log(
      "======================================"
    );
  });

  server.on("error", (error) => {
    console.error(
      "[HTTP Server]",
      error.message
    );

    process.exitCode = 1;
  });

  connectDB().catch((error) => {
    console.error(
      "[Startup MongoDB]",
      error.message
    );
  });
}

/* ============================================================
   30. GRACEFUL SHUTDOWN
============================================================ */

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`[Server] ${signal}`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) =>
          error ? reject(error) : resolve()
        );
      });
    }

    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error(
      "[Shutdown]",
      error.message
    );

    process.exit(1);
  }
}

/* ============================================================
   31. LOCAL SERVER START
============================================================ */

if (!IS_VERCEL && require.main === module) {
  startServer();

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

/* ============================================================
   32. VERCEL EXPORT
============================================================ */

module.exports = app;
