/**
 * Test script for Scrape.do API
 * Tests Cloudflare bypass on Japanese card shop sites
 */

require('dotenv').config();

const API_KEY = process.env.SCRAPE_DO_API_KEY;

if (!API_KEY) {
  console.error('Error: SCRAPE_DO_API_KEY not set in environment');
  console.error('Add it to .env file: SCRAPE_DO_API_KEY=your_key_here');
  process.exit(1);
}

// Test URLs
const TEST_URLS = {
  // Japan-Toreca example
  japanToreca: 'https://shop.japan-toreca.com/products/pokemon-10940-a',
  // Generic test
  httpbin: 'https://httpbin.org/get',
};

async function testScrapeDo(targetUrl, render = true) {
  const encodedUrl = encodeURIComponent(targetUrl);
  const apiUrl = `https://api.scrape.do/?token=${API_KEY}&url=${encodedUrl}&render=${render}`;
  
  console.log(`\n--- Testing: ${targetUrl} ---`);
  console.log(`Render: ${render}`);
  console.log(`API URL: ${apiUrl.substring(0, 80)}...`);
  
  try {
    const start = Date.now();
    const response = await fetch(apiUrl);
    const duration = Date.now() - start;
    
    console.log(`Status: ${response.status}`);
    console.log(`Duration: ${duration}ms`);
    
    if (!response.ok) {
      console.error(`Failed: HTTP ${response.status}`);
      const text = await response.text();
      console.error('Response:', text.substring(0, 500));
      return { success: false, status: response.status, error: text };
    }
    
    const html = await response.text();
    console.log(`HTML length: ${html.length} chars`);
    
    // Check for common success indicators
    const hasTitle = html.includes('<title');
    const hasBody = html.includes('<body');
    const isCloudflareChallenge = html.includes('cf-browser-verification') || 
                                    html.includes('challenges.cloudflare') ||
                                    html.includes('cf-im-under-attack');
    const isBlocked = html.includes('Access denied') || 
                      html.includes('403 Forbidden') ||
                      html.includes('blocked');
    
    console.log(`Has title: ${hasTitle}`);
    console.log(`Has body: ${hasBody}`);
    console.log(`CF challenge detected: ${isCloudflareChallenge}`);
    console.log(`Blocked page: ${isBlocked}`);
    
    // Extract title if possible
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      console.log(`Page title: "${titleMatch[1].trim()}"`);
    }
    
    // Preview HTML
    console.log(`HTML preview: ${html.substring(0, 200).replace(/\n/g, ' ')}...`);
    
    return {
      success: true && !isCloudflareChallenge && !isBlocked,
      status: response.status,
      duration,
      htmlLength: html.length,
      isCloudflareChallenge,
      isBlocked,
      title: titleMatch ? titleMatch[1].trim() : null,
    };
    
  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== Scrape.do API Test ===');
  console.log(`API Key: ${API_KEY.substring(0, 15)}...`);
  
  // Test 1: Simple HTTP endpoint
  console.log('\n\n=== Test 1: Httpbin (no render) ===');
  const httpbinResult = await testScrapeDo(TEST_URLS.httpbin, false);
  
  // Test 2: Japan-Toreca with render
  console.log('\n\n=== Test 2: Japan-Toreca (with render=true) ===');
  const jtResult = await testScrapeDo(TEST_URLS.japanToreca, true);
  
  // Summary
  console.log('\n\n=== SUMMARY ===');
  console.log('Httpbin:', httpbinResult.success ? '✅ PASS' : '❌ FAIL', 
    `(${httpbinResult.duration}ms)`);
  console.log('Japan-Toreca:', jtResult.success ? '✅ PASS' : '❌ FAIL', 
    `(${jtResult.duration}ms)`);
  
  if (jtResult.isCloudflareChallenge) {
    console.log('⚠️  Warning: Still showing Cloudflare challenge page');
  }
  
  if (jtResult.success) {
    console.log('\n✅ Scrape.do is working for Japan-Toreca!');
  }
  
  console.log('\n\n=== TO TEST DORASUTA ===');
  console.log('1. Find a Dorasuta product URL');
  console.log('2. Replace TEST_URLS.japanToreca with that URL');
  console.log('3. Run this script again');
}

main().catch(console.error);
