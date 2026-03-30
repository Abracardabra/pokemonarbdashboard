/**
 * Debug test to understand Scrape.do request counting
 * Uses native fetch and logs all details
 */

require('dotenv').config();

const API_KEY = process.env.SCRAPE_DO_API_KEY;
const TEST_URL = 'https://dorasuta.jp/pokemon-card/product?pid=605736';

if (!API_KEY) {
  console.error('Error: SCRAPE_DO_API_KEY not set');
  process.exit(1);
}

// Override fetch to log requests
const originalFetch = globalThis.fetch;
let fetchCount = 0;

globalThis.fetch = async function(...args) {
  fetchCount++;
  const url = args[0];
  console.log(`\n🌐 Fetch call #${fetchCount}:`, url.toString().substring(0, 100) + '...');
  console.log('   Options:', JSON.stringify(args[1] || {}).substring(0, 200));
  
  const start = Date.now();
  try {
    const response = await originalFetch.apply(this, args);
    console.log(`   ✅ Response: ${response.status} in ${Date.now() - start}ms`);
    console.log('   Headers:', JSON.stringify(Object.fromEntries(response.headers), null, 2).substring(0, 300));
    return response;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message} after ${Date.now() - start}ms`);
    throw error;
  }
};

async function testScrapeDo() {
  console.log('=== Scrape.do Request Debug ===\n');
  
  const encodedUrl = encodeURIComponent(TEST_URL);
  const apiUrl = `https://api.scrape.do/?token=${API_KEY}&url=${encodedUrl}&render=true&geoCode=jp`;
  
  console.log('Making ONE request to Scrape.do...');
  console.log('Expected: 1 API call = 1 credit\n');
  
  const start = Date.now();
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
    });
    
    const html = await response.text();
    const duration = Date.now() - start;
    
    console.log(`\n=== Results ===`);
    console.log(`Total fetch() calls made: ${fetchCount}`);
    console.log(`Response status: ${response.status}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`HTML length: ${html.length} chars`);
    
    // Check for indicators of multiple internal requests
    console.log(`\n=== Analysis ===`);
    
    // Check response headers for clues
    const headers = Object.fromEntries(response.headers);
    if (headers['x-cache'] || headers['cf-cache-status']) {
      console.log('Cache status:', headers['cf-cache-status'] || headers['x-cache']);
    }
    
    // Extract title to verify we got the page
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      console.log('Page title:', titleMatch[1]);
    }
    
    // Check if price is in the HTML
    if (html.includes('300') && html.includes('円')) {
      console.log('✅ Price found in HTML: 300 JPY');
    }
    
    console.log(`\n=== Conclusion ===`);
    if (fetchCount === 1) {
      console.log('✅ Only 1 fetch() call was made');
      console.log('   This SHOULD equal 1 Scrape.do credit');
      console.log('   If your dashboard shows 6, check:');
      console.log('   1. Other scripts running concurrently');
      console.log('   2. Dashboard showing requests from earlier tests');
      console.log('   3. Browser refresh/retry logic');
    } else {
      console.log('⚠️  Multiple fetch() calls were made!');
    }
    
    return { fetchCount, duration, html };
    
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

testScrapeDo().catch(console.error);
