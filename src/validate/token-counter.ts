import { get_encoding, type Tiktoken } from 'tiktoken';

// ── Types ────────────────────────────────────────────────────────────

export interface TokenReport {
  htmlTokens: number;
  markdownTokens: number;
  /** Reduction percentage (0–100). */
  reduction: number;
  /** True when reduction meets or exceeds the 90 % target. */
  efficiency: boolean;
}

export interface PageReport {
  url: string;
  htmlTokens: number;
  markdownTokens: number;
  reduction: number;
}

export interface FullReport {
  pages: PageReport[];
  totalHtmlTokens: number;
  totalMarkdownTokens: number;
  averageReduction: number;
  efficiency: boolean;
  generatedAt: string;
}

// ── Encoder singleton ────────────────────────────────────────────────

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('cl100k_base');
  }
  return encoder;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Count the number of tokens in a string using the cl100k_base encoding
 * (used by GPT-4 / Claude-compatible tokenisers).
 */
export function countTokens(text: string): number {
  const enc = getEncoder();
  const tokens = enc.encode(text);
  return tokens.length;
}

/**
 * Compare token counts between the original HTML and the generated
 * markdown, returning reduction metrics.
 */
export function compareTokens(html: string, markdown: string): TokenReport {
  const htmlTokens = countTokens(html);
  const markdownTokens = countTokens(markdown);

  const reduction =
    htmlTokens === 0 ? 0 : ((htmlTokens - markdownTokens) / htmlTokens) * 100;

  return {
    htmlTokens,
    markdownTokens,
    reduction: Math.round(reduction * 100) / 100,
    efficiency: reduction >= 90,
  };
}

/**
 * Generate a full report across multiple pages for the CLI `report`
 * command.
 */
export function generateReport(
  pages: Array<{ url: string; html: string; markdown: string }>,
): FullReport {
  const pageReports: PageReport[] = pages.map((page) => {
    const report = compareTokens(page.html, page.markdown);
    return {
      url: page.url,
      htmlTokens: report.htmlTokens,
      markdownTokens: report.markdownTokens,
      reduction: report.reduction,
    };
  });

  const totalHtmlTokens = pageReports.reduce((s, p) => s + p.htmlTokens, 0);
  const totalMarkdownTokens = pageReports.reduce(
    (s, p) => s + p.markdownTokens,
    0,
  );
  const averageReduction =
    totalHtmlTokens === 0
      ? 0
      : ((totalHtmlTokens - totalMarkdownTokens) / totalHtmlTokens) * 100;

  return {
    pages: pageReports,
    totalHtmlTokens,
    totalMarkdownTokens,
    averageReduction: Math.round(averageReduction * 100) / 100,
    efficiency: averageReduction >= 90,
    generatedAt: new Date().toISOString(),
  };
}
