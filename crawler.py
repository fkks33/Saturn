import sys
import os
import re
import json
import sqlite3
import time
import urllib.request
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "https://www.karamatsu-train.jp/s-kyoto/"
INDEX_URL = "https://www.karamatsu-train.jp/kyoto-index.htm"
OUTPUT_JSON = "products.json"
OUTPUT_DB = "products.db"
HISTORY_JSON = "crawl_history.json"
IMAGES_DIR = "images"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def discover_pages() -> list[int]:
    """
    京都店トップページおよび連番チェックを行い、存在するすべてのminiページ番号を返す
    """
    pages = set()
    print("ページ一覧を探索中...")
    
    # 1. トップページからリンク抽出
    try:
        r = requests.get(INDEX_URL, headers=HEADERS, timeout=8)
        if r.status_code == 200:
            soup = BeautifulSoup(r.content, "html.parser")
            for a in soup.find_all("a"):
                href = a.get("href", "")
                m = re.search(r'kyoto-mini(\d+)\.html', href)
                if m:
                    pages.add(int(m.group(1)))
    except Exception as e:
        print(f"トップページの取得エラー: {e}")

    # 2. 7から最新ページ以降（最大+5ページ先まで）を探索し、新ページを検知
    max_known = max(pages) if pages else 21
    for p in range(7, max_known + 6):
        if p in pages:
            continue
        url = f"{BASE_URL}kyoto-mini{p}.html"
        try:
            r = requests.head(url, headers=HEADERS, timeout=4)
            if r.status_code == 200:
                pages.add(p)
                print(f"  -> 新規ページ検知: Page {p}")
        except Exception:
            pass

    sorted_pages = sorted(list(pages))
    print(f"探索完了: 計 {len(sorted_pages)} ページ ({sorted_pages})")
    return sorted_pages


