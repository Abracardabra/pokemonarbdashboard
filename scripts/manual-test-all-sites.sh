#!/bin/bash
# Manual test of all 9 Japanese card shop sites
# Run with: bash scripts/manual-test-all-sites.sh

TOKEN="1d8e566da1314f44948f56ea1e34508d22364541631"
OUTPUT_DIR="./docs/site-tests"
mkdir -p $OUTPUT_DIR

echo "================================"
echo "TESTING ALL 9 JAPANESE SITES"
echo "================================"
echo ""

# Site 1: Japan-Toreca
echo "1/9 TESTING: Japan-Toreca"
echo "   URL: https://shop.japan-toreca.com/products/pokemon-10940-a"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://shop.japan-toreca.com/products/pokemon-10940-a&render=true" > $OUTPUT_DIR/japan-toreca.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/japan-toreca.html) bytes"
echo "   Price found: $(grep -o '¥[0-9,]*' $OUTPUT_DIR/japan-toreca.html | head -1)"
echo "   Quality found: $(grep -o '【状態[AB]】' $OUTPUT_DIR/japan-toreca.html | head -1)"
echo "   Stock found: $(grep -o '在庫数：[0-9]*' $OUTPUT_DIR/japan-toreca.html | head -1)"
echo ""

# Site 2: Dorasuta
echo "2/9 TESTING: Dorasuta"
echo "   URL: https://dorasuta.jp/pokemon-card/product?pid=605736"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://dorasuta.jp/pokemon-card/product?pid=605736&render=true" > $OUTPUT_DIR/dorasuta.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/dorasuta.html) bytes"
echo "   Price found: $(grep -o '[0-9]*\s*円' $OUTPUT_DIR/dorasuta.html | head -3)"
echo "   Qualities found: $(grep -o '状態[ABC]' $OUTPUT_DIR/dorasuta.html | sort | uniq -c | sort -rn)"
echo "   Stock found: $(grep -o '在庫数：[0-9]*' $OUTPUT_DIR/dorasuta.html | head -3)"
echo ""

# Site 3: Toretoku
echo "3/9 TESTING: Toretoku (Search page)"
echo "   URL: https://www.toretoku.jp/item?kw=ピカチュウ"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://www.toretoku.jp/item?kw=ピカチュウ&render=true" > $OUTPUT_DIR/toretoku.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/toretoku.html) bytes"
echo "   Has search results: $(grep -c 'item' $OUTPUT_DIR/toretoretoku.html 2>/dev/null || echo '0')"
echo ""

# Site 4: Torecacamp
echo "4/9 TESTING: Torecacamp"
echo "   URL: https://torecacamp-pokemon.com/collections/all"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://torecacamp-pokemon.com/collections/all&render=true" > $OUTPUT_DIR/torecacamp.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/torecacamp.html) bytes"
echo "   Products found: $(grep -o 'product' $OUTPUT_DIR/torecacamp.html | wc -l)"
echo ""

# Site 5: Hobibinet
echo "5/9 TESTING: Hobibinet"
echo "   URL: https://hobibinet-pokemon.com"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://hobibinet-pokemon.com&render=true" > $OUTPUT_DIR/hobibinet.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/hobibinet.html) bytes"
echo "   Has products: $(grep -c 'product' $OUTPUT_DIR/hobibinet.html 2>/dev/null || echo '0')"
echo ""

# Site 6: Cardrush
echo "6/9 TESTING: Cardrush"
echo "   URL: https://www.cardrush-pokemon.jp"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://www.cardrush-pokemon.jp&render=true" > $OUTPUT_DIR/cardrush.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/cardrush.html) bytes"
echo "   Title: $(grep -o '<title>[^<]*</title>' $OUTPUT_DIR/cardrush.html | head -1)"
echo ""

# Site 7: Playze
echo "7/9 TESTING: Playze"
echo "   URL: https://playze.jp/collections/pokemon"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://playze.jp/collections/pokemon&render=true" > $OUTPUT_DIR/playze.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/playze.html) bytes"
echo "   Products found: $(grep -o 'product' $OUTPUT_DIR/playze.html | wc -l)"
echo ""

# Site 8: C-Labo
echo "8/9 TESTING: C-Labo"
echo "   URL: https://www.c-labo-online.jp/page/125"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://www.c-labo-online.jp/page/125&render=true" > $OUTPUT_DIR/c-labo.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/c-labo.html) bytes"
echo "   Title: $(grep -o '<title>[^<]*</title>' $OUTPUT_DIR/c-labo.html | head -1)"
echo ""

# Site 9: Fukufuku Toreka
echo "9/9 TESTING: Fukufuku Toreka"
echo "   URL: https://pokemon.fukufukutoreka.com"
curl -s "https://api.scrape.do/?token=${TOKEN}&url=https://pokemon.fukufukutoreka.com&render=true" > $OUTPUT_DIR/fukufukutoreka.html
echo "   Response size: $(wc -c < $OUTPUT_DIR/fukufukutoreka.html) bytes"
echo "   Title: $(grep -o '<title>[^<]*</title>' $OUTPUT_DIR/fukufukutoreka.html | head -1)"
echo ""

echo "================================"
echo "ALL TESTS COMPLETE"
echo "================================"
echo "HTML outputs saved to: $OUTPUT_DIR/"
