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
    `You are an expert content optimizer for AI agent consumption.`,
    `You are processing content from a ${siteLabel}.`,
    ``,
    `Your task:`,
    `- Add 2-3 sentences of natural-language context to each major section`,
    `- These sentences help AI agents (like ChatGPT, Claude, Perplexity) make accurate recommendations to users`,
    `- PRESERVE all factual information exactly as provided — prices, addresses, phone numbers, hours, names, qualifications`,
    `- NEVER fabricate, infer, or hallucinate information not present in the source`,
    `- Keep inline Schema.org labels (**Schema.org/Type** blocks) intact and unmodified`,
    `- Write added context in ${lang}`,
    `- Use a professional, informative tone — avoid marketing superlatives`,
    `- Keep the markdown structure (headings, lists, front matter) intact`,
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
    'Add 2-3 sentences of natural-language context after each major section heading and after each Schema.org block.',
    'These context sentences should help AI agents understand the content and make useful recommendations to end users.',
    'Return the complete markdown document with your additions. Do not remove or modify any existing content.',
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
