# md-subdomain-gen — AI対応マークダウンサブドメイン自動生成OSS

## 仕様書 v0.1

---

## 1. プロジェクト概要

### 1.1 何を作るか

既存のウェブサイトから AI エージェント最適化されたマークダウンサブドメイン（`md.yourwebsite.com`）のコンテンツを自動生成する Claude Code 用 CLI ツール。

### 1.2 解決する課題

- AI エージェントが通常の HTML サイトをクロールすると、大量のトークンを消費する（平均 188,966 トークン → 最適化後 1,287 トークン）
- Schema.org 構造化データと自然言語コンテキストが分離している（JSON-LD の課題）
- メインサイト更新時にマークダウン版との同期が手動では破綻する
- サイトの種類（WordPress / Shopify / 静的 / Webflow 等）ごとに最適なアプローチが異なる

### 1.3 ターゲットユーザー

- Claude Code を使う開発者・コンサルタント
- クライアントサイトの AI 対応を請け負うデジタルエージェンシー
- 自社サイトを AI 検索に最適化したい中小企業

### 1.4 OSS ライセンス

MIT License

---

## 2. アーキテクチャ

### 2.1 全体構成

```
md-subdomain-gen/
├── CLAUDE.md                    # Claude Code 用プロジェクト指示書
├── src/
│   ├── crawl/                   # サイトクローリング＆コンテンツ抽出
│   │   ├── crawler.ts           # メインクローラー（Playwright ベース）
│   │   ├── extractors/          # CMS 別抽出ロジック
│   │   │   ├── wordpress.ts
│   │   │   ├── shopify.ts
│   │   │   ├── webflow.ts
│   │   │   ├── static.ts        # 汎用 HTML
│   │   │   └── detector.ts      # CMS 自動判定
│   │   └── content-map.ts       # サイトマップ → コンテンツマップ変換
│   │
│   ├── transform/               # コンテンツ → AI最適化マークダウン変換
│   │   ├── markdown-builder.ts  # マークダウン生成エンジン
│   │   ├── schema-injector.ts   # インライン Schema.org ラベル付与
│   │   ├── templates/           # 業種別テンプレート
│   │   │   ├── medical.ts       # 医療機関（クリニック・病院）
│   │   │   ├── ecommerce.ts     # EC サイト（商品・価格・レビュー）
│   │   │   ├── corporate.ts     # 企業サイト（サービス・会社概要）
│   │   │   ├── restaurant.ts    # 飲食店（メニュー・営業時間・予約）
│   │   │   └── local-business.ts # ローカルビジネス汎用
│   │   └── llm-optimizer.ts     # Claude API でコンテンツ要約・最適化
│   │
│   ├── deploy/                  # デプロイメント
│   │   ├── cloudflare-worker.ts # Cloudflare Workers デプロイ
│   │   ├── github-pages.ts      # GitHub Pages デプロイ
│   │   ├── netlify.ts           # Netlify デプロイ
│   │   ├── vercel.ts            # Vercel デプロイ
│   │   └── robots-txt.ts        # robots.txt 自動更新
│   │
│   ├── sync/                    # メインサイトとの同期
│   │   ├── watcher.ts           # 変更検知（webhook / polling）
│   │   ├── diff-engine.ts       # 差分検出＆マークダウン再生成
│   │   └── scheduler.ts         # 定期同期スケジューラー
│   │
│   ├── validate/                # 品質検証
│   │   ├── schema-validator.ts  # Schema.org バリデーション
│   │   ├── token-counter.ts     # トークン数計測（最適化前後比較）
│   │   ├── accuracy-checker.ts  # 元サイトとの情報一致チェック
│   │   └── ai-test.ts           # AI エージェントでの実テスト
│   │
│   └── cli.ts                   # CLI エントリーポイント
│
├── config/
│   ├── default.yaml             # デフォルト設定
│   └── schema-mappings.yaml     # Schema.org マッピング定義
│
├── templates/
│   ├── cloudflare-worker/       # Workers テンプレート
│   │   └── worker.ts
│   └── robots-txt.template      # robots.txt テンプレート
│
├── tests/
├── docs/
│   ├── getting-started.md
│   ├── cms-guides/
│   │   ├── wordpress.md
│   │   ├── shopify.md
│   │   └── webflow.md
│   └── schema-reference.md
│
├── package.json
├── tsconfig.json
└── README.md
```

