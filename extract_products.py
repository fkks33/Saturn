import sys
import os
import re
import json
import sqlite3
import urllib.request
from urllib.parse import urljoin
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

TARGET_URL = "https://www.karamatsu-train.jp/s-kyoto/kyoto-mini21.html"
BASE_URL = "https://www.karamatsu-train.jp/s-kyoto/"
DB_PATH = "products.db"
JSON_PATH = "products.json"


def fetch_html(url: str) -> str:
    """HTMLを取得して文字列として返す"""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def clean_description(raw_text: str) -> tuple[str, str, str]:
    """
    商品説明テキストを整形し、(category, title, full_cleaned_text) を抽出する
    """
    # タグ崩れ由来の不要な空白・改行を補正
    text = re.sub(r'【\s*([^】]+?)\s*】', r'【\1】', raw_text)
    text = re.sub(r'「\s*([^」]+?)\s*」', r'「\1」', text)
    
    # 複数行の整形
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned_desc = "\n".join(lines)
    
    # カテゴリ抽出 (【...】)
    cat_match = re.search(r'【([^】]+)】', cleaned_desc)
    category = cat_match.group(1).strip() if cat_match else ""
    
    # タイトル抽出 (「...」)
    title_match = re.search(r'「([^」]+)」', cleaned_desc)
    title = title_match.group(1).strip() if title_match else ""
    
    return category, title, cleaned_desc


def parse_page(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    
    # 商品一覧テーブルを特定 (bgcolor='#ff33cc')
    table = soup.find("table", bgcolor="#ff33cc")
    if not table:
        raise ValueError("商品テーブルが見つかりませんでした。")
        
    rows = table.find_all("tr")
    items = []
    
    # 5行ごとに1ブロック（管理番号、画像行1、画像行2、説明、価格）
    for block_idx in range(0, len(rows), 5):
        if block_idx + 4 >= len(rows):
            break
            
        r_id = rows[block_idx]
        r_img1 = rows[block_idx + 1]
        r_img2 = rows[block_idx + 2]
        r_desc = rows[block_idx + 3]
        r_price = rows[block_idx + 4]
        
        id_cells = r_id.find_all(["td", "th"])
        desc_cells = r_desc.find_all(["td", "th"])
        price_cells = r_price.find_all(["td", "th"])
        
        # 当該ブロック内のすべての画像タグを取得
        all_imgs = []
        for img in r_img1.find_all("img") + r_img2.find_all("img"):
            src = img.get("src")
            if src:
                all_imgs.append(src)
                
        num_products = len(id_cells)
        
        for col_idx in range(num_products):
            # 1. 管理番号（例: 京都-2115）
            raw_id_text = id_cells[col_idx].get_text(strip=True)
            m = re.search(r'京都[-－]\d+', raw_id_text)
            item_id = m.group(0) if m else raw_id_text.replace("↓", "").strip()
            
            # 2. 画像（管理番号の数字に紐づく画像URLを2〜4枚抽出）
            digits = re.search(r'\d+', item_id).group(0) if re.search(r'\d+', item_id) else ""
            matched_imgs = [urljoin(BASE_URL, s) for s in all_imgs if digits and digits in s]
            
            # 3. 商品説明
            desc_cell = desc_cells[col_idx]
            category, title, cleaned_desc = clean_description(desc_cell.get_text("\n", strip=True))
            
            # 4. 価格 & 販売ステータス
            price_cell = price_cells[col_idx]
            price_raw = price_cell.get_text(" ", strip=True)
            
            # 販売中判定: SOLDOUT, 売約済, 予約済, 商談中 などの文言が含まれている場合は販売停止
            sold_out_keywords = ["SOLDOUT", "SOLD OUT", "売約済", "予約済", "商談中"]
            is_sold = any(kw in price_raw.upper().replace(" ", "") for kw in ["SOLDOUT", "売約済", "予約済", "商談中"])
            is_available = not is_sold
            
            # 価格数値抽出
            price_m = re.search(r'[￥¥]?\s*([0-9,]+)\s*(?:円|\(税込\)|税込)?', price_raw)
            price_val = None
            if price_m:
                try:
                    price_val = int(price_m.group(1).replace(",", ""))
                except ValueError:
                    pass
                    
            items.append({
                "id": item_id,
                "category": category,
                "title": title,
                "images": matched_imgs,
                "description": cleaned_desc,
                "price": price_val,
                "price_raw": price_raw,
                "is_available": is_available,
                "source_url": TARGET_URL
            })
            
    return items


def save_to_json(items: list[dict], filepath: str):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f"JSON出力完了: {filepath} ({len(items)}件)")


def save_to_sqlite(items: list[dict], db_path: str):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        category TEXT,
        title TEXT,
        description TEXT,
        price INTEGER,
        price_raw TEXT,
        is_available INTEGER,
        images TEXT,
        source_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    for item in items:
        cur.execute("""
        INSERT OR REPLACE INTO products (
            id, category, title, description, price, price_raw, is_available, images, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"],
            item["category"],
            item["title"],
            item["description"],
            item["price"],
            item["price_raw"],
            1 if item["is_available"] else 0,
            json.dumps(item["images"], ensure_ascii=False),
            item["source_url"]
        ))
        
    conn.commit()
    conn.close()
    print(f"SQLite保存完了: {db_path} ({len(items)}件)")


def main():
    print(f"ターゲットページを取得中: {TARGET_URL}")
    html = fetch_html(TARGET_URL)
    
    print("HTMLのパース・構造化を実行中...")
    items = parse_page(html)
    
    save_to_json(items, JSON_PATH)
    save_to_sqlite(items, DB_PATH)
    
    print(f"\n合計 {len(items)} 件の商品を正常に抽出・保存しました。")


if __name__ == "__main__":
    main()
