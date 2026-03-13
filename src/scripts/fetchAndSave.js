/**
 * fetchAndSave.js
 *
 * Runs on Azure — Managed Identity only.
 * Calls azureSqlService to fetch data, then saves to JSON files.
 *
 * Output files (written to src/output/):
 *   zoho_bills.json        — raw rows from vw_Zoho_Bills_Data
 *   shopify_skus.json      — raw rows from vw_Shopify_Product_SKUs
 *   combined_products.json — merged on Product_Title
 *
 * Run:  node src/scripts/fetchAndSave.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import azureSqlService from '../services/azureSqlService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../output');

// ─── Save helper ──────────────────────────────────────────────────────────────

function saveJSON(filename, data) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`   💾 Saved: ${filepath}  (${data.length} records)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  Azure SQL → JSON  |  Managed Identity');
  console.log(`  Server   : ${process.env.db_serverendpoint}`);
  console.log(`  DB Zoho  : ${process.env.db_zoho}`);
  console.log(`  DB Returns: ${process.env.db_returns}`);
  console.log('══════════════════════════════════════════════════');

  // Fetch all data via service
  const { zohoRows, shopifyRows, combined } = await azureSqlService.fetchCombinedData();

  // Save all three JSON files
  console.log('\n💾 Saving JSON files...');
  saveJSON('zoho_bills.json',        zohoRows);
  saveJSON('shopify_skus.json',      shopifyRows);
  saveJSON('combined_products.json', combined);

  // Summary
  const matched = combined.filter(p => p.purchasePrice !== null).length;
  console.log('\n📊 Summary');
  console.log(`   Shopify SKUs       : ${shopifyRows.length}`);
  console.log(`   Zoho Bills         : ${zohoRows.length}`);
  console.log(`   Matched w/ price   : ${matched}`);
  console.log(`   No purchase price  : ${combined.length - matched}`);
  console.log('\n✅ Done →', path.resolve(OUTPUT_DIR));
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});