def clean_description(raw_text: str) -> tuple[str, str, str]:
    """
    商品説明テキストを整形し、(category, title, cleaned_desc) を返す
    """
    text = re.sub(r'【\s*([^】]+?)\s*】', r'【\1】', raw_text)
    text = re.sub(r'「\s*([^」]+?)\s*」', r'「\1」', text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned_desc = "\n".join(lines)

    cat_match = re.search(r'【([^】]+)】', cleaned_desc)
    category = cat_match.group(1).strip() if cat_match else "その他"

    # タイトル抽出:
    # 1. 「...」がある場合
    title_match = re.search(r'「([^」\r\n]+)」', cleaned_desc)
    title = ""
    if title_match:
        title = title_match.group(1).strip()
    else:
        # 2. 閉じ括弧が抜けている場合（「の後の行）
        bracket_open_match = re.search(r'「\s*([^\r\n]+)', cleaned_desc)
        if bracket_open_match:
            cand = bracket_open_match.group(1).replace("」", "").strip()
            if cand:
                title = cand

    # 3. それでも取れない場合、カテゴリ行以外の最初の行
    if not title or title in ["「", "」"]:
        for l in lines:
            cleaned_line = l.replace("【", "").replace("】", "").replace("「", "").replace("」", "").strip()
            if cleaned_line and cleaned_line != category:
                title = cleaned_line
                break
    if not title:
        title = category

    return category, title, cleaned_desc


def download_image(url: str, local_path: str) -> bool:
    """
    画像をローカルにダウンロードして保存（既に存在する場合はスキップ）
    """
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return True
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(r.content)
            return True
    except Exception as e:
        print(f"    画像DL失敗: {url} -> {e}")
    return False


def parse_mini_page(page_num: int, download_images: bool = True) -> list[dict]:
    url = f"{BASE_URL}kyoto-mini{page_num}.html"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            print(f"Page {page_num} 取得失敗 (HTTP {r.status_code})")
            return []
    except Exception as e:
        print(f"Page {page_num} 通信エラー: {e}")
        return []

    soup = BeautifulSoup(r.content, "html.parser")
    table = soup.find("table", bgcolor="#ff33cc")
    if not table:
        # フォールバック: テーブルを探す
        for t in soup.find_all("table"):
            if "京都-" in t.get_text():
                table = t
                break
    if not table:
        print(f"Page {page_num}: 商品テーブル未検出")
        return []

    rows = table.find_all("tr")
    # 管理番号（京都-）を含む行インデックスをすべて抽出
    id_row_indices = []
    for idx, row in enumerate(rows):
        txt = row.get_text()
        if re.search(r'京都[-－]\d+', txt):
            id_row_indices.append(idx)

    page_items = []

    for i, r_idx in enumerate(id_row_indices):
        r_id = rows[r_idx]
        # 次のID行または末尾までの行を取得
        next_r_idx = id_row_indices[i + 1] if i + 1 < len(id_row_indices) else len(rows)
        block_rows = rows[r_idx:next_r_idx]

        id_cells = r_id.find_all(["td", "th"])

        # ブロック内の行を内容に基づいて動的に特定（画像行数や空行の揺れを完全吸収）
        price_row = None
        desc_row = None
        img_rows = []

        # 末尾行から逆順走査して価格行・説明文行を特定
        remaining_rows = block_rows[1:]
        for row in reversed(remaining_rows):
            txt = row.get_text().strip()
            # 1. 価格行の判定（￥, ¥, 円, 税込, SOLDOUT, 売約済 等）
            if not price_row and (re.search(r'[￥¥\d,]+円?', txt) or any(k in txt.upper().replace(" ", "") for k in ['SOLDOUT', 'SOLD_OUT', '売約済', '予約済', '商談中', '税込'])):
                price_row = row
                continue
            # 2. 説明文行の判定（価格行の直前にある文字テキスト行、または【, 「を含む行）
            if price_row and not desc_row:
                if len(txt) >= 2 or '【' in txt or '「' in txt:
                    desc_row = row
                    continue
            # 3. 画像タグを含む行は画像行として収集
            if row.find("img"):
                img_rows.append(row)

        desc_cells = desc_row.find_all(["td", "th"]) if desc_row else []
        price_cells = price_row.find_all(["td", "th"]) if price_row else []

        # このブロック内のすべての画像タグからsrcを収集
        all_imgs = []
        for r_img in img_rows:
            all_imgs.extend([img.get("src") for img in r_img.find_all("img") if img.get("src")])

        for col_idx, id_cell in enumerate(id_cells):
            raw_id_text = id_cell.get_text(strip=True)
            m = re.search(r'京都[-－]\d+', raw_id_text)
            item_id = m.group(0) if m else raw_id_text.replace("↓", "").strip()
            if not item_id:
                continue

            digits_m = re.search(r'\d+', item_id)
            digits = digits_m.group(0) if digits_m else ""

            # 画像URLの抽出（元サイト直リンク方式）
            remote_img_urls = []
            for src in all_imgs:
                if digits and digits in src:
                    abs_url = urljoin(BASE_URL, src)
                    if abs_url not in remote_img_urls:
                        remote_img_urls.append(abs_url)

            # フォールバック: 元サイトでファイル名番号がズレている場合、同列位置の画像を救済
            if not remote_img_urls and img_rows:
                for r_img in img_rows:
                    img_cells = r_img.find_all(["td", "th"])
                    if col_idx < len(img_cells):
                        cell_imgs = img_cells[col_idx].find_all("img")
                        for img in cell_imgs:
                            src = img.get("src")
                            if src:
                                abs_url = urljoin(BASE_URL, src)
                                if abs_url not in remote_img_urls:
                                    remote_img_urls.append(abs_url)

            # 説明文
            cleaned_desc = ""
            category = "その他"
            title = ""
            if col_idx < len(desc_cells):
                category, title, cleaned_desc = clean_description(desc_cells[col_idx].get_text("\n", strip=True))

            # 価格・販売状況
            price_raw = ""
            price_val = None
            is_available = True
            if col_idx < len(price_cells):
                price_raw = price_cells[col_idx].get_text(" ", strip=True)
                # SOLD OUT 判定
                is_sold = any(kw in price_raw.upper().replace(" ", "") for kw in ["SOLDOUT", "売約済", "予約済", "商談中"])
                is_available = not is_sold
                # 価格抽出
                pm = re.search(r'[￥¥]?\s*([0-9,]+)\s*(?:円|\(税込\)|税込)?', price_raw)
                if pm:
                    try:
                        price_val = int(pm.group(1).replace(",", ""))
                    except ValueError:
                        pass

            page_items.append({
                "id": item_id,
                "page": page_num,
                "category": category,
                "title": title,
                "description": cleaned_desc,
                "price": price_val,
                "price_raw": price_raw,
                "is_available": is_available,
                "images": remote_img_urls,
                "remote_images": remote_img_urls,
                "source_url": url
            })

    return page_items


def load_existing_data() -> dict[str, dict]:
    """既存の products.json を読み込み、ID辞書として返す"""
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
                items = json.load(f)
                return {item["id"]: item for item in items}
        except Exception as e:
            print(f"既存データの読み込みエラー: {e}")
    return {}


def sort_items_descending(items: list[dict]) -> list[dict]:
    """
    案B: 完全新着順（管理番号降順、最新ページ優先）にソート
    例: 京都-2117 -> 京都-2116 ... -> 京都-701
    """
    def extract_sort_key(item: dict):
        # ページ番号 (降順) と 管理番号の数字 (降順)
        digits = re.search(r'\d+', item.get("id", ""))
        num = int(digits.group(0)) if digits else 0
        page = item.get("page", 0)
        return (page, num)

    return sorted(items, key=extract_sort_key, reverse=True)


def save_to_db(items: list[dict]):
    conn = sqlite3.connect(OUTPUT_DB)
    cur = conn.cursor()
    # テーブル作成または既存チェック
    cur.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        page INTEGER,
        category TEXT,
        title TEXT,
        description TEXT,
        price INTEGER,
        price_raw TEXT,
        is_available INTEGER,
        images TEXT,
        remote_images TEXT,
        source_url TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    # 既存テーブルで page カラムが存在しない場合のマイグレーション
    cur.execute("PRAGMA table_info(products)")
    cols = [row[1] for row in cur.fetchall()]
    if "page" not in cols:
        cur.execute("ALTER TABLE products ADD COLUMN page INTEGER")
    if "remote_images" not in cols:
        cur.execute("ALTER TABLE products ADD COLUMN remote_images TEXT")
    for item in items:
        cur.execute("""
        INSERT OR REPLACE INTO products (
            id, page, category, title, description, price, price_raw, is_available, images, remote_images, source_url, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            item["id"],
            item.get("page", 0),
            item.get("category", ""),
            item.get("title", ""),
            item.get("description", ""),
            item.get("price"),
            item.get("price_raw", ""),
            1 if item.get("is_available") else 0,
            json.dumps(item.get("images", []), ensure_ascii=False),
            json.dumps(item.get("remote_images", []), ensure_ascii=False),
            item.get("source_url", "")
        ))
    conn.commit()
    conn.close()


def record_history(pages_crawled: list[int], total_items: int, updated_count: int, status: str = "success"):
    """直近20件のクロール実行履歴を保存"""
    from datetime import datetime
    history = []
    if os.path.exists(HISTORY_JSON):
        try:
            with open(HISTORY_JSON, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []
    
    new_entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "pages_crawled": pages_crawled,
        "total_items": total_items,
        "updated_count": updated_count,
        "status": status
    }
    
    history.insert(0, new_entry)
    history = history[:20]  # 直近20件
    
    with open(HISTORY_JSON, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"✅ {HISTORY_JSON} に実行履歴を記録しました (直近 {len(history)} 件)")


def run_crawler(pages_to_crawl: list[int] = None, download_imgs: bool = True):
    existing_items = load_existing_data()
    print(f"既存商品件数: {len(existing_items)} 件")

    if not pages_to_crawl:
        pages_to_crawl = discover_pages()

    new_or_updated_count = 0
    
    # ページを大きい順（最新ページから順）にクロール
    for page_num in sorted(pages_to_crawl, reverse=True):
        print(f"\n[Page {page_num}] クロール開始...")
        items = parse_mini_page(page_num, download_images=download_imgs)
        print(f"  -> {len(items)} 件の商品を抽出")
        
        for item in items:
            item_id = item["id"]
            if item_id not in existing_items:
                new_or_updated_count += 1
            else:
                # 差分チェック（価格や在庫状態の更新）
                old = existing_items[item_id]
                if old.get("is_available") != item["is_available"] or old.get("price_raw") != item["price_raw"]:
                    new_or_updated_count += 1
            existing_items[item_id] = item

    all_items = list(existing_items.values())
    
    # 案B: 新着順（管理番号降順）にソート
    sorted_items = sort_items_descending(all_items)

    # JSON保存
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(sorted_items, f, ensure_ascii=False, indent=2)
    print(f"\n✅ products.json を更新しました (合計: {len(sorted_items)} 件, 差分: {new_or_updated_count} 件)")

    # SQLite保存
    save_to_db(sorted_items)
    print(f"✅ {OUTPUT_DB} を更新しました")

    # 履歴保存
    record_history(
        pages_crawled=sorted(pages_to_crawl),
        total_items=len(sorted_items),
        updated_count=new_or_updated_count,
        status="success"
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="カラマツトレイン京都店 MINI入荷速報クローラー")
    parser.add_argument("--pages", type=int, nargs="*", help="クロールするページ番号（指定なしの場合は全ページ）")
    parser.add_argument("--no-images", action="store_true", help="画像のダウンロードをスキップする")
    args = parser.parse_args()

    run_crawler(pages_to_crawl=args.pages, download_imgs=not args.no_images)
