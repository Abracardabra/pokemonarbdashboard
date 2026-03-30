/**
 * Test to verify Scrape.do request count
 * Tracks exactly how many HTTP requests we make
 */

require('dotenv').config();
const https = require('https');

const API_KEY = process.env.SCRAPE_DO_API_KEY;
const TEST_URL = 'https://dorasuta.jp/pokemon-card/product?pid=605736';

if (!API_KEY) {
  console.error('Error: SCRAPE_DO_API_KEY not set');
  process.exit(1);
}

let requestCount = 0;

// Wrap https.request to count calls
const originalRequest = https.request;
https.request = function(...args) {
  requestCount++;
  const url = args[0];
  console.log(`\n🌐 HTTP Request #${requestCount}:`, typeof url === 'string' ? url : url?.href || url?.pathname || 'unknown');
  return originalRequest.apply(this, args);
};

async function scrapeWithNodeHttp(targetUrl) {
  const encodedUrl = encodeURIComponent(targetUrl);
  const apiUrl = `https://api.scrape.do/?token=${API_KEY}&url=${encodedUrl}&render=true&geoCode=jp`;
  
  console.log('=== Scrape.do Request Test ===');
  console.log('Target URL:', targetUrl);
  console.log('Expected API calls: 1\n');
  
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    console.log('📤 Sending request to Scrape.do...');
    
    const req = https.get(apiUrl, (res) => {
      console.log('📥 Response received:', res.statusCode);
      console.log('📋 Headers:', JSON.stringify(res.headers, null, 2).substring(0, 500));
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        console.log(`\n✅ Request complete in ${duration}ms`);
        console.log(`📊 Total HTTP requests made: ${requestCount}`);
        console.log(`📄 HTML length: ${data.length} chars`);
        
        resolve({
          status: res.statusCode,
          duration,
          html: data,
          requestCount,
          redirectCount: res.headers['x-redirect-count'] || 0,
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function main() {
  try {
    const result = await scrapeWithNodeHttp(TEST_URL);
    
    console.log('\n=== Results ===');
    console.log('Status:', result.status);
    console.log('Duration:', result.duration + 'ms');
    console.log('Total HTTP requests made:', result.requestCount);
    console.log('Redirect count (from headers):', result.redirectCount);
    
    if (result.requestCount === 1) {
      console.log('\n✅ GOOD: Only 1 HTTP request was made (as expected)');
    } else {
      console.log('\n⚠️  WARNING: Multiple HTTP requests were made!');
      console.log('   This could be due to:');
      console.log('   1. Redirects being followed');
      console.log('   2. Retries on failure');
      console.log('   3. Something in the Node.js runtime');
    }
    
    // Check if Scrape.do dashboard would show this
    console.log('\n=== Scrape.do Dashboard Note ===');
    console.log('According to Scrape.do docs, each API call = 1 credit');
    console.log('If your dashboard shows 6 requests, possible causes:');
    console.log('1. You ran the test 6 times (check command history)');
    console.log('2. Other tests/scripts ran concurrently');
    console.log('3. The render=true loads page resources (but Scrape.do handles this internally)');
    console.log('4. There was a redirect chain');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
