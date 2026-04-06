# md-subdomain-gen

## プロジェクト概要
既存ウェブサイトから AI エージェント最適化マークダウンサブドメインを自動生成する CLI ツール。

## コマンド
- `npm run build` — TypeScript ビルド
- `npm run test` — テスト実行
- `npm run lint` — ESLint 実行
- `npx tsx src/cli.ts` — 開発時の直接実行

## アーキテクチャ
- `src/crawl/` — Playwright ベースのクローラー。CMS 別 extractor で最適な抽出
- `src/transform/` — マークダウン生成。業種別テンプレート + Schema.org インライン
- `src/deploy/` — Cloudflare Workers / GitHub Pages 等へのデプロイ
- `src/sync/` — メインサイトとの同期（webhook / polling）
- `src/validate/` — Schema.org 検証、トークン数比較、正確性チェック

## 重要な設計判断
- Schema.org は JSON-LD ではなくインラインマークダウン形式
- CMS API が使える場合は HTML クロールより API を優先
- Claude API は要約・最適化のみに使用（生成コンテンツのファクトチェック必須）
- トークン効率 90% 以上の削減を目標
