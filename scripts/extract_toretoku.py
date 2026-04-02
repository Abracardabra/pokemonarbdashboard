#!/usr/bin/env python3
"""
Extract Toretoku data from prices.json.

This script:
1. Counts how many cards have Toretoku data
2. Shows sample entries with URLs
3. Extracts detail IDs from the URLs
"""

import json
import re
from collections import defaultdict
from pathlib import Path


def extract_detail_id(url: str) -> str | None:
    """Extract detail ID from Toretoku URL.
    
    URL format: https://www.toretoku.jp/item/details/131835
    Returns: 131835
    """
    if not url:
        return None
    match = re.search(r'/details/(\d+)$', url)
    return match.group(1) if match else None


def main():
    # Load prices.json
    prices_path = Path(__file__).parent.parent / 'data' / 'prices.json'
    
    print(f"Loading {prices_path}...")
    with open(prices_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # prices.json structure: { "meta": {...}, "cards": [...] }
    cards = data.get('cards', [])
    print(f"Total cards in database: {len(cards)}")
    
    # Find cards with Toretoku data
    cards_with_toretoku = []
    all_detail_ids = []
    
    for card in cards:
        toretoku = card.get('toretoku')
        if not toretoku:
            continue
        
        # Check if has any grade data (A or B)
        grade_a = toretoku.get('a')
        grade_b = toretoku.get('b')
        
        if grade_a or grade_b:
            card_info = {
                'name': card.get('name', 'Unknown'),
                'set': card.get('set', 'Unknown'),
                'number': card.get('number', 'Unknown'),
                'rarity': card.get('rarity', 'Unknown'),
                'grade_a': grade_a,
                'grade_b': grade_b,
                'stock_a': toretoku.get('stockA'),
                'stock_b': toretoku.get('stockB'),
            }
            cards_with_toretoku.append(card_info)
            
            # Extract detail IDs
            if grade_a and grade_a.get('url'):
                detail_id = extract_detail_id(grade_a['url'])
                if detail_id:
                    all_detail_ids.append({
                        'id': detail_id,
                        'grade': 'A',
                        'card': card.get('name'),
                        'url': grade_a['url']
                    })
            
            if grade_b and grade_b.get('url'):
                detail_id = extract_detail_id(grade_b['url'])
                if detail_id:
                    all_detail_ids.append({
                        'id': detail_id,
                        'grade': 'B',
                        'card': card.get('name'),
                        'url': grade_b['url']
                    })
    
    # Report results
    print("\n" + "=" * 60)
    print("TORETODU DATA EXTRACTION REPORT")
    print("=" * 60)
    
    print(f"\n1. CARDS WITH TORETODU DATA: {len(cards_with_toretoku)}")
    print(f"   - Percentage of total: {len(cards_with_toretoku)/len(cards)*100:.1f}%")
    
    # Count by grade availability
    with_a_only = sum(1 for c in cards_with_toretoku if c['grade_a'] and not c['grade_b'])
    with_b_only = sum(1 for c in cards_with_toretoku if c['grade_b'] and not c['grade_a'])
    with_both = sum(1 for c in cards_with_toretoku if c['grade_a'] and c['grade_b'])
    
    print(f"\n   Breakdown:")
    print(f"   - Grade A only: {with_a_only}")
    print(f"   - Grade B only: {with_b_only}")
    print(f"   - Both grades:  {with_both}")
    
    print(f"\n2. TOTAL DETAIL IDs EXTRACTED: {len(all_detail_ids)}")
    
    # Show unique IDs count
    unique_ids = set(d['id'] for d in all_detail_ids)
    print(f"   - Unique detail IDs: {len(unique_ids)}")
    
    # Show sample entries
    print("\n3. SAMPLE ENTRIES (first 5 cards with Toretoku data):")
    print("-" * 60)
    
    for i, card in enumerate(cards_with_toretoku[:5], 1):
        print(f"\n   Card {i}: {card['name']}")
        print(f"   Set: {card['set']} | Number: {card['number']} | Rarity: {card['rarity']}")
        
        if card['grade_a']:
            url_a = card['grade_a'].get('url', 'N/A')
            detail_id_a = extract_detail_id(url_a) if url_a else None
            print(f"   Grade A: ¥{card['grade_a'].get('priceJPY', 'N/A'):,}")
            print(f"            URL: {url_a}")
            print(f"            Detail ID: {detail_id_a}")
            print(f"            Stock: {card['stock_a']}")
        
        if card['grade_b']:
            url_b = card['grade_b'].get('url', 'N/A')
            detail_id_b = extract_detail_id(url_b) if url_b else None
            print(f"   Grade B: ¥{card['grade_b'].get('priceJPY', 'N/A'):,}")
            print(f"            URL: {url_b}")
            print(f"            Detail ID: {detail_id_b}")
            print(f"            Stock: {card['stock_b']}")
    
    # Show some extracted detail IDs
    print("\n4. EXTRACTED DETAIL IDs (first 10):")
    print("-" * 60)
    
    for entry in all_detail_ids[:10]:
        print(f"   {entry['id']} (Grade {entry['grade']}) - {entry['card']}")
    
    # Summary by set
    print("\n5. CARDS WITH TORETODU DATA BY SET:")
    print("-" * 60)
    
    by_set = defaultdict(int)
    for card in cards_with_toretoku:
        by_set[card['set']] += 1
    
    for set_code, count in sorted(by_set.items()):
        print(f"   {set_code}: {count} cards")
    
    print("\n" + "=" * 60)
    print("END OF REPORT")
    print("=" * 60)


if __name__ == '__main__':
    main()
