// ── LLM Content Optimizer ────────────────────────────────────────────
//
// Uses the Anthropic Claude API to add natural-language context to
// markdown sections. The optimizer preserves all factual information
// and only adds AI-agent-friendly context — it never fabricates data.

import Anthropic from '@anthropic-ai/sdk';
import type { SiteConfig } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────

export interface OptimizeContext {
  /** Site type for domain-specific prompting. */
  siteType: SiteConfig['type'];
  /** Additional business/domain context to guide the LLM. */
  customContext?: string;
  /** Content language (BCP 47 tag, e.g. "ja", "en"). */
  language: string;
}

interface OptimizeOptions {
  /** Anthropic model to use. */
  model?: string;
  /** Maximum tokens for the response. */
  maxTokens?: number;
}

// ── Constants ───────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

const SITE_TYPE_LABELS: Record<SiteConfig['type'], string> = {
  medical: 'medical/healthcare clinic or hospital',
  ecommerce: 'e-commerce / online store',
  corporate: 'corporate / business website',
  restaurant: 'restaurant / food establishment',
  'local-business': 'local business',
  custom: 'general website',
};

// ── Client Factory ──────────────────────────────────────────────────

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required for LLM optimization.\n' +
          'Set it with: export ANTHROPIC_API_KEY=sk-ant-...',
      );
    }
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

// ── System Prompt Builder ───────────────────────────────────────────

function buildSystemPrompt(context: OptimizeContext): string {
  const siteLabel = SITE_TYPE_LABELS[context.siteType] ?? 'general website';
  const lang = context.language === 'ja' ? 'Japanese' : context.language;

  return [
    `You are an expert content optimizer creating AI-agent-ready markdown.`,
    `You are processing content from a ${siteLabel}.`,
    ``,
    `Your task — COMPRESS and OPTIMIZE the markdown for AI consumption:`,
    ``,
    `1. COMPRESS: Remove redundant text, merge duplicated info, remove decorative/layout content`,
    `   - Remove image references (![...](url)) entirely`,
    `   - Remove navigation links, "詳しく見る", "すべて見る" type links`,
    `   - Remove news/announcement lists (just mention "お知らせあり" if relevant)`,
    `   - Collapse verbose FAQ into concise Q&A pairs`,
    `   - Remove HTML comments, CSS, and any non-content markup`,
    ``,
    `2. ADD CONTEXT: After each major section, add 1-2 sentences of natural-language context`,
    `   - These help AI agents (ChatGPT, Claude, Perplexity) make accurate recommendations`,
    `   - Example: "岐阜市で不妊治療を探している方に、一般不妊治療から高度生殖補助医療まで対応する総合施設です。"`,
    ``,
    `3. PRESERVE FACTS: Keep ALL factual data exactly as provided:`,
    `   - Prices, addresses, phone numbers, business hours, doctor names, qualifications`,
    `   - Schema.org blocks (**Schema.org/Type**) — keep intact, do not modify`,
    `   - YAML front matter (--- block) — keep intact`,
    `   - NEVER fabricate or infer information not in the source`,
    ``,
    `4. OUTPUT FORMAT:`,
    `   - Write in ${lang}`,
    `   - Use clean markdown headings (##, ###)`,
    `   - Professional, informative tone — no marketing superlatives`,
    `   - Target: 60-80% token reduction from input while preserving 100% of facts`,
    ``,
    context.customContext
      ? `Additional business context:\n${context.customContext}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Optimize markdown content by adding natural-language context via Claude.
 *
 * The LLM adds 2-3 sentence descriptions to each section that AI
 * agents can use when making recommendations. All original facts are
 * preserved; nothing is fabricated.
 *
 * @param content  Markdown content to optimize
 * @param context  Site type, language, and optional business context
 * @param options  Model and token limit overrides
 * @returns Optimized markdown string
 */
export async function optimizeContent(
  content: string,
  context: OptimizeContext,
  options?: OptimizeOptions,
): Promise<string> {
  const client = getClient();
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

  const systemPrompt = buildSystemPrompt(context);

  const userPrompt = [
    'Below is a markdown document extracted from a website.',
    'Compress and optimize it for AI agent consumption following your instructions.',
    'Return ONLY the optimized markdown — no explanations, no code fences.',
    '',
    '---',
    '',
    content,
  ].join('\n');

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text from the response
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    // If no text response, return original content unchanged
    return content;
  }

  return textBlock.text.trim();
}

/**
 * Optimize content in batches — splits long documents into sections,
 * optimizes each independently, then reassembles. Useful for documents
 * exceeding typical context window limits.
 *
 * @param sections  Array of markdown section strings
 * @param context   Optimization context
 * @param options   Model and token limit overrides
 * @returns Array of optimized section strings
 */
export async function optimizeContentBatch(
  sections: string[],
  context: OptimizeContext,
  options?: OptimizeOptions,
): Promise<string[]> {
  const results: string[] = [];

  for (const section of sections) {
    // Skip very short sections (front matter, blank lines, etc.)
    if (section.trim().length < 50) {
      results.push(section);
      continue;
    }

    const optimized = await optimizeContent(section, context, options);
    results.push(optimized);
  }

  return results;
}
