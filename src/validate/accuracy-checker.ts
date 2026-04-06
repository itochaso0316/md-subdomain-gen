// ── Types ────────────────────────────────────────────────────────────

export interface PageContent {
  url: string;
  html: string;
  text: string;
}

export interface AccuracyResult {
  /** Overall accuracy score (0–100). */
  score: number;
  /** Key information present in the original but missing from the markdown. */
  missingInfo: string[];
  /** Non-critical issues or potential mismatches. */
  warnings: string[];
}

// ── Pattern definitions ──────────────────────────────────────────────

/** Japanese & international phone number patterns. */
const PHONE_PATTERNS = [
  /(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/g, // Japanese: 03-1234-5678
  /(?:\+\d{1,3}[-\s]?\d{1,4}[-\s]?\d{3,4}[-\s]?\d{3,4})/g, // International
  /(?:\d{3}[-.]?\d{3}[-.]?\d{4})/g, // US-style
];

/** Price patterns (JPY and common currencies). */
const PRICE_PATTERNS = [
  /[¥￥]\s?[\d,]+/g,
  /[\d,]+\s?円/g,
  /\$\s?[\d,.]+/g,
  /€\s?[\d,.]+/g,
  /[\d,]+\s?(?:yen|USD|EUR)/gi,
];

/** Postal code / address patterns. */
const ADDRESS_PATTERNS = [
  /〒?\s?\d{3}[-‐−]\d{4}/g, // Japanese postal code
  /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県).{2,}/g, // Japanese prefecture + address
  /\d{1,5}\s\w+\s(?:St|Ave|Blvd|Rd|Dr|Ln|Way|Ct)\b/gi, // US street address
];

/** Business-hours patterns. */
const HOURS_PATTERNS = [
  /\d{1,2}:\d{2}\s?[-~〜]\s?\d{1,2}:\d{2}/g, // 9:00-17:00
  /(?:月|火|水|木|金|土|日|祝)[〜~-](?:月|火|水|木|金|土|日|祝)/g, // 月〜金
  /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:\s?[-–]\s?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))?/gi,
  /(?:平日|土日祝?|休診日?|定休日)/g,
];

// ── Helpers ──────────────────────────────────────────────────────────

function extractAll(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.add(normalise(m[0]));
    }
  }
  return [...found];
}

/** Normalise whitespace and width characters for comparison. */
function normalise(s: string): string {
  return s
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[－‐−]/g, '-')
    .replace(/[～〜]/g, '~')
    .replace(/￥/g, '¥')
    .trim();
}

function containsNormalised(haystack: string, needle: string): boolean {
  return normalise(haystack).includes(normalise(needle));
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Check whether key factual information from the original page is
 * preserved in the generated markdown.
 */
export function checkAccuracy(
  original: PageContent,
  markdown: string,
): AccuracyResult {
  const missingInfo: string[] = [];
  const warnings: string[] = [];

  const sourceText = original.text || original.html;
  const normMarkdown = normalise(markdown);

  // --- Phone numbers ---
  const phones = extractAll(sourceText, PHONE_PATTERNS);
  for (const phone of phones) {
    if (!containsNormalised(normMarkdown, phone)) {
      missingInfo.push(`Phone number: ${phone}`);
    }
  }

  // --- Prices ---
  const prices = extractAll(sourceText, PRICE_PATTERNS);
  for (const price of prices) {
    if (!containsNormalised(normMarkdown, price)) {
      missingInfo.push(`Price: ${price}`);
    }
  }

  // --- Addresses / postal codes ---
  const addresses = extractAll(sourceText, ADDRESS_PATTERNS);
  for (const addr of addresses) {
    if (!containsNormalised(normMarkdown, addr)) {
      missingInfo.push(`Address: ${addr}`);
    }
  }

  // --- Business hours ---
  const hours = extractAll(sourceText, HOURS_PATTERNS);
  for (const h of hours) {
    if (!containsNormalised(normMarkdown, h)) {
      warnings.push(`Business hours pattern may be missing: ${h}`);
    }
  }

  // --- Score calculation ---
  const totalChecks = phones.length + prices.length + addresses.length + hours.length;
  if (totalChecks === 0) {
    return { score: 100, missingInfo, warnings: ['No extractable key information found in the original content.'] };
  }

  const failedChecks = missingInfo.length + warnings.length;
  const score = Math.max(0, Math.round(((totalChecks - failedChecks) / totalChecks) * 100));

  return { score, missingInfo, warnings };
}
