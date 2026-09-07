# カラマツトレイン 京都・天使突抜店 MINI入荷速報 (モダンカタログ)

レガシーなページビルダーで構築された「[カラマツトレイン京都・天使突抜店 入荷速報](https://www.karamatsu-train.jp/kyoto-index.htm)」を、**Material 3 Expressive**（モノトーン仕様）に再構築したモダンカタログサイトです。

GitHub Actions による日次自動差分クローリングと GitHub Pages によるホスティングに対応しています。

---

## 主な機能と特徴

1. **Material 3 Expressive × モノトーン デザイン**
   - ピュアホワイトと漆黒、上質なグレースケールで構成された洗練されたモノトーンUI
   - ライトモード / ダークモードの完全対応（OS連動 ＋ 手動切替トグル）
   - 大胆な角丸（24px / 16px）と流麗なアニメーション
   - スマートフォン・タブレット・PCに最適化されたレスポンシブグリッド

2. **閲覧・検索・操作性**
   - **デフォルト表示**: **案B（完全新着順・時系列アーカイブ重視：最新ページ・管理番号降順）**
   - **ソート切り替え**: 新着順 / 販売中優先 ＋ 新着順 / 価格の安い順 / 価格の高い順 / 管理番号昇順
   - **フィルタリング**:
     - 「販売中のみ表示」トグルスイッチ
     - カテゴリチップ（自動抽出された上位カテゴリごとに絞り込み）
     - インクリメンタル全文検索（管理番号、品名、説明文、年代等）
   - **画像ギャラリー & ライトボックス**:
     - カード上で複数画像（2〜4枚）のサムネイルホバー・タップ切り替え
     - タップで全画面ライトボックス拡大表示（キーボード矢印・スワイプ対応）
   - **お問い合わせ情報**:
     - 各商品に管理番号（例：`京都-2115`）を明記し、電話・FAX（075-365-8128）への問い合わせをスムーズに支援

3. **全自動日次クロール ＆ 差分同期 (GitHub Actions)**
   - 毎日日本時間 午前3:00（UTC 18:00）に自動実行（手動実行ボタンもあり）
   - **新ページ自動検知**: `kyoto-mini22.html` などの新ページ公開を自動検知して取り込み
   - **差分同期**: 商品の価格改定や「SOLD OUT / 予約済」ステータスの更新を自動反映
   - **直リンク方式**: 画像は元サイトのURLを直接参照するため、リポジトリ容量を消費せず高速に動作

---

## プロジェクト構成

```
.
├── .github/workflows/
│   └── daily_crawl.yml       # GitHub Actions ワークフロー（日次クロール＆Pagesデプロイ）
├── index.html                # メインWebページ (Material 3 Expressive)
├── style.css                 # スタイルシート (モノトーン / ライト・ダーク)
├── app.js                    # フロントエンド制御 (検索・フィルタ・ソート・モーダル)
├── crawler.py                # 全ページ差分クローラー (新ページ自動探索機能付き)
├── products.json             # 統合商品データベース (JSON形式 / 1,300件以上)
├── products.db               # SQLite データベース
├── requirements.txt          # Python 依存関係 (requests, beautifulsoup4)
├── .gitignore
└── README.md
```

---

## ローカルでの起動・確認方法

Pythonの組み込みHTTPサーバーで即座にプレビュー可能です：

```bash
# ワークスペース直下で実行
python -m http.server 8000
```
ブラウザで `http://localhost:8000` を開きます。

---

## 手動でのデータ更新方法

```bash
# 全ページを再クロールして products.json と products.db を更新
python crawler.py

# 特定ページのみクロールする場合（例: Page 21 のみ）
python crawler.py --pages 21
```

---

## GitHub Pages の公開設定手順

1. 本リポジトリ（`https://github.com/fkks33/Saturn.git`）をプッシュします：
   ```bash
   git add .
   git commit -m "feat: initial commit with modern catalog and daily crawler"
   git push -u origin main
   ```
2. GitHubのリポジトリページで **[Settings] -> [Pages]** に進みます。
3. **Build and deployment** の **Source** を **`GitHub Actions`** に設定します。
4. これにより、ワークフロー（`daily_crawl.yml`）が実行されると自動的にサイトが公開されます。
