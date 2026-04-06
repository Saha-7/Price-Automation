/**
 * pcptScraperService.js
 *
 * Scrapes pcpricetracker.in for competitor prices.
 * Uses Playwright (real Chromium browser) to bypass Cloudflare 403.
 *
 * Two-step process per category:
 *   Step 1 — Scrape category page  → get list of products + their UUIDs
 *   Step 2 — Scrape each UUID page → get all seller prices for that product
 *
 * All data is saved to src/output/competitor_prices/
 *
 * Install: npm install playwright && npx playwright install chromium
 */

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../output/competitor_prices');

// ─── Categories available on pcpricetracker.in ────────────────────────────────
export const CATEGORIES = [
  { name: 'Processor',    slug: 'processor'   },
  { name: 'Motherboard',  slug: 'motherboard' },
  { name: 'Graphic Card', slug: 'gpu'         },
  { name: 'Power Supply', slug: 'psu'         },
  { name: 'Memory',       slug: 'memory'      },
  { name: 'Hard Drive',   slug: 'hdd'         },
  { name: 'SSD',          slug: 'ssd'         },
  { name: 'Cabinet',      slug: 'cabinet'     },
  { name: 'Monitor',      slug: 'monitor'     },
  { name: 'Cooler',       slug: 'cooler'      },
  { name: 'Keyboard',     slug: 'keyboard'    },
  { name: 'Mouse',        slug: 'mouse'       },
  { name: 'Headset',      slug: 'headset'     },
  { name: 'Laptop',       slug: 'laptop'      },
  { name: 'Gaming',       slug: 'gaming'      },
  { name: 'UPS',          slug: 'ups'         },
];

// ─── Browser manager — one browser instance for entire scrape run ─────────────
// Opening/closing a browser per request is slow (3-5s each time).
// Instead we open ONE browser at start, reuse it for all pages, close at end.

let _browser = null;
let _context = null;

export async function openBrowser() {
  console.log('🌐 Launching Chromium browser...');
  _browser = await chromium.launch({
    headless: true,           // set false to watch it scrape (useful for debugging)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', // hides that it's automated
    ],
  });

  // One persistent context — shares cookies across all pages
  _context = await _browser.newContext({
    userAgent  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale     : 'en-IN',
    timezoneId : 'Asia/Kolkata',
    viewport   : { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
    },
  });

  // Block only images, fonts, media — keep JS and CSS for DataTables to work
  await _context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  console.log('✅ Browser ready');
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
    _context = null;
    console.log('🔒 Browser closed');
  }
}

// ─── Page fetchers ────────────────────────────────────────────────────────────
//
// Category pages (/processor, /mouse etc):
//   Table rows loaded via DataTables AJAX after page load.
//   Must use networkidle + wait for actual <tr> rows.
//
// Product pages (/gen/products/{uuid}):
//   Fully SSR — rows are in HTML immediately.
//   domcontentloaded is enough and much faster.

async function fetchCategoryPageHtml(url) {
  if (!_context) throw new Error('Browser not open. Call openBrowser() first.');
  const page = await _context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // Poll DOM until rows actually appear in the browser
    await page.waitForFunction(
      () => document.querySelectorAll('#components tbody tr').length > 0,
      { timeout: 30000 }
    ).catch(() => console.warn('  ⚠️  Rows never appeared: ' + url));

    // Extra buffer for DataTables to finish rendering
    await page.waitForTimeout(3000);

    // Debug — log actual row count visible in browser
    const rowCount = await page.evaluate(
      () => document.querySelectorAll('#components tbody tr').length
    ).catch(() => 0);
    console.log('     🔍 Rows visible in browser: ' + rowCount);

    return await page.content();
  } finally {
    await page.close();
  }
}

async function fetchProductPageHtml(url) {
  if (!_context) throw new Error('Browser not open. Call openBrowser() first.');
  const page = await _context.newPage();
  try {
    // SSR — rows already in HTML, no AJAX needed
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#components tbody tr', { timeout: 15000 })
      .catch(() => { console.warn(`  ⚠️  No rows found: ${url}`); });
    return await page.content();
  } finally {
    await page.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Random delay between requests — polite scraping, avoids detection
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 3000, max = 6000) =>
  delay(min + Math.random() * (max - min));

// Parse price string like "7,198" or "12,549 " → 7198
function parsePrice(text) {
  const cleaned = (text || '').replace(/[^0-9]/g, '').trim();
  return cleaned ? parseInt(cleaned, 10) : null;
}

// Parse price change badge like "197.00 ↑" → { amount: 197, direction: 'up' }
function parsePriceChange(badgeText) {
  if (!badgeText) return null;
  const amount = parseFloat((badgeText || '').replace(/[^0-9.]/g, ''));
  const direction = badgeText.includes('fa-arrow-up') ? 'up'
                  : badgeText.includes('fa-arrow-down') ? 'down'
                  : 'unchanged';
  return isNaN(amount) ? null : { amount, direction };
}

// Check if a date is within N days from today
function isWithinDays(dateStr, days = 60) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  } catch {
    return false;
  }
}

