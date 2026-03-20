/**
 * azureSqlService.js
 *
 * Connects to Azure SQL using a User-Assigned Managed Identity (UAMI).
 * No username or password needed — Azure handles auth via the assigned identity.
 *
 * Azure App Service env vars required (set in Azure Portal → Configuration):
 *   db_serverendpoint  → Azure SQL server URL
 *   db_zoho            → Zoho database name
 *   db_returns         → Returns/Shopify database name
 *   db_userclientid    → Client ID of the User-Assigned Managed Identity
 *
 * Token strategy:
 *   - Each DB gets its own access token
 *   - Tokens are cached and refreshed every 50 mins (1hr expiry, 10min buffer)
 *   - If refresh fails, old token is kept as fallback
 */

import sql from 'mssql';
import { ManagedIdentityCredential } from '@azure/identity';

// ─── Read env vars ────────────────────────────────────────────────────────────
const SERVER     = process.env.db_serverendpoint;
const DB_ZOHO    = process.env.db_zoho;
const DB_RETURNS = process.env.db_returns;
const CLIENT_ID  = process.env.db_userclientid;

if (!SERVER)     throw new Error('Missing env var: db_serverendpoint');
if (!DB_ZOHO)    throw new Error('Missing env var: db_zoho');
if (!DB_RETURNS) throw new Error('Missing env var: db_returns');
if (!CLIENT_ID)  throw new Error('Missing env var: db_userclientid');

const SQL_SCOPE         = 'https://database.windows.net//.default';
const TOKEN_REFRESH_MS  = 50 * 60 * 1000;  // 50 minutes (1hr expiry - 10min buffer)

// ─── Token cache — one per database ──────────────────────────────────────────

const tokenCache = {
  db_zoho_accesstoken:    { token: null, refreshTimer: null },
  db_returns_accesstoken: { token: null, refreshTimer: null },
};

// ─── Get a fresh token from UAMI ─────────────────────────────────────────────

async function fetchFreshToken() {
  const credential = new ManagedIdentityCredential({
    clientId: CLIENT_ID,
  });
  const result = await credential.getToken(SQL_SCOPE);
  return result.token;
}

// ─── Start token refresh cycle for a given cache key ─────────────────────────

function scheduleTokenRefresh(cacheKey) {
  // Clear any existing timer
  if (tokenCache[cacheKey].refreshTimer) {
    clearTimeout(tokenCache[cacheKey].refreshTimer);
  }

  tokenCache[cacheKey].refreshTimer = setTimeout(async () => {
    console.log(`🔄 Refreshing token for ${cacheKey}...`);
    try {
      tokenCache[cacheKey].token = await fetchFreshToken();
      console.log(`   ✅ Token refreshed for ${cacheKey}`);
    } catch (err) {
      console.error(`   ⚠️ Token refresh failed for ${cacheKey}, keeping old token. Error: ${err.message}`);
    }
    // Schedule next refresh regardless of success/failure
    scheduleTokenRefresh(cacheKey);
  }, TOKEN_REFRESH_MS);
}

// ─── Get token (fetch if not cached, start refresh cycle) ────────────────────

async function getToken(cacheKey) {
  if (!tokenCache[cacheKey].token) {
    console.log(`🔄 Getting initial token for ${cacheKey}...`);
    tokenCache[cacheKey].token = await fetchFreshToken();
    console.log(`   ✅ Token acquired for ${cacheKey}`);
    scheduleTokenRefresh(cacheKey);
  }
  return tokenCache[cacheKey].token;
}

// ─── Build mssql config ───────────────────────────────────────────────────────

function buildConfig(database, accessToken) {
  return {
    server: SERVER,
    database,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: { token: accessToken },
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30_000,
    },
  };
}

// ─── Generic query helper ─────────────────────────────────────────────────────

async function queryDB(database, queryString, accessToken) {
  let pool;
  try {
    pool = await sql.connect(buildConfig(database, accessToken));
    const result = await pool.request().query(queryString);
    return result.recordset;
  } finally {
    if (pool) await pool.close();
  }
}

// ─── Fetch from Zoho view ─────────────────────────────────────────────────────

async function fetchPurchasePrices() {
  console.log(`📡 Connecting to ${DB_ZOHO} → [dbo].[vw_Zoho_Bills_Data]...`);
  const accessToken = await getToken('db_zoho_accesstoken');

  const rows = await queryDB(
    DB_ZOHO,
    `SELECT
       col_item_name,
       col_item_price_per_item
     FROM [dbo].[vw_Zoho_Bills_Data]`,
    accessToken
  );

  console.log(`   ✅ ${rows.length} rows fetched from Zoho`);
  return rows;
}

// ─── Fetch from Shopify SKUs view ─────────────────────────────────────────────

async function fetchShopifySKUs() {
  console.log(`📡 Connecting to ${DB_RETURNS} → [dbo].[vw_Shopify_Product_SKUs]...`);
  const accessToken = await getToken('db_returns_accesstoken');

  const rows = await queryDB(
    DB_RETURNS,
    `SELECT
       title,
       shopify_type_name,
       sku,
       brand_name,
       price,
       compare_at_price
     FROM [dbo].[vw_Shopify_Product_SKUs]`,
    accessToken
  );

  console.log(`   ✅ ${rows.length} rows fetched from Shopify`);
  return rows;
}

// ─── Combine both datasets on item name / title ───────────────────────────────

function combineData(zohoRows, shopifyRows) {
  const priceMap = new Map();
  for (const row of zohoRows) {
    const key = (row.col_item_name || '').toLowerCase().trim();
    if (key) priceMap.set(key, row.col_item_price_per_item);
  }

  return shopifyRows.map(row => {
    const key = (row.title || '').toLowerCase().trim();
    return {
      sku:                 row.sku               ?? null,
      productName:         row.title             ?? null,
      productType:         row.shopify_type_name  ?? null,
      brand:               row.brand_name         ?? null,
      mrp:                 row.price              ?? null,
      currentSellingPrice: row.compare_at_price   ?? null,
      purchasePrice:       priceMap.get(key)      ?? null,
      dataSource:          'api_sync',
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCombinedData() {
  console.log('🔄 Fetching from both SQL databases sequentially...');
  const zohoRows = await fetchPurchasePrices();
  const shopifyRows = await fetchShopifySKUs();

  const combined = combineData(zohoRows, shopifyRows);
  console.log(`✅ Combined ${combined.length} products`);

  return { zohoRows, shopifyRows, combined };
}

export default {
  fetchPurchasePrices,
  fetchShopifySKUs,
  fetchCombinedData,
};