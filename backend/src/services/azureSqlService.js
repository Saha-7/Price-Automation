/**
 * azureSqlService.js
 *
 * Connects to Azure SQL using Managed Identity.
 * Reads server/database names from Azure App Service env vars:
 *
 *   db_serverendpoint  →  your Azure SQL server URL
 *   db_zoho            →  zoho database name
 *   db_returns         →  returns database name
 *
 * No username, no password, no ODBC driver needed —
 * Managed Identity handles authentication automatically.
 */

import sql from 'mssql';

// ─── Read env vars set in Azure App Service → Configuration ──────────────────
const SERVER   = process.env.db_serverendpoint;  // e.g. myserver.database.windows.net
const DB_ZOHO  = process.env.db_zoho;            // e.g. db_Zoho_AMZ_API
const DB_RETURNS = process.env.db_returns;       // e.g. db_returns

// Validate on startup so failures are obvious immediately
if (!SERVER)     throw new Error('Missing env var: db_serverendpoint');
if (!DB_ZOHO)    throw new Error('Missing env var: db_zoho');
if (!DB_RETURNS) throw new Error('Missing env var: db_returns');

// ─── Managed Identity config builder ─────────────────────────────────────────

function buildConfig(database) {
  return {
    server: SERVER,
    database,
    authentication: {
      type: 'azure-active-directory-default', // Uses Managed Identity — no credentials needed
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30_000,
    },
  };
}

// ─── Generic query helper ─────────────────────────────────────────────────────

async function queryDB(database, queryString) {
  let pool;
  try {
    pool = await sql.connect(buildConfig(database));
    const result = await pool.request().query(queryString);
    return result.recordset;
  } finally {
    if (pool) await pool.close();
  }
}

// ─── Fetch from Zoho view ─────────────────────────────────────────────────────

async function fetchPurchasePrices() {
  console.log(`📡 Connecting to ${DB_ZOHO} → [dbo].[vw_Zoho_Bills_Data]...`);

  const rows = await queryDB(
    DB_ZOHO,
    `SELECT
       Product_Title,
       Purchase_Price
     FROM [dbo].[vw_Zoho_Bills_Data]`
  );

  console.log(`   ✅ ${rows.length} rows fetched`);
  return rows;
}

// ─── Fetch from Shopify SKUs view ─────────────────────────────────────────────
// NOTE: Product_Title is included here so combineData() can match on it

async function fetchShopifySKUs() {
  console.log(`📡 Connecting to ${DB_RETURNS} → dbo.vw_Shopify_Product_SKUs...`);

  const rows = await queryDB(
    DB_RETURNS,
    `SELECT
       Product_Title,
       Product_Type,
       SKU,
       Brand,
       Price,
       ComparePrice
     FROM dbo.vw_Shopify_Product_SKUs`
  );

  console.log(`   ✅ ${rows.length} rows fetched`);
  return rows;
}

// ─── Combine both datasets ────────────────────────────────────────────────────
// Joins on Product_Title (case-insensitive) to attach purchase price to each SKU

function combineData(zohoRows, shopifyRows) {
  // Build lookup map: lowercase Product_Title → Purchase_Price
  const priceMap = new Map();
  for (const row of zohoRows) {
    const key = (row.Product_Title || '').toLowerCase().trim();
    if (key) priceMap.set(key, row.Purchase_Price);
  }

  return shopifyRows.map(row => {
    const key = (row.Product_Title || '').toLowerCase().trim();
    return {
      sku:                 row.SKU          ?? null,
      productName:         row.Product_Title ?? null,
      productType:         row.Product_Type  ?? null,
      brand:               row.Brand         ?? null,
      mrp:                 row.Price         ?? null,
      currentSellingPrice: row.ComparePrice  ?? null,
      purchasePrice:       priceMap.get(key) ?? null, // null = no Zoho match found
      dataSource:          'api_sync',
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCombinedData() {
  console.log('🔄 Fetching from both SQL databases in parallel...');

  const [zohoRows, shopifyRows] = await Promise.all([
    fetchPurchasePrices(),
    fetchShopifySKUs(),
  ]);

  const combined = combineData(zohoRows, shopifyRows);
  console.log(`✅ Combined ${combined.length} products`);

  return { zohoRows, shopifyRows, combined };
}

export default {
  fetchPurchasePrices,
  fetchShopifySKUs,
  fetchCombinedData,
};