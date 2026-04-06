// ── Markdown Generation Engine ───────────────────────────────────────
//
// Converts crawled HTML pages into clean, AI-optimized markdown with
// inline Schema.org labels.

import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import type { PageContent } from '../crawl/crawler.js';
import type { SiteConfig } from '../config.js';
import {
  extractSchemaFromStructuredData,
  buildSchemaBlock,
  filterImportantSchemas,
  type SchemaBlock,
} from './schema-injector.js';

// ── Types ────────────────────────────────────────────────────────────

export interface TransformOptions {
  /** Site type determines which template and schema strategy to use. */
  siteType: SiteConfig['type'];
  /** Schema.org types to inject (e.g. ["Organization", "MedicalClinic"]). */
  schemaTypes: string[];
  /** Optional template function that overrides default markdown output. */
  template?: (page: PageContent, schemaBlocks: SchemaBlock[]) => string;
  /** Additional context string passed to LLM optimizer. */
  customContext?: string;
  /** Whether the page was fetched via WP REST API (cleaner content). */
  isWpApi?: boolean;
}

// ── HTML → Markdown Processor ───────────────────────────────────────

const htmlToMarkdown = unified()
  .use(rehypeParse, { fragment: false })
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify);

/**
 * Strip unwanted HTML elements before markdown conversion.
 * Removes nav, header, footer, script, style, noscript, and related elements.
 */
function stripUnwantedHtmlElements(html: string): string {
  // Remove <script> tags and content (including type="application/ld+json" is fine — we extract structured data separately)
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove <style> tags and content
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove <noscript> tags and content
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Remove <nav> tags and content
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, '');

  // Remove <header> tags and content
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Remove <footer> tags and content
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Remove <aside> tags and content (sidebars)
  cleaned = cleaned.replace(/<aside[\s\S]*?<\/aside>/gi, '');

  return cleaned;
}

/**
 * Convert raw HTML string to clean markdown via unified pipeline.
 */
async function convertHtmlToMarkdown(html: string): Promise<string> {
  const file = await htmlToMarkdown.process(html);
  return String(file);
}

// ── Post-processing ─────────────────────────────────────────────────

/**
 * Clean up converted markdown aggressively for AI optimization.
 */
