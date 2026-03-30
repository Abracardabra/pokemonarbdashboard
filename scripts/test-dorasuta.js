/**
 * Test Scrape.do with a real Dorasuta URL
 * Pure JavaScript - no TypeScript imports
 */

require('dotenv').config();
const cheerio = require('cheerio');

const API_KEY = process.env.SCRAPE_DO_API_KEY;
const TEST_URL = 'https://dorasuta.jp/pokemon-card/product?pid=605736';

if (!API_KEY) {
  console.error('Error: SCRAPE_DO_API_KEY not set');
  process.exit(1);
}

async function scrapeDo(targetUrl) {
  const encodedUrl = encodeURIComponent(targetUrl);
  const apiUrl = `https://api.scrape.do/?token=${API_KEY}&url=${encodedUrl}&render=true&geoCode=jp`;
  
  console.log('API URL:', apiUrl.substring(0, 80) + '...\n');
  
  const start = Date.now();
  const response = await fetch(apiUrl);
  const duration = Date.now() - start;
  
  const html = await response.text();
  
  return {
    status: response.status,
    duration,
    html,
    success: response.ok,
  };
}

function extractPriceJPY(text) {
  if (!text) return null;
  const cleaned = text.replace(/[¥,円\s]/g, '').replace(/[^\d]/g, '');
  const price = parseInt(cleaned, 10);
  return isNaN(price) ? null : price;
}

function checkInStock(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  const outIndicators = ['sold out', 'out of stock', '在庫なし', '売り切れ', '在庫切れ'];
  return !outIndicators.some(ind => lower.includes(ind));
}

async function main() {
  console.log('=== Testing Dorasuta via Scrape.do ===');
  console.log(`URL: ${TEST_URL}`);
  console.log('This may take 30-60 seconds (headless browser rendering)...\n');

  const result = await scrapeDo(TEST_URL);

  console.log('--- Scrape.do Result ---');
  console.log('Status:', result.status);
  console.log('Duration:', result.duration + 'ms');
  console.log('HTML Length:', result.html.length);
  console.log('Success:', result.success);

  // Parse HTML
  const $ = cheerio.load(result.html);
  
  // Try various selectors for Dorasuta
  const selectors = {
    price: ['.price-current', '.product-price .current-price', '.price-box .price', '.price', '[class*="price"]', '.current-price'],
    stock: ['.stock-status', '.availability', '.product-stock', '.inventory', '[class*="stock"]'],
    title: ['h1.product-title', 'h1', '.product-name h1', 'h1[itemprop="name"]', '.title'],
  };

  let priceJPY = null;
  let priceSelector = null;
  for (const sel of selectors.price) {
    const text = $(sel).first().text().trim();
    if (text) {
      priceJPY = extractPriceJPY(text);
      if (priceJPY) {
        priceSelector = sel;
        break;
      }
    }
  }

  let stockText = null;
  let stockSelector = null;
  for (const sel of selectors.stock) {
    const text = $(sel).first().text().trim();
    if (text) {
      stockText = text;
      stockSelector = sel;
      break;
    }
  }

  let titleText = null;
  let titleSelector = null;
  for (const sel of selectors.title) {
    const text = $(sel).first().text().trim();
    if (text) {
      titleText = text;
      titleSelector = sel;
      break;
    }
  }

  const inStock = checkInStock(stockText);
  const titleMatch = result.html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : null;

  console.log('\n--- Parsed Data ---');
  console.log('Price JPY:', priceJPY);
  console.log('Price Selector Used:', priceSelector);
  console.log('In Stock:', inStock);
  console.log('Stock Selector Used:', stockSelector);
  console.log('Stock Text:', stockText);
  console.log('Title:', titleText?.substring(0, 100));
  console.log('Title Selector Used:', titleSelector);
  console.log('Page Title:', pageTitle);

  // Detect Cloudflare
  const isCF = result.html.includes('cf-browser-verification') || 
               result.html.includes('challenges.cloudflare') ||
               result.html.includes('Checking your browser');
  console.log('Cloudflare Challenge:', isCF);

  // Show HTML preview if no price found
  if (!priceJPY) {
    console.log('\n--- HTML Preview (first 800 chars) ---');
    console.log(result.html.substring(0, 800).replace(/\n/g, ' '));
    
    // Show all elements with price-like text
    console.log('\n--- Elements with price-like text ---');
    $('*').each((i, el) => {
      const text = $(el).text();
      if (text.match(/[¥￥]|円/) && text.match(/\d/)) {
        console.log(`  ${el.tagName}.${$(el).attr('class')}: "${text.trim().substring(0, 100)}"`);
      }
    });
  }

  console.log('\n=== Summary ===');
  if (priceJPY) {
    console.log('✅ SUCCESS - Price extracted:', priceJPY + ' JPY');
    console.log('   Product:', titleText);
    console.log('   In Stock:', inStock);
  } else if (isCF) {
    console.log('❌ FAILED - Still showing Cloudflare challenge');
  } else {
    console.log('❌ FAILED - Could not extract price (may need selector adjustment)');
  }
}

main().catch(console.error);
