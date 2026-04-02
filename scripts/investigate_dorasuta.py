#!/usr/bin/env python3
"""
Investigate Dorasuta.jp thoroughly
- Check search page structure
- Find if there's a direct product URL pattern
- Look for JSON endpoints
- Test different approaches
"""

import urllib.request
import urllib.parse
import json
import ssl
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

TOKEN = "2UE1P15Z8J8yQHB56a47635b570ca9fe4331c2c5147152b9d"

def fetch_html(url):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        })
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return resp.read().decode('utf-8')
    except Exception as e:
        return f"ERROR: {e}"

def browserless_fetch(url, wait_for=None):
    endpoint = f"https://production-sfo.browserless.io/content?token={TOKEN}"
    payload = {
        "url": url,
        "gotoOptions": {"waitUntil": "networkidle2", "timeout": 30000},
        "bestAttempt": True
    }
    if wait_for:
        payload["waitForSelector"] = wait_for
    
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return resp.read().decode('utf-8')
    except Exception as e:
        return f"ERROR: {e}"

def browserless_unblock(url):
    endpoint = f"https://production-sfo.browserless.io/unblock?token={TOKEN}"
    payload = {
        "url": url,
        "browserWSEndpoint": True,
        "cookies": True,
        "content": True,
        "screenshot": False,
        "ttl": 120000
    }
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get("content", "")
    except Exception as e:
        return f"ERROR: {e}"

print("="*80)
print("INVESTIGATING DORASUTA.JP")
print("="*80)

# Test 1: Check if there's a set-based browsing URL
print("\n1. Testing set-based browsing (SV3)...")
print("   URL: https://dorasuta.jp/pokemon-card/product-list?sid=7127")
html = browserless_unblock("https://dorasuta.jp/pokemon-card/product-list?sid=7127")
if "リザードン" in html or "Charizard" in html or "product" in html:
    print("   ✅ Set page accessible")
    # Look for product listings
    products = re.findall(r'href="(/pokemon-card/product[^"]*)"', html)
    print(f"   Found {len(products)} product links")
    if products:
        print(f"   Sample: {products[0]}")
else:
    print("   ❌ No products found")

# Test 2: Try to find a direct product URL pattern
print("\n2. Testing direct product URL...")
print("   URL: https://dorasuta.jp/pokemon-card/product?pid=12345")
html = browserless_unblock("https://dorasuta.jp/pokemon-card/product?pid=12345")
print(f"   Length: {len(html)} bytes")
if "エラー" in html or "error" in html.lower():
    print("   ❌ Error page")
else:
    print("   ✅ Page exists (may be valid product URL pattern)")

# Test 3: Search for JSON/AJAX endpoints in the HTML
print("\n3. Looking for API endpoints in search page...")
search_html = browserless_unblock("https://dorasuta.jp/pokemon-card/product-list?keyword=リザードンex")
api_patterns = [
    r'ajax[^"\']*',
    r'api[^"\']*',
    r'\.json[^"\']*',
    r'data-url="([^"]+)"',
    r'fetch\(["\']([^"\']+)["\']',
]

found_apis = []
for pattern in api_patterns:
    matches = re.findall(pattern, search_html, re.IGNORECASE)
    found_apis.extend(matches)

if found_apis:
    print(f"   Found {len(found_apis)} potential API references")
    for api in set(found_apis[:5]):
        print(f"   - {api}")
else:
    print("   No obvious API endpoints found")

# Test 4: Check for product data in page
print("\n4. Checking for product data structure...")
if 'data-product' in search_html or 'product-id' in search_html:
    print("   ✅ Product data attributes found")
else:
    print("   ⚠️ No obvious product data attributes")

# Test 5: Look for JavaScript product loading
print("\n5. Looking for product loading JavaScript...")
if 'window.__DATA__' in search_html or 'initialState' in search_html:
    print("   ✅ Found potential data injection")
    # Try to extract
    data_match = re.search(r'window\.__DATA__\s*=\s*({.+?});', search_html, re.DOTALL)
    if data_match:
        print("   📝 Found __DATA__ object")
else:
    print("   ⚠️ No obvious data injection found")

# Test 6: Try using /function to wait for AJAX
print("\n6. Testing /function endpoint to wait for products...")
endpoint = f"https://production-sfo.browserless.io/function?token={TOKEN}"
code = """
export default async function ({ page }) {
  await page.goto('https://dorasuta.jp/pokemon-card/product-list?keyword=リザードンex', { 
    waitUntil: 'networkidle2',
    timeout: 30000 
  });
  
  // Wait for product list to appear
  try {
    await page.waitForSelector('.product-list, .item-list, [class*="product"]', { 
      timeout: 10000 
    });
  } catch (e) {
    console.log('Selector timeout');
  }
  
  // Additional wait for any AJAX
  await new Promise(r => setTimeout(r, 5000));
  
  const html = await page.content();
  return { html, url: page.url() };
}
"""

try:
    req = urllib.request.Request(
        endpoint,
        data=json.dumps({"code": code, "context": {}}).encode('utf-8'),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        html = result.get("html", "")
        
        if "リザードンex" in html or "product" in html:
            print("   ✅ Products found after waiting")
            # Extract products
            prices = re.findall(r'(\d{1,3}(?:,\d{3})*)円', html)
            print(f"   Prices found: {prices[:5]}")
        else:
            print("   ❌ Still no products after waiting")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n" + "="*80)
print("SUMMARY")
print("="*80)
print("Dorasuta uses AJAX to load search results after page load.")
print("Solutions to try:")
print("1. Use /function endpoint with wait + longer delay")
print("2. Look for set-based browsing (sid parameter)")
print("3. Find direct product URLs from existing data")
