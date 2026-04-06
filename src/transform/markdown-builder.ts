// ── Markdown Generation Engine ───────────────────────────────────────
//
// Converts crawled HTML pages into clean, AI-optimized markdown with
// inline Schema.org labels.

import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkStringify from 'remark-stringify';
import type { PageContent } from '../crawl/crawler.js';
import type { SiteConfig } from '../config.js';
import {
  extractSchemaFromStructuredData,
  buildSchemaBlock,
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
}

// ── HTML → Markdown Processor ───────────────────────────────────────

const htmlToMarkdown = unified()
  .use(rehypeParse, { fragment: false })
  .use(rehypeRemark)
  .use(remarkStringify);

/**
 * Convert raw HTML string to clean markdown via unified pipeline.
 */
async function convertHtmlToMarkdown(html: string): Promise<string> {
  const file = await htmlToMarkdown.process(html);
  return String(file);
}

// ── Post-processing ─────────────────────────────────────────────────

/**
 * Clean up converted markdown:
 * - Remove excessive blank lines
 * - Strip navigation/footer boilerplate patterns
 * - Normalise heading levels
 */
function cleanMarkdown(md: string): string {
  let cleaned = md
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove common boilerplate lines
    .replace(/^(Skip to (main )?content|Toggle navigation|Menu|Close)$/gim, '')
    // Remove empty list items
    .replace(/^-\s*$/gm, '')
    // Remove lines that are just whitespace
    .replace(/^\s+$/gm, '')
    // Collapse resulting blank lines again
    .replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
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

  const filtered =
    requestedTypes.length > 0
      ? schemaBlocks.filter((b) => requestedTypes.includes(b.type))
      : schemaBlocks;

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
 * 1. Convert HTML to markdown via unified
 * 2. Clean up boilerplate and formatting
 * 3. Extract Schema.org data from JSON-LD
 * 4. Inject inline schema labels
 * 5. Add YAML front matter
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

  // Convert HTML to markdown
  const rawMarkdown = await convertHtmlToMarkdown(page.html);
  const cleanedMarkdown = cleanMarkdown(rawMarkdown);

  // Build schema section
  const schemaSection = buildSchemaSection(schemaBlocks, options.schemaTypes);

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
