import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { CrawlConfig } from '../config.js';
import type { CMSType } from './detector.js';

// ── Types ────────────────────────────────────────────────────────────

export interface PageContent {
  /** Fully-qualified URL of the crawled page. */
  url: string;
  /** URL path component (e.g. "/about/team"). */
  path: string;
  /** Page <title> content. */
  title: string;
  /** Raw HTML of the page. */
  html: string;
  /** Visible text content. */
  text: string;
  /** <meta> tag key/value pairs (name/property -> content). */
  meta: Record<string, string>;
  /** JSON-LD structured data blocks found on the page. */
  structuredData: unknown[];
}

export interface CrawlSiteConfig extends CrawlConfig {
  url: string;
  cms: CMSType;
}

// ── Internal Helpers ─────────────────────────────────────────────────

function matchesPattern(path: string, pattern: string): boolean {
  // Simple glob: "*" matches any segment, "**" not needed for now
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '[^/]*').replace(/\.\./g, '.*') + '$',
  );
  return regex.test(path);
}

function isAllowed(
  path: string,
  includePaths: string[],
  excludePaths: string[],
): boolean {
  if (excludePaths.some((p) => matchesPattern(path, p))) return false;
  if (includePaths.length === 0) return true;
  return includePaths.some((p) => matchesPattern(path, p));
}

async function extractMeta(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const meta: Record<string, string> = {};
    document.querySelectorAll('meta[name], meta[property]').forEach((el) => {
      const key =
        el.getAttribute('name') || el.getAttribute('property') || '';
      const content = el.getAttribute('content') || '';
      if (key) meta[key] = content;
    });
    return meta;
  });
}

async function extractStructuredData(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    const results: unknown[] = [];
    scripts.forEach((el) => {
      try {
        results.push(JSON.parse(el.textContent || ''));
      } catch {
        // skip malformed JSON-LD
      }
    });
    return results;
  });
}

async function fetchSitemapUrls(
  baseUrl: string,
  context: BrowserContext,
): Promise<string[]> {
  const urls: string[] = [];
  const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;

  try {
    const page = await context.newPage();
    const response = await page.goto(sitemapUrl, { timeout: 15_000 });
    if (response && response.ok()) {
      const text = await page.innerText('body');
      // Extract <loc> values from sitemap XML rendered as text
      const locMatches = text.match(/https?:\/\/[^\s<]+/g);
      if (locMatches) urls.push(...locMatches);
    }
    await page.close();
  } catch {
    // sitemap not available — will rely on link discovery
  }

  return urls;
}

async function fetchRobotsTxt(
  baseUrl: string,
  context: BrowserContext,
): Promise<string[]> {
  const disallowed: string[] = [];

  try {
    const page = await context.newPage();
    const response = await page.goto(
      new URL('/robots.txt', baseUrl).href,
      { timeout: 10_000 },
    );
    if (response && response.ok()) {
      const text = await page.innerText('body');
      for (const line of text.split('\n')) {
        const match = line.match(/^Disallow:\s*(.+)/i);
        if (match) disallowed.push(match[1].trim());
      }
    }
    await page.close();
  } catch {
    // robots.txt not available
  }

  return disallowed;
}

function isDisallowedByRobots(path: string, disallowed: string[]): boolean {
  return disallowed.some((rule) => path.startsWith(rule));
}

async function extractPageContent(page: Page, url: string): Promise<PageContent> {
  const parsedUrl = new URL(url);
  const title = await page.title();
  const html = await page.content();
  const text = await page.evaluate(() => document.body?.innerText ?? '');
  const meta = await extractMeta(page);
  const structuredData = await extractStructuredData(page);

  return {
    url,
    path: parsedUrl.pathname,
    title,
    html,
    text,
    meta,
    structuredData,
  };
}

function discoverLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const hrefPattern = /href=["']([^"']+)["']/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin === origin && !resolved.hash) {
        // Normalise: drop trailing slash (except root), drop query params
        let path = resolved.pathname.replace(/\/+$/, '') || '/';
        links.push(new URL(path, origin).href);
      }
    } catch {
      // skip invalid URLs
    }
  }

  return [...new Set(links)];
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Crawl a site starting from `config.url`.
 *
 * Discovery order:
 * 1. sitemap.xml (if available)
 * 2. Internal links found on each visited page
 *
 * Respects include/exclude path patterns and robots.txt (when enabled).
 */
export async function crawlSite(config: CrawlSiteConfig): Promise<PageContent[]> {
  const {
    url: startUrl,
    max_pages = 50,
    include_paths = [],
    exclude_paths = [],
    respect_robots_txt = true,
    delay_ms = 1_000,
  } = config;

  const origin = new URL(startUrl).origin;
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent:
        'Mozilla/5.0 (compatible; md-subdomain-gen/0.1; +https://github.com/user/md-subdomain-gen)',
    });

    // Fetch robots.txt disallow rules
    const robotsDisallow = respect_robots_txt
      ? await fetchRobotsTxt(origin, context)
      : [];

    // Seed queue: sitemap first, then the start URL
    const sitemapUrls = await fetchSitemapUrls(origin, context);
    const queue: string[] = [...sitemapUrls, startUrl];
    const visited = new Set<string>();
    const results: PageContent[] = [];

    while (queue.length > 0 && results.length < max_pages) {
      const currentUrl = queue.shift()!;
      const normalised = new URL(currentUrl).href;

      if (visited.has(normalised)) continue;
      visited.add(normalised);

      const path = new URL(normalised).pathname;

      // Filter: robots.txt
      if (respect_robots_txt && isDisallowedByRobots(path, robotsDisallow)) {
        continue;
      }

      // Filter: include/exclude
      if (!isAllowed(path, include_paths, exclude_paths)) continue;

      try {
        const page = await context.newPage();
        await page.goto(normalised, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        // Small wait for JS rendering
        await page.waitForTimeout(1_500);

        const content = await extractPageContent(page, normalised);
        results.push(content);

        // Discover new links
        const newLinks = discoverLinks(content.html, normalised);
        for (const link of newLinks) {
          if (!visited.has(link)) {
            queue.push(link);
          }
        }

        await page.close();
      } catch {
        // Skip pages that fail to load
      }

      // Polite delay
      if (delay_ms > 0 && queue.length > 0) {
        await new Promise((r) => setTimeout(r, delay_ms));
      }
    }

    return results;
  } finally {
    await browser?.close();
  }
}
