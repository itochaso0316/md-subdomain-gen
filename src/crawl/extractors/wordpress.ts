import { extractStatic, type ExtractedContent } from './static.js';
import type { PageContent } from '../crawler.js';

// ── Types ────────────────────────────────────────────────────────────

export type { ExtractedContent };

interface WPPost {
  id: number;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  slug: string;
  date: string;
  modified: string;
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string; alt_text: string }>;
  };
}

interface WPPage extends WPPost {}

// ── Internal Helpers ─────────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Discover the WP REST API base from a page's HTML.
 * Looks for `<link rel="https://api.w.org/" href="...">`.
 */
async function discoverApiEndpoint(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const match = html.match(
      /<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]+href=["']([^"']+)["']/,
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchAllPaginated<T>(baseUrl: string): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}per_page=${perPage}&page=${page}&_embed=1`;
    const items = await fetchJson<T[]>(url);

    if (!items || items.length === 0) break;
    all.push(...items);

    if (items.length < perPage) break;
    page++;
  }

  return all;
}

function wpPostToExtracted(post: WPPost): ExtractedContent {
  const images: Array<{ src: string; alt: string }> = [];

  // Featured image from _embedded
  const featured = post._embedded?.['wp:featuredmedia']?.[0];
  if (featured) {
    images.push({ src: featured.source_url, alt: featured.alt_text || '' });
  }

  // Images from content HTML
  const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/g;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgPattern.exec(post.content.rendered)) !== null) {
    images.push({ src: imgMatch[1], alt: imgMatch[2] ?? '' });
  }

  // Links from content HTML
  const links: Array<{ href: string; text: string }> = [];
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/g;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkPattern.exec(post.content.rendered)) !== null) {
    links.push({ href: linkMatch[1], text: stripHtmlTags(linkMatch[2]) });
  }

  return {
    title: stripHtmlTags(post.title.rendered),
    description: stripHtmlTags(post.excerpt.rendered),
    mainContent: stripHtmlTags(post.content.rendered),
    navigation: [],
    footer: '',
    images,
    links,
    structuredData: [],
  };
}

// ── Fallback: HTML-based extraction ─────────────────────────────────

async function extractViaHtml(url: string): Promise<ExtractedContent[]> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return [extractStatic(html)];
  } catch {
    return [];
  }
}

/**
 * Extract JSON-LD structured data blocks from an HTML string.
 */
function extractJsonLdFromHtml(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      blocks.push(parsed);
    } catch {
      // Skip malformed JSON-LD
    }
  }
  return blocks;
}

/**
 * Fetch the homepage HTML and extract JSON-LD structured data.
 */
async function fetchHomepageStructuredData(siteUrl: string): Promise<unknown[]> {
  try {
    const response = await fetch(siteUrl);
    const html = await response.text();
    return extractJsonLdFromHtml(html);
  } catch {
    return [];
  }
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Extract content from a WordPress site.
 *
 * Strategy:
 * 1. Try WP REST API (if `apiEndpoint` is provided or auto-discovered)
 *    — fetches all posts and pages via `/wp/v2/posts` and `/wp/v2/pages`
 * 2. Fall back to HTML extraction using the static extractor
 */
export async function extractWordPress(
  url: string,
  apiEndpoint?: string,
): Promise<ExtractedContent[]> {
  // Discover API endpoint if not provided
  const api = apiEndpoint ?? (await discoverApiEndpoint(url));

  if (api) {
    const apiBase = api.replace(/\/+$/, '');

    const [posts, pages] = await Promise.all([
      fetchAllPaginated<WPPost>(`${apiBase}/wp/v2/posts`),
      fetchAllPaginated<WPPage>(`${apiBase}/wp/v2/pages`),
    ]);

    const allItems = [...pages, ...posts];

    if (allItems.length > 0) {
      return allItems.map(wpPostToExtracted);
    }
  }

  // Fallback to HTML extraction
  return extractViaHtml(url);
}

/**
 * Fetch all pages and posts as PageContent[] via WP REST API.
 * This provides cleaner content than HTML crawling since WP returns
 * rendered content blocks without navigation/footer chrome.
 */
export async function fetchWordPressAsPages(
  siteUrl: string,
  apiEndpoint?: string,
): Promise<PageContent[]> {
  const api = apiEndpoint ?? (await discoverApiEndpoint(siteUrl));
  if (!api) return [];

  const apiBase = api.replace(/\/+$/, '');
  const origin = new URL(siteUrl).origin;

  const [posts, pages, homepageStructuredData] = await Promise.all([
    fetchAllPaginated<WPPost>(`${apiBase}/wp/v2/posts`),
    fetchAllPaginated<WPPage>(`${apiBase}/wp/v2/pages`),
    fetchHomepageStructuredData(siteUrl),
  ]);

  const allItems = [...pages, ...posts];

  return allItems.map((item, index) => {
    const itemUrl = item.link;
    const path = new URL(itemUrl).pathname;
    const title = stripHtmlTags(item.title.rendered);
    const description = stripHtmlTags(item.excerpt.rendered);
    const contentHtml = item.content.rendered;

    // Wrap in minimal HTML structure for the markdown builder
    const html = `<!DOCTYPE html><html><head><title>${title}</title><meta name="description" content="${description}"></head><body><main><h1>${item.title.rendered}</h1>${contentHtml}</main></body></html>`;

    // For the homepage (first page, or root path), attach structured data from HTML
    const isHomepage = path === '/' || path === '' || index === 0;
    const structuredData = isHomepage ? homepageStructuredData : [];

    return {
      url: itemUrl,
      path,
      title,
      html,
      text: stripHtmlTags(contentHtml),
      meta: { description },
      structuredData,
    };
  });
}
