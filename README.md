# md-subdomain-gen

既存のウェブサイトから AI エージェント最適化されたマークダウンサブドメイン（`md.yourwebsite.com`）のコンテンツを自動生成する CLI ツール。

## Features

- **CMS 自動検出**: WordPress / Shopify / Webflow / Wix / Squarespace / 静的 HTML
- **業種別テンプレート**: 医療機関 / EC / 企業 / 飲食店 / ローカルビジネス
- **Schema.org インライン**: AI エージェントが即座に理解できる構造化データ
- **トークン効率 90%+削減**: HTML 比で大幅なトークン節約
- **Claude API 最適化**: 自然言語コンテキストの自動付与
- **マルチデプロイ**: Cloudflare Workers / GitHub Pages / Netlify / Vercel
- **自動同期**: Webhook / Polling でメインサイトと同期

## Quick Start

```bash
# インストール
npm install -g md-subdomain-gen

# 設定ファイル生成
md-subdomain-gen init

# マークダウン生成
md-subdomain-gen generate https://example.com

# バリデーション
md-subdomain-gen validate ./md-output/

# デプロイ
md-subdomain-gen deploy --platform cloudflare

# トークン比較レポート
md-subdomain-gen report https://example.com
```

## Configuration

`md-subdomain.config.yaml` で設定:

```yaml
site:
  url: "https://example.com"
  name: "Your Site"
  type: "corporate"  # medical / ecommerce / corporate / restaurant / local-business
  language: "ja"

deploy:
  platform: "cloudflare"
  subdomain: "md"
```

## Architecture

```
src/
├── crawl/        # CMS検出 + Playwrightクローラー
├── transform/    # マークダウン生成 + Schema.org + 業種テンプレート
├── deploy/       # Cloudflare Workers / GitHub Pages / etc.
├── sync/         # Webhook / Polling 同期
└── validate/     # スキーマ検証 / トークン計測 / 正確性チェック
```

## License

MIT