### 2.2 処理フロー

```
[入力: サイトURL]
     │
     ▼
┌─────────────────┐
│ 1. CMS 自動判定  │  WordPress / Shopify / Webflow / 静的 HTML / その他
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. クロール＆抽出 │  Playwright でレンダリング → コンテンツ抽出
└────────┬────────┘  ※ CMS 別に最適な抽出ロジックを適用
         │
         ▼
┌─────────────────┐
│ 3. コンテンツ分析 │  ページ種別判定（トップ / サービス / 商品 / 会社概要 等）
└────────┬────────┘  業種推定（医療 / EC / 飲食 / 企業 等）
         │
         ▼
┌─────────────────┐
│ 4. マークダウン   │  テンプレート選択 → マークダウン生成
│    変換＆最適化   │  インライン Schema.org ラベル付与
└────────┬────────┘  Claude API で自然言語コンテキスト最適化
         │
         ▼
┌─────────────────┐
│ 5. バリデーション │  Schema.org 検証 / トークン数比較 / 情報一致チェック
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. デプロイ      │  Cloudflare Workers / GitHub Pages / Netlify 等
└────────┬────────┘  robots.txt 更新 / DNS 設定ガイド出力
         │
         ▼
[出力: md.yoursite.com で稼働]
```

---

## 3. 機能仕様

### 3.1 CLI コマンド体系

```bash
# 初期化（対話形式でサイト情報を入力）
npx md-subdomain-gen init

# サイトをクロールしてマークダウン生成
npx md-subdomain-gen generate https://example.com

# 特定ページのみ生成
npx md-subdomain-gen generate https://example.com --pages /,/services,/about

# 既存マークダウンを検証
npx md-subdomain-gen validate ./output/

# デプロイ
npx md-subdomain-gen deploy --platform cloudflare

# 同期（メインサイトの変更を検出してマークダウン更新）
npx md-subdomain-gen sync

# トークン比較レポート
npx md-subdomain-gen report https://example.com
```

### 3.2 設定ファイル（md-subdomain.config.yaml）

```yaml
# サイト基本情報
site:
  url: "https://misao-ladies.jp"
  name: "操レディスホスピタル"
  type: "medical"                    # medical / ecommerce / corporate / restaurant / local-business / custom
  language: "ja"

# CMS 設定（自動検出も可能）
cms:
  type: "wordpress"                  # wordpress / shopify / webflow / static / auto
  api_endpoint: "https://misao-ladies.jp/wp-json/wp/v2"  # WP REST API（WordPress の場合）

# クロール設定
crawl:
  max_pages: 50                      # 最大クロールページ数
  include_paths:                     # クロール対象パス（指定しなければ全体）
    - /
    - /services/*
    - /doctors/*
    - /access
    - /about
  exclude_paths:                     # 除外パス
    - /admin/*
    - /wp-admin/*
    - /cart/*
  respect_robots_txt: true
  delay_ms: 1000                     # リクエスト間隔

# マークダウン生成設定
transform:
  use_llm: true                      # Claude API でコンテンツ最適化
  llm_model: "claude-sonnet-4-20250514"
  schema_types:                      # 使用する Schema.org タイプ
    - MedicalOrganization
    - MedicalClinic
    - Physician
    - MedicalProcedure
  custom_context: |                  # 追加コンテキスト（LLM に渡す業種固有情報）
    産婦人科・婦人科クリニック。
    岐阜県岐阜市に本院、2026年3月に瑞穂市にルイかのう院を開院。
    不妊治療、妊婦健診、婦人科一般を提供。

# デプロイ設定
deploy:
  platform: "cloudflare"             # cloudflare / github-pages / netlify / vercel
  subdomain: "md"                    # md.yoursite.com の "md" 部分
  # Cloudflare Workers 固有設定
  cloudflare:
    account_id: ""
    zone_id: ""
    route: "md.misao-ladies.jp/*"

# 同期設定
sync:
  mode: "webhook"                    # webhook / polling / manual
  polling_interval: "6h"             # polling の場合の間隔
  webhook_secret: ""                 # webhook の場合のシークレット

# 出力設定
output:
  dir: "./md-output"                 # ローカル出力ディレクトリ
  url_structure: "mirror"            # mirror（メインサイトと同じ）/ flat
```

