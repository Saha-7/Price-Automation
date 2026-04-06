/**
 * testParser.js
 *
 * Tests the scraper's parsing logic against real HTML
 * captured from pcpricetracker.in (no network needed).
 *
 * Run: node src/scripts/testParser.js
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Real HTML from the product page (from your Ctrl+U screenshot) ─────────────
// This is the actual structure of pcpricetracker.in product pages
const MOCK_PRODUCT_HTML = `
<table id="components" class="table table-hover table-striped table-bordered">
  <thead>
    <tr>
      <th>Product Name</th>
      <th>Source</th>
      <th>Last Available Date</th>
      <th>Price Link</th>
      <th>Shipping</th>
    </tr>
  </thead>
  <tbody>
    <tr class="">
      <td>Intel 10th Gen Comet Lake Core i3-10100 Processor 6M Cache, up to 4.30 GHz</td>
      <td>PrimeABGB</td>
      <td>Tue Oct 22 2024 00:00:00 GMT+0530 (India Standard Time)</td>
      <td>
        <a href="/out/07d557d19cd94fd0d1edf488a9e0a6a9/1" class="text-danger" target="_blank">
          7,198&nbsp;
        </a>
      </td>
      <td><span class="badge badge-success">Included in price</span></td>
    </tr>
    <tr class="">
      <td>INTEL CORE I3 10100 DESKTOP PROCESSOR</td>
      <td>Elitehubs</td>
      <td>Thu Apr 17 2025 00:00:00 GMT+0530 (India Standard Time)</td>
      <td>
        <a href="/out/07d557d19cd94fd0d1edf488a9e0a6a9/8" class="text-danger" target="_blank">
          7,395&nbsp;
          <span class="badge badge-light">197.00 <i class="fas fa-arrow-up ml-1"></i></span>
        </a>
      </td>
      <td><span class="badge badge-success">Included in price</span></td>
    </tr>
    <tr class="">
      <td>Intel Core i3-10100 10th Generation Processor (6M Cache, up to 4.30 GHz)</td>
      <td>Vedant Computers</td>
      <td>Mon Mar 23 2026 00:00:00 GMT+0530 (India Standard Time)</td>
      <td>
        <a href="/out/07d557d19cd94fd0d1edf488a9e0a6a9/2" class="text-success" target="_blank">
          12,799&nbsp;
          <span class="badge badge-light">129.00 <i class="fas fa-arrow-up ml-1"></i></span>
        </a>
      </td>
      <td><span class="badge badge-warning">Pending analysis</span></td>
    </tr>
    <tr class="">
      <td>INTEL CORE I3 10100 Processor</td>
      <td>Variety Infotech</td>
      <td>Mon Mar 23 2026 00:00:00 GMT+0530 (India Standard Time)</td>
      <td>
        <a href="/out/07d557d19cd94fd0d1edf488a9e0a6a9/28" class="text-success" target="_blank">
          12,149&nbsp;
          <span class="badge badge-light">150.00 <i class="fas fa-arrow-up ml-1"></i></span>
        </a>
      </td>
      <td><span class="badge badge-success">Included in price</span></td>
    </tr>
    <tr class="sponsored-30">
      <td>
        Intel Core i3-10100 Processor (6M Cache, up to 4.30 GHz) BGA 437 Socket
        <span class="badge badge-secondary ml-2">Sponsored</span>
      </td>
      <td>Amazon</td>
      <td>Tue Dec 30 2025 00:00:00 GMT+0530 (India Standard Time)</td>
      <td>
        <a href="/out/07d557d19cd94fd0d1edf488a9e0a6a9/30" class="text-danger" target="_blank">
          11,999&nbsp;
          <span class="badge badge-light">1,309.00 <i class="fas fa-arrow-up ml-1"></i></span>
        </a>
      </td>
      <td><span class="badge badge-success">Included in price</span></td>
    </tr>
  </tbody>
</table>
`;

// ── Mock category page HTML ────────────────────────────────────────────────────
const MOCK_CATEGORY_HTML = `
<table id="components" class="table">
  <thead>
    <tr>
      <th>Product</th>
      <th>Tracking Since</th>
      <th>View</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>10th Gen Intel Core i3-10100 Desktop Processor</td>
      <td>2020-10-20</td>
      <td><a href="/gen/products/07d557d19cd94fd0d1edf488a9e0a6a9">12,149</a></td>
    </tr>
    <tr>
      <td>10th Gen Intel Core i3-10105 Desktop Processor</td>
      <td>2021-04-07</td>
      <td><a href="/gen/products/abcd1234ef5678901234abcd1234ef56">9,195</a></td>
    </tr>
  </tbody>
</table>
`;

// ─── Parser functions (same logic as pcptScraperService.js) ───────────────────

function parsePrice(text) {
  const cleaned = (text || '').replace(/[^0-9]/g, '').trim();
  return cleaned ? parseInt(cleaned, 10) : null;
}

function isWithinDays(dateStr, days = 60) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  } catch { return false; }
}

function parseProductPage(html) {
  const $ = cheerio.load(html);
  const sellers = [];

  $('#components tbody tr').each((_, row) => {
    const cols        = $(row).find('td');
    if (cols.length < 5) return;

    const productName = $(cols[0]).text().trim().replace(/Sponsored/gi, '').trim();
    const seller      = $(cols[1]).text().trim();
    const lastDateRaw = $(cols[2]).text().trim();
    const priceLink   = $(cols[3]).find('a');
    // Get price text without the badge text
    const priceText   = priceLink.clone().children().remove().end().text().trim();
    const price       = parsePrice(priceText);
    const redirectPath = priceLink.attr('href') || '';
    const shippingStatus = $(cols[4]).find('.badge').text().trim();
    const isSponsored = $(cols[0]).find('.badge-secondary').length > 0;

    // Parse price change from badge
    const badgeText = $(cols[3]).find('.badge').text().trim();
    const changeAmount = parseFloat((badgeText || '').replace(/[^0-9.]/g, ''));
    const hasUp   = $(cols[3]).find('.fa-arrow-up').length > 0;
    const hasDown = $(cols[3]).find('.fa-arrow-down').length > 0;
    const priceChange = badgeText
      ? { amount: isNaN(changeAmount) ? 0 : changeAmount,
          direction: hasUp ? 'up' : hasDown ? 'down' : 'unchanged' }
      : null;

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
      priceChange,
      lastAvailableDate,
      lastAvailableRaw: lastDateRaw,
      isRecent:         isWithinDays(lastDateRaw, 60),
      shippingStatus,
      isSponsored,
      redirectUrl: redirectPath
        ? `https://pcpricetracker.in${redirectPath}` : null,
    });
  });

  const recentPrices = sellers
    .filter(s => s.isRecent && !s.isSponsored)
    .map(s => s.price);

  const stats = {
    totalCount  : sellers.length,
    recentCount : recentPrices.length,
    minPrice    : recentPrices.length ? Math.min(...recentPrices) : null,
    maxPrice    : recentPrices.length ? Math.max(...recentPrices) : null,
    avgPrice    : recentPrices.length
                    ? Math.round(recentPrices.reduce((a,b) => a+b, 0) / recentPrices.length)
                    : null,
  };

  return { sellers, stats };
}

function parseCategoryPage(html) {
  const $ = cheerio.load(html);
  const products = [];

  $('#components tbody tr').each((_, row) => {
    const cols = $(row).find('td');
    if (cols.length < 3) return;

    const productName   = $(cols[0]).text().trim();
    const trackingSince = $(cols[1]).text().trim();
    const priceLink     = $(cols[2]).find('a');
    const href          = priceLink.attr('href') || '';
    const priceText     = priceLink.text().trim();

    const uuidMatch = href.match(/\/gen\/products\/([a-f0-9]+)/);
    if (!uuidMatch) return;

    products.push({
      productName,
      uuid          : uuidMatch[1],
      trackingSince,
      currentPrice  : parsePrice(priceText),
      productPageUrl: `https://pcpricetracker.in/gen/products/${uuidMatch[1]}`,
    });
  });

  return products;
}

// ─── Run tests ────────────────────────────────────────────────────────────────

console.log('═'.repeat(55));
console.log('  🧪 Testing PCPT Parser');
console.log('═'.repeat(55));

// Test 1: Category page parsing
console.log('\n📂 Test 1: Category page parsing');
const categoryProducts = parseCategoryPage(MOCK_CATEGORY_HTML);
console.log(`   Found ${categoryProducts.length} products:`);
categoryProducts.forEach(p => {
  console.log(`   → UUID: ${p.uuid} | ${p.productName.substring(0,40)} | ₹${p.currentPrice}`);
});

// Test 2: Product page parsing
console.log('\n🏷️  Test 2: Product page parsing');
const { sellers, stats } = parseProductPage(MOCK_PRODUCT_HTML);

console.log(`\n   Sellers found: ${sellers.length}`);
console.log('   ─'.repeat(28));
sellers.forEach(s => {
  const change = s.priceChange ? `(${s.priceChange.direction} ₹${s.priceChange.amount})` : '';
  const recent = s.isRecent ? '✅ recent' : '⚠️  stale';
  const sponsored = s.isSponsored ? '[SPONSORED]' : '';
  console.log(`   ${s.seller.padEnd(18)} ₹${String(s.price).padEnd(7)} ${recent} ${change} ${sponsored}`);
});

console.log('\n   📊 Stats (recent, non-sponsored only):');
console.log(`   Min price : ₹${stats.minPrice}`);
console.log(`   Max price : ₹${stats.maxPrice}`);
console.log(`   Avg price : ₹${stats.avgPrice}`);
console.log(`   Total     : ${stats.totalCount} sellers`);
console.log(`   Recent    : ${stats.recentCount} sellers`);

// Test 3: Output JSON structure
console.log('\n📄 Test 3: Final JSON structure for one product');
const sampleOutput = {
  productName    : '10th Gen Intel Core i3-10100 Desktop Processor',
  uuid           : '07d557d19cd94fd0d1edf488a9e0a6a9',
  category       : 'Processor',
  categorySlug   : 'processor',
  trackingSince  : '2020-10-20',
  currentPrice   : 12149,
  productPageUrl : 'https://pcpricetracker.in/gen/products/07d557d19cd94fd0d1edf488a9e0a6a9',
  scrapedAt      : new Date().toISOString(),
  stats,
  sellers,
};

// Save sample output
const outDir = path.join(__dirname, '../../output/competitor_prices');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, '_test_sample.json');
fs.writeFileSync(outPath, JSON.stringify(sampleOutput, null, 2));
console.log(`   Saved sample → ${outPath}`);

console.log('\n' + '═'.repeat(55));

// Final verdict
const allPassed = categoryProducts.length === 2 && sellers.length === 5 && stats.minPrice !== null;
if (allPassed) {
  console.log('  ✅ All tests passed — parser is working correctly');
  console.log('  🚀 Ready to run: node src/scripts/scrapePCPT.js --test');
} else {
  console.log('  ❌ Some tests failed — check parser logic');
}
console.log('═'.repeat(55));