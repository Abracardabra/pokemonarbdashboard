/**
 * Comprehensive Site Research Script
 * Tests all Japanese card shop sites to understand:
 * - URL structure
 * - Listing pages (set/rarity views)
 * - Search functionality
 * - HTML structure
 * - Quality/condition indicators
 * - Price and stock extraction
 */

require('dotenv').config();

const API_KEY = process.env.SCRAPE_DO_API_KEY;

if (!API_KEY) {
  console.error('Error: SCRAPE_DO_API_KEY not set');
  process.exit(1);
}

// Sites to research
const SITES = [
  {
    name: 'japan-toreca',
    baseUrl: 'https://shop.japan-toreca.com',
    testUrls: [
      'https://shop.japan-toreca.com/collections/all', // All products
      'https://shop.japan-toreca.com/collections/pokemon', // Pokemon collection
    ],
  },
  {
    name: 'cardrush',
    baseUrl: 'https://www.cardrush-pokemon.jp',
    testUrls: [
      'https://www.cardrush-pokemon.jp',
      'https://www.cardrush-pokemon.jp/products/list.php', // List view
    ],
  },
  {
    name: 'torecacamp',
    baseUrl: 'https://torecacamp-pokemon.com',
    testUrls: [
      'https://torecacamp-pokemon.com',
      'https://torecacamp-pokemon.com/collections/all',
    ],
  },
  {
    name: 'toretoku',
    baseUrl: 'https://www.toretoku.jp',
    testUrls: [
      'https://www.toretoku.jp/pokemon',
      'https://www.toretoku.jp/item/list', // Item list
    ],
  },
  {
    name: 'dorasuta',
    baseUrl: 'https://dorasuta.jp',
    testUrls: [
      'https://dorasuta.jp/pokemon-card',
      'https://dorasuta.jp/pokemon-card/series-list', // Series list
    ],
  },
  {
    name: 'hobibinet',
    baseUrl: 'https://hobibinet-pokemon.com',
    testUrls: [
      'https://hobibinet-pokemon.com',
    ],
  },
  {
    name: 'playze',
    baseUrl: 'https://playze.jp',
    testUrls: [
      'https://playze.jp/collections/pokemon',
    ],
  },
  {
    name: 'c-labo',
    baseUrl: 'https://www.c-labo-online.jp',
    testUrls: [
      'https://www.c-labo-online.jp/page/125',
    ],
  },
  {
    name: 'fukufukutoreka',
    baseUrl: 'https://pokemon.fukufukutoreka.com',
    testUrls: [
      'https://pokemon.fukufukutoreka.com',
    ],
  },
];

// Test card for product page scraping
const TEST_CARD_URLS = {
  'japan-toreca': 'https://shop.japan-toreca.com/products/pokemon-10940-a',
  'dorasuta': 'https://dorasuta.jp/pokemon-card/product?pid=605736',
};

async function scrapeWithScrapeDo(url) {
  const encodedUrl = encodeURIComponent(url);
  const apiUrl = `https://api.scrape.do/?token=${API_KEY}&url=${encodedUrl}&render=true&geoCode=jp`;
  
  console.log(`\n🌐 Scraping: ${url.substring(0, 80)}...`);
  
  const start = Date.now();
  try {
    const response = await fetch(apiUrl, { timeout: 60000 });
    const duration = Date.now() - start;
    
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        duration,
        error: `HTTP ${response.status}`,
      };
    }
    
    const html = await response.text();
    
    // Check for Cloudflare challenge
    const isCF = html.includes('cf-browser-verification') || 
                 html.includes('challenges.cloudflare.com');
    
    return {
      success: true,
      status: response.status,
      duration,
      htmlLength: html.length,
      isCloudflareChallenge: isCF,
      html: html.substring(0, 3000), // First 3000 chars for analysis
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      duration: Date.now() - start,
      error: error.message,
    };
  }
}

function analyzePageStructure(html, siteName) {
  const analysis = {
    hasProductGrid: false,
    hasProductList: false,
    hasSearch: false,
    hasPagination: false,
    hasFilters: false,
    productSelectors: [],
    priceSelectors: [],
    qualityIndicators: [],
    stockIndicators: [],
  };
  
  // Check for product grid/list patterns
  if (html.includes('product-grid') || html.includes('product-list') || 
      html.includes('collection-grid') || html.includes('item-list')) {
    analysis.hasProductGrid = true;
  }
  
  // Check for search functionality
  if (html.includes('search') || html.includes('検索') || html.includes('q=')) {
    analysis.hasSearch = true;
  }
  
  // Check for pagination
  if (html.includes('pagination') || html.includes('page=') || 
      html.includes('next') || html.includes('次へ')) {
    analysis.hasPagination = true;
  }
  
  // Check for filters
  if (html.includes('filter') || html.includes('facet') || 
      html.includes('絞り込み') || html.includes('sort')) {
    analysis.hasFilters = true;
  }
  
  // Extract potential product selectors
  const selectors = [
    '.product', '.product-item', '.product-card', '.item',
    '[data-product]', '.collection-item', '.grid-item',
    '.item-list li', '.product-list li'
  ];
  for (const selector of selectors) {
    if (html.includes(selector.replace('.', '').replace('[', '').replace(']', ''))) {
      analysis.productSelectors.push(selector);
    }
  }
  
  // Extract quality indicators found
  const qualityPatterns = [
    '状態A', '状態B', '【状態A】', '【状態B】',
    'Aランク', 'Bランク', '美品', '並品',
    'A-', 'B-', 'A～', 'B～'
  ];
  for (const pattern of qualityPatterns) {
    if (html.includes(pattern)) {
      analysis.qualityIndicators.push(pattern);
    }
  }
  
  // Extract stock indicators
  const stockPatterns = [
    '在庫あり', '在庫なし', '売り切れ', '売切れ',
    '在庫数', '在庫切れ', 'カートに追加',
    'in stock', 'out of stock', 'sold out'
  ];
  for (const pattern of stockPatterns) {
    if (html.includes(pattern)) {
      analysis.stockIndicators.push(pattern);
    }
  }
  
  return analysis;
}

