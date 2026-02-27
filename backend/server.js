import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./src/config/database.js";

// Import routes
import authRoutes from "./src/routes/authRoutes.js";
import productRoutes from "./src/routes/productRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";
import syncRoutes from "./src/routes/syncRoutes.js";

// Import middleware
import errorHandler from "./src/middleware/errorHandler.js";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

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
    secret:
      process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Only initialize Passport if Azure credentials are provided
const hasAzureCredentials =
  process.env.AZURE_AD_CLIENT_ID &&
  process.env.AZURE_AD_CLIENT_SECRET &&
  process.env.AZURE_AD_TENANT_ID;

if (hasAzureCredentials) {
  console.log("🔐 Azure AD credentials found - Initializing M365 OAuth...");
  // Import passport config only if credentials exist
  await import("./src/config/passport.js");
  app.use(passport.initialize());
  app.use(passport.session());
  console.log("✅ M365 OAuth initialized");
} else {
  console.log("⚠️  Azure AD credentials not found");
  console.log("💡 M365 OAuth disabled - app will run without authentication");
  console.log("💡 Add AZURE_AD_* credentials to .env to enable authentication");
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Shopify Price Management API is running",
    timestamp: new Date().toISOString(),
    mongoConnected: mongoose.connection.readyState === 1,
    authEnabled: hasAzureCredentials,
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/sync", syncRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  const authStatus = hasAzureCredentials ? "✅" : "⚠️  (disabled)";
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Shopify Price Management API Server Running!         ║
║                                                            ║
║   📡 Port: ${PORT}                                           ║
║   🌍 Environment: ${process.env.NODE_ENV || "development"}                            ║
║   🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}     ║
║   🔐 M365 Auth: ${authStatus}                                   ║
║                                                            ║
║   📚 Endpoints:                                            ║
║   • Health: GET /health                                    ║
║   • Auth: /api/auth/* ${authStatus}                              ║
║   • Products: /api/products/*                              ║
║   • Upload: /api/upload/*                                  ║
║   • Sync: /api/sync/*                                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  if (!hasAzureCredentials) {
    console.log("\n💡 Tip: To enable M365 authentication, add these to .env:");
    console.log("   AZURE_AD_CLIENT_ID=your-client-id");
    console.log("   AZURE_AD_CLIENT_SECRET=your-client-secret");
    console.log("   AZURE_AD_TENANT_ID=your-tenant-id\n");
  }
});

export default app;