// Ensure output directory exists
function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Save JSON file
function saveJSON(filepath, data) {
  ensureOutputDir(path.dirname(filepath));
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Step 1: Scrape category page → get product list ─────────────────────────
/**
 * Returns array of:
 * {
 *   productName: string,
 *   uuid: string,           ← pcpricetracker internal ID
 *   trackingSince: string,
 *   currentPrice: number,
 *   category: string,
 *   productPageUrl: string
 * }
 */
export async function scrapeCategoryPage(category) {
  const url = `https://pcpricetracker.in/${category.slug}`;
  console.log(`  📂 Fetching category: ${category.name} → ${url}`);

  const html = await fetchCategoryPageHtml(url);
  const $    = cheerio.load(html);
  const products = [];

  // Category page table has columns: Product | Tracking Since | View(price)
  // Each row's "View" link points to /gen/products/{uuid}
  $('#components tbody tr').each((_, row) => {
    const cols = $(row).find('td');
    if (cols.length < 3) return;

    const productName  = $(cols[0]).text().trim();
    const trackingSince = $(cols[1]).text().trim();

    // Price link in last column
    const priceLink = $(cols[2]).find('a');
    const href = priceLink.attr('href') || '';
    const priceText = priceLink.text().trim();

    // Extract UUID from href like /gen/products/{uuid}
    const uuidMatch = href.match(/\/gen\/products\/([a-f0-9]+)/);
    if (!uuidMatch) return;

    const uuid = uuidMatch[1];
    const currentPrice = parsePrice(priceText);

    if (!productName || !uuid) return;

    products.push({
      productName,
      uuid,
      trackingSince,
      currentPrice,
      category: category.name,
      categorySlug: category.slug,
      productPageUrl: `https://pcpricetracker.in/gen/products/${uuid}`,
    });
  });

  console.log(`     ✅ Found ${products.length} products`);
  return products;
}

// ─── Step 2: Scrape product UUID page → get all seller prices ─────────────────
/**
 * Returns object:
 * {
 *   uuid: string,
 *   scrapedAt: string,
 *   sellers: [{ seller, productName, price, priceChange, lastAvailableDate,
 *               isRecent, shippingStatus, redirectUrl }],
 *   stats: { minPrice, maxPrice, avgPrice, recentCount, totalCount }
 * }
 */
export async function scrapeProductPrices(uuid) {
  const url  = `https://pcpricetracker.in/gen/products/${uuid}`;
  const html = await fetchProductPageHtml(url);
  const $    = cheerio.load(html);

  const sellers = [];

  $('#components tbody tr').each((_, row) => {
    const cols = $(row).find('td');
    if (cols.length < 5) return;

    const productName      = $(cols[0]).text().trim()
                               .replace(/Sponsored/gi, '').trim();
    const seller           = $(cols[1]).text().trim();
    const lastDateRaw      = $(cols[2]).text().trim();
    const priceLink        = $(cols[3]).find('a');
    const priceText        = priceLink.clone().children().remove().end().text().trim();
    const price            = parsePrice(priceText);
    const priceChangeBadge = $(cols[3]).find('.badge').text().trim();
    const redirectPath     = priceLink.attr('href') || '';
    const shippingBadge    = $(cols[4]).find('.badge');
    const shippingStatus   = shippingBadge.text().trim() || 'unknown';
    const isSponsored      = $(cols[0]).find('.badge-secondary').length > 0;

    // Parse the date string — PCPT uses JS Date.toString() format
    // e.g. "Mon Mar 23 2026 00:00:00 GMT+0530 (India Standard Time)"
    let lastAvailableDate = null;
    try {
      const parsed = new Date(lastDateRaw);
      if (!isNaN(parsed.getTime())) lastAvailableDate = parsed.toISOString();
    } catch { /* ignore */ }

    if (!seller || !price) return;

    sellers.push({
      productName,
      seller,
      price,
      priceChange:       parsePriceChange(priceChangeBadge),
      lastAvailableDate,
      lastAvailableRaw:  lastDateRaw,
      isRecent:          isWithinDays(lastDateRaw, 60),
      shippingStatus,
      isSponsored,
      redirectUrl:       redirectPath
                           ? `https://pcpricetracker.in${redirectPath}`
                           : null,
    });
  });

  // ── Compute price statistics (recent sellers only) ──────────────────────────
  const recentPrices = sellers
    .filter(s => s.isRecent && !s.isSponsored)
    .map(s => s.price)
    .filter(Boolean);

  const stats = {
    totalCount  : sellers.length,
    recentCount : recentPrices.length,
    minPrice    : recentPrices.length ? Math.min(...recentPrices) : null,
    maxPrice    : recentPrices.length ? Math.max(...recentPrices) : null,
    avgPrice    : recentPrices.length
                    ? Math.round(recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length)
                    : null,
  };

  return {
    uuid,
    scrapedAt : new Date().toISOString(),
    sellers,
    stats,
  };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
/**
 * Scrape one category end-to-end:
 *   1. Get product list from category page
 *   2. For each product, scrape all seller prices
 *   3. Save results to JSON
 *
 * Returns array of fully enriched product objects.
 */
export async function scrapeCategory(category, { testMode = false } = {}) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  🗂️  Category: ${category.name}`);
  console.log(`${'═'.repeat(55)}`);

  // ── Step 1: Get product list ─────────────────────────────────────────────────
  let products;
  try {
    products = await scrapeCategoryPage(category);
  } catch (err) {
    console.error(`  ❌ Failed to load category page: ${err.message}`);
    return [];
  }

  if (products.length === 0) {
    console.log(`  ⚠️  No products found for ${category.name}`);
    return [];
  }

  // In test mode, only scrape first 3 products
  const toProcess = testMode ? products.slice(0, 3) : products;
  console.log(`  📦 Products to scrape: ${toProcess.length}${testMode ? ' (test mode)' : ''}`);

  const enriched = [];

  // ── Step 2: Scrape each product page ─────────────────────────────────────────
  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    process.stdout.write(`  [${i + 1}/${toProcess.length}] ${product.productName.substring(0, 55).padEnd(55)} `);

    try {
      await randomDelay(3000, 6000);              // polite delay every request
      const priceData = await scrapeProductPrices(product.uuid);

      const enrichedProduct = {
        ...product,
        sellers   : priceData.sellers,
        stats     : priceData.stats,
        scrapedAt : priceData.scrapedAt,
      };

      enriched.push(enrichedProduct);
      process.stdout.write(`✅ ${priceData.sellers.length} sellers, min ₹${priceData.stats.minPrice ?? '-'}\n`);

    } catch (err) {
      process.stdout.write(`❌ ${err.message}\n`);
      enriched.push({
        ...product,
        sellers   : [],
        stats     : { totalCount: 0, recentCount: 0, minPrice: null, maxPrice: null, avgPrice: null },
        scrapedAt : new Date().toISOString(),
        error     : err.message,
      });
    }
  }

  // ── Step 3: Save category JSON ───────────────────────────────────────────────
  const outPath = path.join(OUTPUT_DIR, `${category.slug}.json`);
  const output = {
    category    : category.name,
    categorySlug: category.slug,
    scrapedAt   : new Date().toISOString(),
    totalProducts: enriched.length,
    products    : enriched,
  };

  saveJSON(outPath, output);
  console.log(`\n  💾 Saved → ${outPath}`);
  console.log(`  📊 ${enriched.length} products | ${enriched.filter(p => !p.error).length} success | ${enriched.filter(p => p.error).length} failed`);

  return enriched;
}

// ─── Save combined master file ────────────────────────────────────────────────
export function saveMasterFile(allProducts) {
  const masterPath = path.join(OUTPUT_DIR, '_all_products.json');

  const master = {
    scrapedAt    : new Date().toISOString(),
    totalProducts: allProducts.length,
    byCategory   : {},
    products     : allProducts,
  };

  // Group counts by category
  for (const p of allProducts) {
    master.byCategory[p.category] = (master.byCategory[p.category] || 0) + 1;
  }

  saveJSON(masterPath, master);
  console.log(`\n💾 Master file saved → ${masterPath}`);
  console.log(`   Total products: ${allProducts.length}`);
  console.log(`   By category:`);
  for (const [cat, count] of Object.entries(master.byCategory)) {
    console.log(`     ${cat.padEnd(15)} ${count}`);
  }
}

// ─── Save scrape summary / log ─────────────────────────────────────────────────
export function saveSummary(results) {
  const summaryPath = path.join(OUTPUT_DIR, '_scrape_summary.json');
  saveJSON(summaryPath, {
    scrapedAt  : new Date().toISOString(),
    categories : results,
  });
  console.log(`\n📋 Summary saved → ${summaryPath}`);
}