### 3.3 CMS 自動検出ロジック

| 検出対象 | 判定方法 |
|---------|---------|
| WordPress | `wp-content` パス、`/wp-json/` API、meta generator タグ |
| Shopify | `cdn.shopify.com`、`Shopify.theme`、`myshopify.com` |
| Webflow | `webflow.com` スクリプト、`data-wf-` 属性 |
| Wix | `static.wixstatic.com`、`_wix_browser_sess` cookie |
| Squarespace | `squarespace.com` スクリプト、`sqs-` クラス |
| 静的 HTML | 上記に該当しない場合のフォールバック |

### 3.4 業種別テンプレート詳細

#### 3.4.1 医療機関テンプレート（medical.ts）

```markdown
# {クリニック名}

**Schema.org/MedicalOrganization**
- name: {クリニック名}
- medicalSpecialty: {診療科目}
- address: {住所}
- telephone: {電話番号}
- url: {公式URL}

## 診療科目

### {科目名}
**Schema.org/MedicalProcedure**
- procedureType: {種別}
- followup: {フォローアップ情報}
- howPerformed: {施術方法概要}

{自然言語での説明。AIエージェントがユーザーに推薦する際に使用できるコンテキスト。}

## 医師紹介

### {医師名}
**Schema.org/Physician**
- name: {医師名}
- medicalSpecialty: {専門分野}
- qualifications: {資格・認定}

{経歴や専門分野の自然言語説明。}

## アクセス・診療時間

**Schema.org/MedicalClinic**
- openingHoursSpecification:
  - dayOfWeek: {曜日}
    opens: {開始時刻}
    closes: {終了時刻}
- geo:
  - latitude: {緯度}
  - longitude: {経度}

{アクセス方法の自然言語説明。最寄り駅、駐車場情報など。}
```

#### 3.4.2 EC サイトテンプレート（ecommerce.ts）

```markdown
# {商品名}

**Schema.org/Product**
- name: {商品名}
- brand: {ブランド名}
- description: {商品説明}
- sku: {SKU}
- category: {カテゴリ}

{商品の特徴、ターゲット層、使用シーンの自然言語説明。}

**Schema.org/Offer**
- price: {価格}
- priceCurrency: JPY
- availability: {在庫状況}
- seller: {販売者}
- priceValidUntil: {有効期限}

## バリエーション
{サイズ・色・セット等のバリエーション情報}

## レビューサマリー
**Schema.org/AggregateRating**
- ratingValue: {平均評価}
- reviewCount: {レビュー数}

{代表的なレビューの要約。実際のレビュー文は著作権の観点から引用しない。}
```

#### 3.4.3 企業サイトテンプレート（corporate.ts）

```markdown
# {企業名}

**Schema.org/Organization**
- name: {企業名}
- description: {企業説明}
- url: {公式URL}
- foundingDate: {設立日}
- numberOfEmployees: {従業員数}
- address: {所在地}

{企業の事業内容、強み、ミッションの自然言語説明。}

## サービス一覧

### {サービス名}
**Schema.org/Service**
- serviceType: {サービス種別}
- provider: {提供者}
- areaServed: {対象エリア}
- audience: {対象顧客}

**Schema.org/Offer**
- price: {価格体系}
- priceCurrency: JPY

{サービスの詳細説明。導入メリット、実績など。}
```

### 3.5 マークダウン生成の品質基準

1. **トークン効率**: 元 HTML 比で 90% 以上のトークン削減を目標
2. **情報完全性**: 元サイトの主要情報（価格・連絡先・サービス内容）を 100% 保持
3. **Schema.org 準拠**: validator.schema.org でエラーゼロ
4. **自然言語コンテキスト**: 各セクションに AI エージェントが推薦文脈で使える 2〜3 文の説明を含む
5. **URL 構造の一貫性**: メインサイトの URL パスと 1:1 対応

---

## 4. Cloudflare Workers デプロイテンプレート

### 4.1 Worker コード

