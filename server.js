import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import azureSqlService from "./src/services/azureSqlService.js";

// Import routes
import authRoutes from "./src/routes/authRoutes.js";
import productRoutes from "./src/routes/productRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";
import syncRoutes from "./src/routes/syncRoutes.js";

// Import middleware
import errorHandler from "./src/middleware/errorHandler.js";

// Load environment variables
dotenv.config();

// ─── MongoDB - disabled until needed ─────────────────────────────────────────
// import connectDB from "./src/config/database.js";
// connectDB();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "src/output");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// ─── M365 OAuth - disabled until credentials are set ─────────────────────────
const hasAzureCredentials =
  process.env.AZURE_AD_CLIENT_ID &&
  process.env.AZURE_AD_CLIENT_SECRET &&
  process.env.AZURE_AD_TENANT_ID;

if (hasAzureCredentials) {
  console.log("🔐 Azure AD credentials found - Initializing M365 OAuth...");
  await import("./src/config/passport.js");
  app.use(passport.initialize());
  app.use(passport.session());
  console.log("✅ M365 OAuth initialized");
} else {
  console.log("⚠️  M365 OAuth disabled - credentials not set");
}

// ─── Auto-fetch from Azure SQL on server start ────────────────────────────────

const fetchAndSaveData = async () => {
  try {
    console.log("🔄 Auto-fetching data from Azure SQL...");

    const { zohoRows, shopifyRows, combined } =
      await azureSqlService.fetchCombinedData();

    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "zoho_bills.json"),
      JSON.stringify(zohoRows, null, 2)
    );
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "shopify_skus.json"),
      JSON.stringify(shopifyRows, null, 2)
    );
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "combined_products.json"),
      JSON.stringify(combined, null, 2)
    );

    console.log(`✅ Data fetched and saved — ${combined.length} products`);
    console.log(`   Zoho rows     : ${zohoRows.length}`);
    console.log(`   Shopify rows  : ${shopifyRows.length}`);
    console.log(`   Output dir    : ${OUTPUT_DIR}`);

  } catch (err) {
    console.error("❌ Auto-fetch failed:", err.message);
  }
};

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Shopify Price Management API is running",
    timestamp: new Date().toISOString(),
    authEnabled: !!hasAzureCredentials,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/sync", syncRoutes);

// ─── Error handling (must be last) ───────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════=============╗
║                                                                         ║
║   🚀 Shopify Price Management API Server Running!                      |
║                                                                         ║
║   📡 Port: ${PORT}                                                     ║
║   🌍 Environment: ${process.env.NODE_ENV || "development"}             ║
║   🔐 M365 Auth: ${hasAzureCredentials ? "✅" : "⚠️(disabled)"}        ║
║   🗄️  MongoDB: ⚠️  (disabled)                                          ║
║                                                                         ║
╚════════════════════════════════════════════════════════════=============╝
  `);

  // Auto-fetch data from Azure SQL on startup
  await fetchAndSaveData();
});

export default app;