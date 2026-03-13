/**
 * azureSqlService.js
 *
 * Connects to Azure SQL using a User-Assigned Managed Identity (UAMI).
 *
 * Azure App Service env vars required (set in Azure Portal → Configuration):
 *   db_serverendpoint  → Azure SQL server URL
 *   db_zoho            → Zoho database name
 *   db_returns         → Returns/Shopify database name
 *   db_userclientid    → Client ID of the User-Assigned Managed Identity
 *
 * No username or password needed — UAMI token handles authentication.
 */

import sql from 'mssql';
import { ManagedIdentityCredential } from '@azure/identity';

// ─── Read env vars from Azure App Service → Configuration ────────────────────
const SERVER          = process.env.db_serverendpoint;
const DB_ZOHO         = process.env.db_zoho;
const DB_RETURNS      = process.env.db_returns;
const UAMI_CLIENT_ID  = process.env.db_userclientid;  // User-Assigned MI Client ID

// Validate all required env vars on startup
if (!SERVER)         throw new Error('Missing env var: db_serverendpoint');
if (!DB_ZOHO)        throw new Error('Missing env var: db_zoho');
if (!DB_RETURNS)     throw new Error('Missing env var: db_returns');
if (!UAMI_CLIENT_ID) throw new Error('Missing env var: db_userclientid');

// Azure SQL requires this exact scope to issue a token
const SQL_SCOPE = 'https://database.windows.net//.default';

// ─── Get access token from User-Assigned Managed Identity ────────────────────

async function getAccessToken() {
  const credential = new ManagedIdentityCredential({
    clientId: UAMI_CLIENT_ID,  // Tells Azure which user-assigned identity to use
  });
  const token = await credential.getToken(SQL_SCOPE);
  return token.token;
}

// ─── Build mssql config using the access token ───────────────────────────────

function buildConfig(database, accessToken) {
  return {
    server: SERVER,
    database,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: accessToken,
      },
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

async function fetchPurchasePrices(accessToken) {
  console.log(`📡 Connecting to ${DB_ZOHO} → [dbo].[vw_Zoho_Bills_Data]...`);

  const rows = await queryDB(
    DB_ZOHO,
    `SELECT
       Product_Title,
       Purchase_Price
     FROM [dbo].[vw_Zoho_Bills_Data]`,
    accessToken
  );

  console.log(`   ✅ ${rows.length} rows fetched`);
  return rows;
}

// ─── Fetch from Shopify SKUs view ─────────────────────────────────────────────

async function fetchShopifySKUs(accessToken) {
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
     FROM dbo.vw_Shopify_Product_SKUs`,
    accessToken
  );

  console.log(`   ✅ ${rows.length} rows fetched`);
  return rows;
}

// ─── Combine both datasets on Product_Title ───────────────────────────────────

function combineData(zohoRows, shopifyRows) {
  const priceMap = new Map();
  for (const row of zohoRows) {
    const key = (row.Product_Title || '').toLowerCase().trim();
    if (key) priceMap.set(key, row.Purchase_Price);
  }

  return shopifyRows.map(row => {
    const key = (row.Product_Title || '').toLowerCase().trim();
    return {
      sku:                 row.SKU           ?? null,
      productName:         row.Product_Title  ?? null,
      productType:         row.Product_Type   ?? null,
      brand:               row.Brand          ?? null,
      mrp:                 row.Price          ?? null,
      currentSellingPrice: row.ComparePrice   ?? null,
      purchasePrice:       priceMap.get(key)  ?? null,
      dataSource:          'api_sync',
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchCombinedData() {
  console.log('🔄 Getting UAMI access token...');
  const accessToken = await getAccessToken();
  console.log('   ✅ Token acquired');

  console.log('🔄 Fetching from both SQL databases in parallel...');
  const [zohoRows, shopifyRows] = await Promise.all([
    fetchPurchasePrices(accessToken),
    fetchShopifySKUs(accessToken),
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