```typescript
// テンプレート: md-subdomain Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname === '/' ? '/index' : url.pathname;

    // マークダウンファイルを KV から取得
    const key = `md:${path.replace(/\/$/, '')}`;
    const content = await env.MD_CONTENT.get(key);

    if (!content) {
      return new Response('# 404 Not Found\n\nこのページは存在しません。', {
        status: 404,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
      });
    }

    // User-Agent に応じてレスポンス形式を分岐
    const ua = request.headers.get('user-agent') || '';
    const isAIAgent = /GPTBot|ChatGPT|Claude|Anthropic|PerplexityBot|Bytespider|Google-Extended/i.test(ua);

    const headers = new Headers({
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Format': 'markdown+schema.org',
      'X-Source-Site': env.SOURCE_SITE_URL,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });

    // AI エージェント用のヒント
    if (isAIAgent) {
      headers.set('X-AI-Optimized', 'true');
      headers.set('X-Token-Estimate', String(Math.ceil(content.length / 4)));
    }

    return new Response(content, { headers });
  }
};

interface Env {
  MD_CONTENT: KVNamespace;
  SOURCE_SITE_URL: string;
}
```

### 4.2 KV へのアップロードスクリプト

```typescript
// md-output/ 内のマークダウンファイルを Cloudflare KV にアップロード
async function uploadToKV(outputDir: string, kvNamespace: string) {
  const files = glob.sync(`${outputDir}/**/*.md`);

  for (const file of files) {
    const relativePath = path.relative(outputDir, file);
    const key = `md:/${relativePath.replace(/\.md$/, '').replace(/\/index$/, '')}`;
    const content = fs.readFileSync(file, 'utf-8');

    await wrangler.kv.put(kvNamespace, key, content);
    console.log(`Uploaded: ${key}`);
  }
}
```

---

## 5. robots.txt 更新仕様

### 5.1 追加するディレクティブ

```
# AI-Optimized Content Available
# Markdown version with Schema.org markup for AI agents
Markdown-Site: https://md.yourwebsite.com

# AI agents are welcome to use the optimized version
User-agent: GPTBot
Allow: /
Markdown-Alt: https://md.yourwebsite.com

User-agent: ChatGPT-User
Allow: /
Markdown-Alt: https://md.yourwebsite.com

User-agent: Claude-Web
Allow: /
Markdown-Alt: https://md.yourwebsite.com

User-agent: PerplexityBot
Allow: /
Markdown-Alt: https://md.yourwebsite.com

User-agent: Bytespider
Allow: /
Markdown-Alt: https://md.yourwebsite.com
```

### 5.2 注意事項

- `Markdown-Site` および `Markdown-Alt` は非標準ディレクティブ（まだ業界標準は存在しない）
- The Prompting Company が提唱する形式に準拠
- 将来的に標準化された場合に追従しやすい構造にする

---

## 6. 同期メカニズム

### 6.1 Webhook 方式（推奨）

```
[CMS 更新] → [Webhook 発火] → [差分検出] → [該当ページ再生成] → [KV 更新]
```

対応 Webhook ソース:
- WordPress: `post_updated` アクション（WP REST API / WPGraphQL）
- Shopify: `products/update`, `pages/update` Webhook
- Webflow: CMS Item Changed Webhook

### 6.2 Polling 方式

```
[cron / スケジューラー] → [サイトマップ比較] → [変更ページ検出] → [再クロール] → [再生成] → [KV 更新]
```

- サイトマップの `<lastmod>` を比較
- コンテンツハッシュで実際の変更を確認
- 差分がある場合のみ再生成（API コスト節約）

### 6.3 手動方式

```bash
# 特定ページを手動で再生成
npx md-subdomain-gen sync --pages /services/fertility

# 全ページを強制再生成
npx md-subdomain-gen sync --force
```

---

## 7. 技術スタック

### 7.1 コア依存関係

| パッケージ | 用途 | バージョン |
|-----------|------|----------|
| typescript | 型安全な開発 | ^5.x |
| playwright | ブラウザベースクロール | ^1.x |
| unified / remark | マークダウン処理 | latest |
| commander | CLI フレームワーク | ^12.x |
| yaml | 設定ファイルパース | ^2.x |
| wrangler | Cloudflare Workers デプロイ | ^3.x |
| @anthropic-ai/sdk | Claude API 呼び出し | latest |
| zod | スキーマバリデーション | ^3.x |
| tiktoken | トークン数計測 | latest |

### 7.2 オプション依存関係

| パッケージ | 用途 | 条件 |
|-----------|------|------|
| @octokit/rest | GitHub Pages デプロイ | deploy.platform === 'github-pages' |
| netlify | Netlify デプロイ | deploy.platform === 'netlify' |

