/**
 * scrapePCPT.js
 *
 * Main runner — scrapes all categories from pcpricetracker.in
 *
 * Usage:
 *   node src/scripts/scrapePCPT.js              ← full scrape (all categories)
 *   node src/scripts/scrapePCPT.js --test        ← test mode (3 products per category)
 *   node src/scripts/scrapePCPT.js --cat mouse   ← single category only
 *
 * Output files (written to src/output/competitor_prices/):
 *   processor.json       ← all processor products + seller prices
 *   motherboard.json
 *   gpu.json
 *   ... one file per category
 *   _all_products.json   ← master combined file
 *   _scrape_summary.json ← run log with counts + errors
 */

import {
  CATEGORIES,
  scrapeCategory,
  saveMasterFile,
  saveSummary,
  openBrowser,
  closeBrowser,
} from '../services/pcptScraperService.js';

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const testMode   = args.includes('--test');
const catArg     = args.find(a => a.startsWith('--cat'));
const singleCat  = catArg ? catArg.split('=')[1] ?? args[args.indexOf(catArg) + 1] : null;

// ─── Determine which categories to run ───────────────────────────────────────
const categoriesToRun = singleCat
  ? CATEGORIES.filter(c => c.slug === singleCat)
  : CATEGORIES;

if (singleCat && categoriesToRun.length === 0) {
  console.error(`❌ Unknown category: "${singleCat}"`);
  console.error(`   Available: ${CATEGORIES.map(c => c.slug).join(', ')}`);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   🕷️  PCPT Competitor Price Scraper                  ║
║   Source: pcpricetracker.in                          ║
╠══════════════════════════════════════════════════════╣
║   Mode      : ${testMode ? 'TEST (3 products/category)     ' : 'FULL                          '}║
║   Categories: ${String(categoriesToRun.length).padEnd(3)} ${categoriesToRun.map(c => c.slug).join(', ').substring(0, 30).padEnd(34)}║
║   Started   : ${new Date().toLocaleString('en-IN').padEnd(38)}║
╚══════════════════════════════════════════════════════╝
  `);

  const allProducts = [];
  const summaryResults = [];
  const startTime = Date.now();

  // Open ONE browser for the entire run — reused across all pages
  await openBrowser();

  try {
    for (const category of categoriesToRun) {
    const catStart = Date.now();

    try {
      const products = await scrapeCategory(category, { testMode });
      allProducts.push(...products);

      summaryResults.push({
        category    : category.name,
        slug        : category.slug,
        total       : products.length,
        success     : products.filter(p => !p.error).length,
        failed      : products.filter(p =>  p.error).length,
        durationSec : Math.round((Date.now() - catStart) / 1000),
        status      : 'completed',
      });

    } catch (err) {
      console.error(`\n❌ Category "${category.name}" failed entirely: ${err.message}`);
      summaryResults.push({
        category: category.name,
        slug    : category.slug,
        total   : 0,
        success : 0,
        failed  : 0,
        status  : 'failed',
        error   : err.message,
      });
    }

    // Extra delay between categories
    if (categoriesToRun.indexOf(category) < categoriesToRun.length - 1) {
      console.log(`\n  ⏳ Waiting 5s before next category...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // ── Save combined outputs ────────────────────────────────────────────────────
  if (allProducts.length > 0) {
    saveMasterFile(allProducts);
  }
  saveSummary(summaryResults);

  } finally {
    // Always close browser — even if scrape crashes halfway
    await closeBrowser();
  }

  // ── Final summary ────────────────────────────────────────────────────────────
  const totalSec = Math.round((Date.now() - startTime) / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;

  console.log(`
╔══════════════════════════════════════════════════════╗
║   ✅ Scrape Complete                                  ║
╠══════════════════════════════════════════════════════╣`);

  for (const r of summaryResults) {
    const line = `║   ${r.category.padEnd(15)} ${String(r.success).padStart(4)} ok  ${String(r.failed).padStart(3)} fail  ${r.status.padEnd(11)}`;
    console.log(line.padEnd(55) + '║');
  }

  console.log(`╠══════════════════════════════════════════════════════╣`);
  console.log(`║   Total products : ${String(allProducts.length).padEnd(35)}║`);
  console.log(`║   Duration       : ${`${mins}m ${secs}s`.padEnd(35)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});