function extractUrls(html, baseUrl) {
  const urls = [];
  // Extract href links
  const hrefRegex = /href="([^"]+)"/g;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.includes('/products/') || url.includes('/product') || 
        url.includes('/item/') || url.includes('/card/')) {
      urls.push(url.startsWith('http') ? url : `${baseUrl}${url}`);
    }
  }
  return [...new Set(urls)].slice(0, 10); // Return first 10 unique URLs
}

async function researchSite(site) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 RESEARCHING: ${site.name.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);
  
  const results = {
    name: site.name,
    baseUrl: site.baseUrl,
    pages: [],
  };
  
  // Test each URL
  for (const url of site.testUrls) {
    const scrapeResult = await scrapeWithScrapeDo(url);
    
    if (scrapeResult.success) {
      const analysis = analyzePageStructure(scrapeResult.html, site.name);
      const productUrls = extractUrls(scrapeResult.html, site.baseUrl);
      
      results.pages.push({
        url,
        ...scrapeResult,
        analysis,
        sampleProductUrls: productUrls,
      });
    } else {
      results.pages.push({
        url,
        ...scrapeResult,
      });
    }
  }
  
  // Test product page if available
  if (TEST_CARD_URLS[site.name]) {
    console.log(`\n📦 Testing product page...`);
    const productResult = await scrapeWithScrapeDo(TEST_CARD_URLS[site.name]);
    results.productPage = productResult;
    
    if (productResult.success) {
      results.productAnalysis = analyzePageStructure(productResult.html, site.name);
    }
  }
  
  return results;
}

async function main() {
  console.log('🔬 JAPANESE CARD SHOP SITE RESEARCH');
  console.log('=====================================\n');
  console.log(`Using Scrape.do API: ${API_KEY.substring(0, 15)}...`);
  console.log('Testing all sites for:');
  console.log('- Directory/listing page structure');
  console.log('- Product page extraction');
  console.log('- Quality/condition indicators');
  console.log('- Stock status patterns');
  console.log('- Pagination and filtering\n');
  
  const allResults = [];
  
  for (const site of SITES) {
    const result = await researchSite(site);
    allResults.push(result);
    
    // Small delay between sites
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Generate report
  console.log('\n\n');
  console.log('📊 RESEARCH REPORT');
  console.log('==================\n');
  
  for (const result of allResults) {
    console.log(`\n## ${result.name.toUpperCase()}`);
    console.log(`Base URL: ${result.baseUrl}`);
    
    for (const page of result.pages) {
      console.log(`\n### Page: ${page.url}`);
      if (page.success) {
        console.log(`✅ Status: ${page.status} (${page.duration}ms)`);
        console.log(`📄 HTML Size: ${page.htmlLength} chars`);
        console.log(`🔒 CF Challenge: ${page.isCloudflareChallenge ? 'YES ⚠️' : 'No ✅'}`);
        
        if (page.analysis) {
          console.log(`\nStructure:`);
          console.log(`  - Product Grid: ${page.analysis.hasProductGrid ? '✅' : '❌'}`);
          console.log(`  - Search: ${page.analysis.hasSearch ? '✅' : '❌'}`);
          console.log(`  - Pagination: ${page.analysis.hasPagination ? '✅' : '❌'}`);
          console.log(`  - Filters: ${page.analysis.hasFilters ? '✅' : '❌'}`);
          
          if (page.analysis.qualityIndicators.length > 0) {
            console.log(`  - Quality Indicators: ${[...new Set(page.analysis.qualityIndicators)].join(', ')}`);
          }
          
          if (page.analysis.stockIndicators.length > 0) {
            console.log(`  - Stock Indicators: ${[...new Set(page.analysis.stockIndicators)].slice(0, 5).join(', ')}`);
          }
        }
        
        if (page.sampleProductUrls && page.sampleProductUrls.length > 0) {
          console.log(`\nSample Product URLs:`);
          page.sampleProductUrls.slice(0, 3).forEach(url => console.log(`  - ${url}`));
        }
      } else {
        console.log(`❌ Failed: ${page.error}`);
      }
    }
    
    if (result.productPage) {
      console.log(`\n### Product Page Test`);
      if (result.productPage.success) {
        console.log(`✅ Product page accessible`);
        if (result.productAnalysis) {
          const quality = [...new Set(result.productAnalysis.qualityIndicators)];
          if (quality.length > 0) {
            console.log(`   Quality markers found: ${quality.join(', ')}`);
          }
        }
      } else {
        console.log(`❌ Product page failed: ${result.productPage.error}`);
      }
    }
  }
  
  // Save detailed results to file
  const fs = require('fs');
  const outputPath = './docs/SITE_RESEARCH_RESULTS.json';
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\n\n💾 Detailed results saved to: ${outputPath}`);
}

main().catch(console.error);