### 7.3 開発環境要件

- Node.js >= 20
- Claude Code（Claude Code から直接実行する場合）
- Cloudflare アカウント（Workers デプロイの場合）
- Anthropic API キー（LLM 最適化使用時）

---

## 8. Claude Code 統合

### 8.1 CLAUDE.md

```markdown
# md-subdomain-gen

## プロジェクト概要
既存ウェブサイトから AI エージェント最適化マークダウンサブドメインを自動生成する CLI ツール。

## コマンド
- `npm run build` — TypeScript ビルド
- `npm run test` — テスト実行
- `npm run lint` — ESLint 実行
- `npx tsx src/cli.ts` — 開発時の直接実行

## アーキテクチャ
- crawl/: Playwright ベースのクローラー。CMS 別 extractor で最適な抽出
- transform/: マークダウン生成。業種別テンプレート + Schema.org インライン
- deploy/: Cloudflare Workers / GitHub Pages 等へのデプロイ
- sync/: メインサイトとの同期（webhook / polling）
- validate/: Schema.org 検証、トークン数比較、正確性チェック

## 重要な設計判断
- Schema.org は JSON-LD ではなくインラインマークダウン形式
- CMS API が使える場合は HTML クロールより API を優先
- Claude API は要約・最適化のみに使用（生成コンテンツのファクトチェック必須）
- トークン効率 90% 以上の削減を目標
```

### 8.2 Claude Code での使い方（想定ワークフロー）

```bash
# Claude Code 内で操レディスのサイトを AI 対応化する例

# 1. ツールをインストール
npm install -g md-subdomain-gen

# 2. 設定ファイルを生成（対話形式）
md-subdomain-gen init
# → サイトURL、業種、CMS種別、デプロイ先を入力

# 3. マークダウン生成
md-subdomain-gen generate https://misao-ladies.jp --pages /,/services,/doctors,/access

# 4. 生成結果を確認・手動調整
# → md-output/ 内のマークダウンを Claude Code で編集

# 5. バリデーション
md-subdomain-gen validate ./md-output/

# 6. デプロイ
md-subdomain-gen deploy --platform cloudflare

# 7. テスト
md-subdomain-gen report https://misao-ladies.jp
```

---

## 9. 出力例

### 9.1 操レディスホスピタルの場合（想定出力）

```markdown
# 操レディスホスピタル

**Schema.org/MedicalOrganization**
- name: 操レディスホスピタル
- medicalSpecialty: 産婦人科, 婦人科
- address: 岐阜県岐阜市光樹町38
- telephone: 058-233-8811
- url: https://misao-ladies.jp

岐阜県岐阜市の産婦人科・婦人科クリニックです。不妊治療から妊婦健診、一般婦人科診療まで、女性のライフステージに寄り添った医療を提供しています。2026年3月には瑞穂市に分院「操レディス ルイかのう院」を開院しました。

---

## 診療内容

### 不妊治療
**Schema.org/MedicalProcedure**
- procedureType: 不妊治療
- category: 生殖医療

タイミング法から人工授精、体外受精まで、段階的な不妊治療を提供しています。患者さまの状況に応じた個別の治療計画を立案します。

### 妊婦健診
**Schema.org/MedicalProcedure**
- procedureType: 妊婦健診
- category: 産科

妊娠初期から出産まで、定期的な健診を通じて母子の健康を管理します。4D超音波検査にも対応しています。

---

## アクセス

**Schema.org/MedicalClinic**
- openingHoursSpecification:
  - dayOfWeek: Monday, Tuesday, Wednesday, Thursday, Friday
    opens: 09:00
    closes: 12:00
  - dayOfWeek: Monday, Tuesday, Wednesday, Thursday, Friday
    opens: 16:00
    closes: 19:00
  - dayOfWeek: Saturday
    opens: 09:00
    closes: 12:00
- geo:
  - latitude: 35.4437
  - longitude: 136.7614

JR岐阜駅からバス約15分。専用駐車場完備（30台）。

---

## 分院情報

### 操レディス ルイかのう院
**Schema.org/MedicalClinic**
- name: 操レディス ルイかのう院
- address: 岐阜県瑞穂市（詳細住所）
- openingDate: 2026-03-16
- parentOrganization: 操レディスホスピタル

2026年3月16日開院。瑞穂市エリアの患者さまにより身近な婦人科医療を提供します。
```

