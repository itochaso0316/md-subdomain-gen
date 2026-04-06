import { extractStatic, type ExtractedContent } from './static.js';

// ── Types ────────────────────────────────────────────────────────────

export type { ExtractedContent };

interface WebflowPageMeta {
  /** data-wf-page attribute value (Webflow page ID). */
  pageId: string | null;
  /** data-wf-site attribute value (Webflow site ID). */
  siteId: string | null;
  /** Collection slug if part of a CMS collection. */
  collectionSlug: string | null;
}

export interface WebflowExtractedContent extends ExtractedContent {
  /** Webflow-specific metadata. */
  webflow: WebflowPageMeta;
}

// ── Internal Helpers ─────────────────────────────────────────────────

/**
 * Extract Webflow-specific data-wf-* attributes from raw HTML.
 * These attributes are present on the <html> or <body> element in
 * Webflow-generated pages.
 */
function extractWebflowMeta(html: string): WebflowPageMeta {
  const pageIdMatch = html.match(/data-wf-page=["']([^"']+)["']/);
  const siteIdMatch = html.match(/data-wf-site=["']([^"']+)["']/);

  // Webflow CMS collections often have a slug in the URL or a
  // data-w-id attribute on collection items.
  const collectionMatch = html.match(
    /class=["'][^"']*w-dyn-list[^"']*["']/,
  );

  return {
    pageId: pageIdMatch?.[1] ?? null,
    siteId: siteIdMatch?.[1] ?? null,
    collectionSlug: collectionMatch ? 'dynamic-list' : null,
  };
}

/**
 * Extract Webflow interaction/animation data for context.
 * Webflow stores interaction JSON in a script tag with `data-wf-domain`.
 */
function extractWebflowInteractions(html: string): string[] {
  const interactionIds: string[] = [];
  const pattern = /data-w-id=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    interactionIds.push(match[1]);
  }

  return interactionIds;
}

/**
 * Webflow embeds "rich text" blocks inside elements with the class
 * `w-richtext`. Extract these separately for better content quality.
 */
function extractRichTextBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pattern = /<div[^>]*class=["'][^"']*w-richtext[^"']*["'][^>]*>([\s\S]*?)<\/div>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 0) blocks.push(text);
  }

  return blocks;
}

/**
 * Extract Webflow CMS collection items.
 * These are typically inside `.w-dyn-items > .w-dyn-item` wrappers.
 */
function extractCollectionItems(html: string): string[] {
  const items: string[] = [];
  const pattern =
    /<div[^>]*class=["'][^"']*w-dyn-item[^"']*["'][^>]*>([\s\S]*?)<\/div>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 0) items.push(text);
  }

  return items;
}

// ── Page Fetcher ─────────────────────────────────────────────────────

async function fetchPageHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Extract content from a Webflow page.
 *
 * Uses the static HTML extractor as a base, then enriches the result
 * with Webflow-specific metadata (page/site IDs, rich-text blocks,
 * CMS collection items, interaction references).
 */
export async function extractWebflow(url: string): Promise<WebflowExtractedContent> {
  const html = await fetchPageHtml(url);

  // Base extraction via the generic static extractor
  const base = extractStatic(html);

  // Webflow-specific enrichments
  const webflowMeta = extractWebflowMeta(html);
  const richTextBlocks = extractRichTextBlocks(html);
  const collectionItems = extractCollectionItems(html);

  // If rich-text blocks exist and the static extractor found little
  // content, prefer the rich-text as mainContent.
  let mainContent = base.mainContent;
  if (richTextBlocks.length > 0 && mainContent.length < 200) {
    mainContent = richTextBlocks.join('\n\n');
  }

  // Append collection item text to mainContent when present
  if (collectionItems.length > 0) {
    mainContent += '\n\n' + collectionItems.join('\n\n');
  }

  return {
    ...base,
    mainContent: mainContent.trim(),
    webflow: webflowMeta,
  };
}

/**
 * Extract content from multiple Webflow pages.
 * Convenience wrapper for batch processing.
 */
export async function extractWebflowPages(
  urls: string[],
): Promise<WebflowExtractedContent[]> {
  const results: WebflowExtractedContent[] = [];

  for (const url of urls) {
    try {
      const content = await extractWebflow(url);
      results.push(content);
    } catch {
      // Skip pages that fail to load
    }
  }

  return results;
}