function cleanMarkdown(md: string): string {
  let cleaned = md;

  // ── Remove HTML comments (single-line and multiline) ──────────────
  // Multiline first, then single-line
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // ── Remove Yoast SEO comments ─────────────────────────────────────
  cleaned = cleaned.replace(/\/\*\s*(?:This site is optimized|Yoast SEO)[\s\S]*?\*\//gi, '');

  // ── Remove Google Analytics / tracking comments ───────────────────
  cleaned = cleaned.replace(/\/\*\s*(?:Google Analytics|Google Tag Manager|gtag)[\s\S]*?\*\//gi, '');

  // ── Remove CSS blocks (@media queries, style remnants) ────────────
  cleaned = cleaned.replace(/@media[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g, '');
  cleaned = cleaned.replace(/@media\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\}/g, '');
  cleaned = cleaned.replace(/@(?:font-face|keyframes|import|charset)[^{]*\{[\s\S]*?\}/g, '');
  // Remove inline @media one-liners
  cleaned = cleaned.replace(/^.*@media\s*\(.*$/gm, '');
  // Remove stray CSS property lines (e.g. "display: none;", "margin: 0;")
  cleaned = cleaned.replace(/^[\w-]+\s*:\s*[^;]+;\s*$/gm, '');
  // Remove CSS selectors with braces
  cleaned = cleaned.replace(/^[.#][\w-]+\s*\{[\s\S]*?\}/gm, '');

  // ── Remove <script> and <style> remnants ──────────────────────────
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');

  // ── Remove emoji SVG URL lines (WordPress core emoji) ─────────────
  cleaned = cleaned.replace(/^.*\[!\[.*?\]\(https?:\/\/s\.w\.org\/images\/core\/emoji\/[^\)]*\).*$/gm, '');
  // Also remove standalone emoji image references
  cleaned = cleaned.replace(/^.*https?:\/\/s\.w\.org\/images\/core\/emoji\/[^\s]*.*$/gm, '');

  // ── Remove common boilerplate lines ───────────────────────────────
  cleaned = cleaned.replace(/^(Skip to (main )?content|Toggle navigation|Menu|Close)$/gim, '');

  // ── Remove navigation section patterns ────────────────────────────
  // Lines that are just link lists typical of navigation (e.g. "[Home](/)" on their own line)
  // Detect blocks of consecutive short link-only lines (navigation pattern)
  cleaned = cleaned.replace(/(?:^\[[\w\s]+\]\([^\)]*\)\s*\n){3,}/gm, '');

  // ── Remove footer boilerplate patterns ────────────────────────────
  // Copyright lines
  cleaned = cleaned.replace(/^.*(?:©|Copyright|\(c\)).*\d{4}.*$/gim, '');
  // Common footer link patterns (Privacy Policy, Terms, etc. at end)
  cleaned = cleaned.replace(/^.*(?:Privacy Policy|Terms of (?:Service|Use)|Cookie Policy|All Rights Reserved).*$/gim, '');

  // ── Remove empty bold markers ─────────────────────────────────────
  cleaned = cleaned.replace(/^\*\*\s*\*\*$/gm, '');
  cleaned = cleaned.replace(/^\*\*$/gm, '');

  // ── Remove empty links ────────────────────────────────────────────
  cleaned = cleaned.replace(/^\[\]\(.*?\)\s*$/gm, '');
  // Remove lines that are just empty link text
  cleaned = cleaned.replace(/^\[[\s]*\]\([\s]*\)\s*$/gm, '');

  // ── Remove image-only lines (AI agents don't need image URLs) ─────
  // Full markdown image lines: ![alt](url)
  cleaned = cleaned.replace(/^!\[.*?\]\(.*?\)\s*$/gm, '');
  // Linked images: [![alt](img-url)](link-url)
  cleaned = cleaned.replace(/^\[!\[.*?\]\(.*?\)\]\(.*?\)\s*$/gm, '');

  // ── Remove "詳しく見る" / "すべて見る" link-only lines ──────────
  cleaned = cleaned.replace(/^\[[\*]*(?:詳しく見る|すべて見る|コラム一覧を見る)[\*]*\]\([^\)]*\)\s*$/gm, '');

  // ── Remove trailing backslash line breaks (noise for AI) ──────────
  cleaned = cleaned.replace(/\\\s*$/gm, '');

  // ── Remove trailing ** from headings (e.g. "### Question?**") ─────
  cleaned = cleaned.replace(/^(#{1,6}\s+.*?)\*\*\s*$/gm, '$1');

  // ── Remove duplicate content blocks (carousel/slider repeats) ────
  // Detect and remove repeated sections (same heading appearing 2+ times)
  const lines = cleaned.split('\n');
  const seenHeadings = new Map<string, number>();
  const linesToRemove = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      const key = headingMatch[2].trim();
      const prevIdx = seenHeadings.get(key);
      if (prevIdx !== undefined) {
        // Find the end of this duplicate section (next heading of same or higher level)
        const level = headingMatch[1].length;
        let endIdx = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          const nextHeading = lines[j].match(/^(#{1,4})\s/);
          if (nextHeading && nextHeading[1].length <= level) {
            endIdx = j;
            break;
          }
        }
        for (let j = i; j < endIdx; j++) {
          linesToRemove.add(j);
        }
      } else {
        seenHeadings.set(key, i);
      }
    }
  }
  if (linesToRemove.size > 0) {
    cleaned = lines.filter((_, idx) => !linesToRemove.has(idx)).join('\n');
  }

  // ── Remove empty list items ───────────────────────────────────────
  cleaned = cleaned.replace(/^-\s*$/gm, '');

  // ── Remove standalone single-word lines that are section labels ───
  // (e.g. "Column", "Doctor", "About", "FAQ", "Medical", "Facility", "News", "Instagram")
  cleaned = cleaned.replace(/^(?:Column|Doctor|About|FAQ|Medical|Facility|News|Instagram|Recruit)\s*$/gm, '');

  // ── Remove lines that are just whitespace ─────────────────────────
  cleaned = cleaned.replace(/^\s+$/gm, '');

  // ── Collapse excessive blank lines ────────────────────────────────
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * For HTML-crawled pages, extract the main content portion.
 * Finds content between the first heading and footer-like sections.
 */
export function extractMainContent(markdown: string): string {
  const lines = markdown.split('\n');

  // Find the first heading
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  // Find where footer-like content begins (from the end)
  let endIdx = lines.length;
  for (let i = lines.length - 1; i > startIdx; i--) {
    const line = lines[i].toLowerCase();
    if (
      line.includes('copyright') ||
      line.includes('all rights reserved') ||
      line.includes('privacy policy') ||
      line.includes('powered by') ||
      /^#{1,3}\s*(footer|関連|サイトマップ|site\s?map)/i.test(lines[i])
    ) {
      endIdx = i;
      // Keep looking backwards for more footer content
      continue;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

// ── FAQ Deduplication ───────────────────────────────────────────────

/**
 * Remove FAQ section from content body when FAQ data is already in Schema.org block.
 * Detects sections with "よくあるご質問" / "FAQ" headings and consecutive Q&A patterns.
 */
function removeFaqFromContent(markdown: string): string {
  const lines = markdown.split('\n');
  let faqStart = -1;
  let faqEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    // Detect FAQ section start
    if (/^#{1,3}\s+(?:よくある|FAQ|Q\s*&\s*A|質問)/i.test(lines[i])) {
      faqStart = i;
      // Find the end — next heading of same or higher level, or end of file
      const level = (lines[i].match(/^(#+)/) ?? ['', '##'])[1].length;
      for (let j = i + 1; j < lines.length; j++) {
        const headingMatch = lines[j].match(/^(#{1,3})\s/);
        if (headingMatch && headingMatch[1].length <= level) {
          faqEnd = j;
          break;
        }
      }
      break;
    }
  }

  if (faqStart === -1) return markdown;
  return [...lines.slice(0, faqStart), ...lines.slice(faqEnd)].join('\n').trim();
}

// ── Schema Injection ────────────────────────────────────────────────

/**
 * Filter schema blocks to only include types the user requested,
 * then build inline markdown blocks for each.
 */
function buildSchemaSection(
  schemaBlocks: SchemaBlock[],
  requestedTypes: string[],
): string {
  if (requestedTypes.length === 0 && schemaBlocks.length === 0) return '';

  // First, filter to important schemas (remove noise)
  const important = filterImportantSchemas(schemaBlocks);

  const filtered =
    requestedTypes.length > 0
      ? important.filter((b) => requestedTypes.includes(b.type))
      : important;

  if (filtered.length === 0) return '';

  const sections = filtered.map((block) =>
    buildSchemaBlock(block.type, block.properties),
  );

  return sections.filter(Boolean).join('\n\n');
}

// ── YAML Front Matter ───────────────────────────────────────────────

function buildFrontMatter(page: PageContent): string {
  const lines: string[] = ['---'];
  lines.push(`url: ${page.url}`);
  lines.push(`path: ${page.path}`);
  if (page.title) lines.push(`title: "${page.title.replace(/"/g, '\\"')}"`);
  if (page.meta['description']) {
    lines.push(`description: "${page.meta['description'].replace(/"/g, '\\"')}"`);
  }
  lines.push('---');
  return lines.join('\n');
}

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Build an AI-optimized markdown document from a crawled page.
 *
 * Pipeline:
 * 1. Strip unwanted HTML elements (nav, header, footer, script, style)
 * 2. Convert HTML to markdown via unified
 * 3. Clean up boilerplate and formatting
 * 4. Extract Schema.org data from JSON-LD
 * 5. Inject inline schema labels
 * 6. Add YAML front matter
 *
 * If a custom template function is provided in options, it receives
 * the page and extracted schema blocks, and its output is used instead
 * of the default pipeline.
 *
 * @param page     Crawled page content
 * @param options  Transform configuration
 * @returns Complete markdown document string
 */
export async function buildMarkdown(
  page: PageContent,
  options: TransformOptions,
): Promise<string> {
  // Extract structured data from JSON-LD
  const schemaBlocks = extractSchemaFromStructuredData(
    page.structuredData as unknown[],
  );

  // If a custom template is provided, delegate entirely
  if (options.template) {
    return options.template(page, schemaBlocks);
  }

  // For HTML-crawled pages (non-WP-API), strip unwanted elements first
  const htmlForConversion = options.isWpApi
    ? page.html
    : stripUnwantedHtmlElements(page.html);

  // Convert HTML to markdown
  const rawMarkdown = await convertHtmlToMarkdown(htmlForConversion);
  let cleanedMarkdown = cleanMarkdown(rawMarkdown);

  // For HTML-crawled pages, apply extra content extraction
  if (!options.isWpApi) {
    cleanedMarkdown = extractMainContent(cleanedMarkdown);
  }

  // Build schema section
  const schemaSection = buildSchemaSection(schemaBlocks, options.schemaTypes);

  // If FAQPage schema is present, remove FAQ section from content body
  // (avoids duplication — the schema block already contains the FAQ data)
  const hasFaqSchema = filterImportantSchemas(schemaBlocks).some(
    (b) => b.type === 'FAQPage',
  );
  if (hasFaqSchema) {
    cleanedMarkdown = removeFaqFromContent(cleanedMarkdown);
  }

  // Assemble final document
  const parts: string[] = [];

  // Front matter
  parts.push(buildFrontMatter(page));

  // Title
  if (page.title) {
    parts.push(`# ${page.title}`);
  }

  // Schema blocks (placed right after title for AI discoverability)
  if (schemaSection) {
    parts.push(schemaSection);
  }

  // Main content
  if (cleanedMarkdown) {
    parts.push(cleanedMarkdown);
  }

  return parts.join('\n\n');
}

export type { SchemaBlock };
