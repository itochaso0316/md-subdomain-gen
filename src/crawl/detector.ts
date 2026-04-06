import { chromium, type Browser, type Page } from 'playwright';

// ── Types ────────────────────────────────────────────────────────────

export type CMSType =
  | 'wordpress'
  | 'shopify'
  | 'webflow'
  | 'wix'
  | 'squarespace'
  | 'static';

interface DetectionRule {
  cms: CMSType;
  check: (page: Page, html: string) => Promise<boolean>;
}

// ── Detection Rules ──────────────────────────────────────────────────

const DETECTION_RULES: DetectionRule[] = [
  {
    cms: 'wordpress',
    check: async (page, html) => {
      // wp-content paths in HTML
      if (/\/wp-content\//.test(html)) return true;

      // meta generator tag
      const generator = await page
        .locator('meta[name="generator"]')
        .getAttribute('content')
        .catch(() => null);
      if (generator && /wordpress/i.test(generator)) return true;

      // WP REST API endpoint
      const wpApiLink = await page
        .locator('link[rel="https://api.w.org/"]')
        .getAttribute('href')
        .catch(() => null);
      if (wpApiLink) return true;

      // /wp-json/ path in any script or link
      if (/\/wp-json\//.test(html)) return true;

      return false;
    },
  },
  {
    cms: 'shopify',
    check: async (_page, html) => {
      if (/cdn\.shopify\.com/.test(html)) return true;
      if (/Shopify\.theme/.test(html)) return true;
      if (/myshopify\.com/.test(html)) return true;
      return false;
    },
  },
  {
    cms: 'webflow',
    check: async (page, html) => {
      if (/webflow\.com/.test(html)) return true;

      // data-wf- attributes anywhere in the document
      const wfAttr = await page.evaluate(() => {
        return document.querySelector('[data-wf-site]') !== null ||
          document.querySelector('[data-wf-page]') !== null;
      }).catch(() => false);
      if (wfAttr) return true;

      return false;
    },
  },
  {
    cms: 'wix',
    check: async (_page, html) => {
      if (/static\.wixstatic\.com/.test(html)) return true;
      if (/wix\.com/.test(html)) return true;
      return false;
    },
  },
  {
    cms: 'squarespace',
    check: async (page, html) => {
      if (/squarespace\.com/.test(html)) return true;

      // sqs- prefixed CSS classes
      const sqsClass = await page.evaluate(() => {
        return document.querySelector('[class*="sqs-"]') !== null;
      }).catch(() => false);
      if (sqsClass) return true;

      return false;
    },
  },
];

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Auto-detect the CMS powering a given URL.
 * Uses Playwright to render the page fully (handles JS-rendered sites).
 * Returns 'static' as the fallback when no CMS is detected.
 */
export async function detectCMS(url: string): Promise<CMSType> {
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent:
        'Mozilla/5.0 (compatible; md-subdomain-gen/0.1; +https://github.com/user/md-subdomain-gen)',
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Allow extra time for JS-heavy sites
    await page.waitForTimeout(2_000);

    const html = await page.content();

    for (const rule of DETECTION_RULES) {
      const matched = await rule.check(page, html);
      if (matched) {
        return rule.cms;
      }
    }

    return 'static';
  } finally {
    await browser?.close();
  }
}