### 9.2 EMILUS の場合（想定出力）

```markdown
# EMILUS フェイスミスト

**Schema.org/Product**
- name: EMILUS フェイスミスト
- brand: EMILUS（ニコニコのり株式会社）
- description: 海苔由来の保湿成分を配合したフェイスミスト
- category: スキンケア > ミスト化粧水

海苔の製造で培った海藻由来成分の知見を活かした、ユニークなフェイスミストです。40代〜50代女性の肌悩みに特化した処方設計。

**Schema.org/Offer**
- price: 3980
- priceCurrency: JPY
- availability: InStock
- seller: ニコニコのり株式会社
- priceSpecification:
  - 通常価格: ¥3,980（税込・送料無料）
  - 初回限定: ¥2,100（税込）
  - 2本セット: ¥5,000（税込）
  - 3本セット: ¥6,600（税込）

**Schema.org/AggregateRating**
- ratingValue: （楽天レビュー平均）
- reviewCount: （レビュー件数）

## 購入チャネル
- 楽天市場: {楽天URL}
- Amazon: {Amazon URL}
```

---

## 10. ロードマップ

### Phase 1（MVP — 2週間）
- [ ] CLI 基本構造（init / generate / validate）
- [ ] 汎用 HTML クローラー（Playwright）
- [ ] 基本マークダウン変換（Schema.org インライン）
- [ ] Cloudflare Workers デプロイ
- [ ] robots.txt 更新
- [ ] トークン数比較レポート

### Phase 2（CMS 対応 — 2週間）
- [ ] WordPress REST API 対応
- [ ] Shopify API 対応
- [ ] CMS 自動検出
- [ ] 業種別テンプレート（医療・EC・企業）

### Phase 3（同期＆自動化 — 2週間）
- [ ] Webhook 同期（WordPress / Shopify）
- [ ] Polling 同期（汎用）
- [ ] GitHub Actions テンプレート
- [ ] Claude API 最適化（コンテンツ要約）

### Phase 4（拡張 — 継続）
- [ ] MCP エンドポイント対応（将来の標準化に備える）
- [ ] llms.txt 対応
- [ ] 多言語対応
- [ ] ダッシュボード UI（AI エージェントアクセス分析）
- [ ] プラグインシステム（カスタム CMS / テンプレート）

---

## 11. 競合・関連プロジェクトとの差別化

| | md-subdomain-gen | The Prompting Company | Scrunch AI |
|---|---|---|---|
| 形態 | OSS（無料） | SaaS（有料） | SaaS（有料） |
| カスタマイズ性 | 完全自由 | プラットフォーム制約あり | プラットフォーム制約あり |
| CMS 対応 | 主要 CMS + 拡張可能 | 不明 | 不明 |
| デプロイ先 | 選択可能 | 自社インフラ | 自社インフラ |
| Schema.org | インラインマークダウン | 独自形式 | HTML ベース |
| 同期 | Webhook / Polling | 自動 | 自動 |
| Claude Code 統合 | ネイティブ | なし | なし |
| 日本語対応 | 最初から対応 | 英語中心 | 英語中心 |

---

## 12. 必要な情報・未決定事項

### 12.1 実装前に決める必要があること

1. **リポジトリ名**: `md-subdomain-gen` / `ai-ready-site` / `mdsite` / その他
2. **パッケージマネージャー**: npm / pnpm / bun
3. **Anthropic API キーの扱い**: 環境変数 / .env / CLI 入力
4. **デフォルトデプロイ先**: Cloudflare Workers を第一優先で良いか
5. **llms.txt との関係**: llms.txt 生成も統合するか、別ツールとするか
6. **料金ページの扱い**: 動的な価格情報はどこまで自動取得するか

### 12.2 今後の調査が必要な項目

1. AI エージェントの `Markdown-Site` / `Markdown-Alt` robots.txt ディレクティブ対応状況
2. Google / OpenAI / Anthropic の AI クローラーの最新 User-Agent 仕様
3. Schema.org のマークダウンインライン記法の業界動向
4. MCP の標準化スケジュールと、サブドメイン戦略からの移行パス
5. llms.txt（`llmstxt.org`）との統合可能性
