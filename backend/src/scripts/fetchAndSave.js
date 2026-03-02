/**
 * fetchAndSave.js
 *
 * Runs on Azure ONLY — uses Managed Identity exclusively.
 * No .env, no username/password, no local dev fallback.
 *
 * Flow:
 *  1. Connect (via Managed Identity) to meta-database db_serverendpoint
 *     to read the real SQL server URL.
 *     (db_username / db_password are ignored — MI handles auth)
 *  2. Connect (via Managed Identity) to data databases:
 *       db_Zoho_AMZ_API  → [dbo].[vw_Zoho_Bills_Data]
 *       db_returns       → dbo.vw_Shopify_Product_SKUs
 *  3. Save to ./output/
 *       zoho_bills.json
 *       shopify_skus.json
 *       combined_products.json
 *
 * Run:  node fetchAndSave.js
 */

import sql from 'mssql';
import fs from 'fs';
import path from 'path';

// ─── The only hardcoded value: bootstrap server ───────────────────────────────
// This is the Azure SQL Server that hosts ALL databases (meta + data).
// Set this to your server from the Azure Portal, e.g.:
//   mycompany.database.windows.net
const BOOTSTRAP_SERVER = 'YOUR_SERVER.database.windows.net';

const OUTPUT_DIR = './output';

// ─── Managed Identity config ──────────────────────────────────────────────────

function buildConfig(server, database) {
  return {
    server,
    database,
    authentication: {
      type: 'azure-active-directory-default', // Managed Identity — zero credentials
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30_000,
    },
  };
}

// ─── Generic query helper ─────────────────────────────────────────────────────

async function queryDB(server, database, queryString) {
  let pool;
  try {
    pool = await sql.connect(buildConfig(server, database));
    const result = await pool.request().query(queryString);
    return result.recordset;
  } finally {
    if (pool) await pool.close();
  }
}

// ─── Step 1: Read real server URL from meta-database ─────────────────────────
// db_username and db_password exist in your setup but are NOT needed —
// Managed Identity authenticates without them.

async function getRealServer() {
  console.log(`\n🔍 Reading server endpoint from meta-database...`);
  console.log(`   Bootstrap: ${BOOTSTRAP_SERVER}`);

  const rows = await queryDB(
    BOOTSTRAP_SERVER,
    'db_serverendpoint',
    `SELECT value FROM db_serverendpoint`
    // ^ Adjust table/column name here if it differs in your actual schema
  );

  if (!rows || rows.length === 0) {
    throw new Error('db_serverendpoint returned no rows — check table/column name');
  }

  const server = String(rows[0].value).trim();
  console.log(`   ✅ Real server: ${server}`);
  return server;
}

// ─── Step 2: Fetch from both data views ──────────────────────────────────────

async function fetchZohoData(server) {
  console.log('\n📡 Connecting to db_Zoho_AMZ_API...');
  const rows = await queryDB(
    server,
    'db_Zoho_AMZ_API',
    `SELECT
       Product_Title,
       Purchase_Price
     FROM [dbo].[vw_Zoho_Bills_Data]`
  );
  console.log(`   ✅ ${rows.length} rows from vw_Zoho_Bills_Data`);
  return rows;
}

async function fetchShopifyData(server) {
  console.log('\n📡 Connecting to db_returns...');
  const rows = await queryDB(
    server,
    'db_returns',
    `SELECT
       Product_Type,
       SKU,
       Brand,
       Price,
       ComparePrice,
       Product_Title
     FROM dbo.vw_Shopify_Product_SKUs`
  );
  console.log(`   ✅ ${rows.length} rows from vw_Shopify_Product_SKUs`);
  return rows;
}

// ─── Step 3: Combine datasets ─────────────────────────────────────────────────

function combineData(zohoRows, shopifyRows) {
  // Build lookup: Product_Title (lowercase) → Purchase_Price
  const priceMap = new Map();
  for (const row of zohoRows) {
    const key = (row.Product_Title || '').toLowerCase().trim();
    if (key) priceMap.set(key, row.Purchase_Price);
  }

  return shopifyRows.map(row => {
    const key = (row.Product_Title || '').toLowerCase().trim();
    return {
      sku:                 row.SKU             ?? null,
      productName:         row.Product_Title   ?? null,
      productType:         row.Product_Type    ?? null,
      brand:               row.Brand           ?? null,
      mrp:                 row.Price           ?? null,
      currentSellingPrice: row.ComparePrice    ?? null,
      purchasePrice:       priceMap.get(key)   ?? null, // null if no Zoho match
    };
  });
}

// ─── Step 4: Save to JSON ─────────────────────────────────────────────────────

function saveJSON(filename, data) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`   💾 ${filepath}  (${data.length} records)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  Azure SQL → JSON  |  Managed Identity only');
  console.log('══════════════════════════════════════════════════');

  // 1. Resolve real server from meta-database
  const server = await getRealServer();

  // 2. Fetch both views in parallel
  const [zohoRows, shopifyRows] = await Promise.all([
    fetchZohoData(server),
    fetchShopifyData(server),
  ]);

  // 3. Save raw files + combined
  console.log('\n💾 Saving JSON files...');
  saveJSON('zoho_bills.json',        zohoRows);
  saveJSON('shopify_skus.json',      shopifyRows);

  const combined = combineData(zohoRows, shopifyRows);
  saveJSON('combined_products.json', combined);

  // 4. Summary
  const matched = combined.filter(p => p.purchasePrice !== null).length;
  console.log('\n📊 Summary');
  console.log(`   Shopify SKUs      : ${shopifyRows.length}`);
  console.log(`   Zoho Bills        : ${zohoRows.length}`);
  console.log(`   Matched w/ price  : ${matched}`);
  console.log(`   No purchase price : ${combined.length - matched}`);
  console.log('\n✅ Done →', path.resolve(OUTPUT_DIR));
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});