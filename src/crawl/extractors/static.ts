import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import type { Element, Root, Text } from 'hast';

// ── Types ────────────────────────────────────────────────────────────

export interface ExtractedContent {
  title: string;
  description: string;
  mainContent: string;
  navigation: string[];
  footer: string;
  images: Array<{ src: string; alt: string }>;
  links: Array<{ href: string; text: string }>;
  structuredData: unknown[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function isElement(node: unknown): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as Element).type === 'element'
  );
}

function isText(node: unknown): node is Text {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as Text).type === 'text'
  );
}

/** Recursively collect all text from a HAST subtree. */
function collectText(node: Element | Root): string {
  const parts: string[] = [];

  for (const child of node.children) {
    if (isText(child)) {
      parts.push(child.value);
    } else if (isElement(child)) {
      parts.push(collectText(child));
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Find the first element matching a tag name (depth-first). */
function findFirst(node: Element | Root, tagName: string): Element | null {
  for (const child of node.children) {
    if (isElement(child)) {
      if (child.tagName === tagName) return child;
      const found = findFirst(child, tagName);
      if (found) return found;
    }
  }
  return null;
}

/** Find all elements matching a tag name. */
function findAll(node: Element | Root, tagName: string): Element[] {
  const results: Element[] = [];

  for (const child of node.children) {
    if (isElement(child)) {
      if (child.tagName === tagName) results.push(child);
      results.push(...findAll(child, tagName));
    }
  }

  return results;
}

/** Find the <html> element or return the root as-is. */
function findHtml(root: Root): Element | Root {
  for (const child of root.children) {
    if (isElement(child) && child.tagName === 'html') return child;
  }
  return root;
}

/** Find the <body> element, or fall back to the html/root. */
function findBody(root: Root): Element | Root {
  const html = findHtml(root);
  const body = isElement(html)
    ? findFirst(html, 'body')
    : findFirst(root, 'body');
  return body ?? html;
}

/**
 * Identify the "main content" element.
 * Priority: <main>, <article>, then the element with the most text.
 */
function findMainContentElement(body: Element | Root): Element | Root {
  // Prefer semantic elements
  const main = findFirst(body as Element, 'main');
  if (main) return main;

  const articles = findAll(body as Element, 'article');
  if (articles.length === 1) return articles[0];

  // Fallback: largest direct content block (div/section) by text length
  const candidates: Element[] = [];
  for (const child of body.children) {
    if (isElement(child) && ['div', 'section'].includes(child.tagName)) {
      candidates.push(child);
    }
  }

  if (candidates.length === 0) return body;

  let best = candidates[0];
  let bestLen = collectText(best).length;

  for (let i = 1; i < candidates.length; i++) {
    const len = collectText(candidates[i]).length;
    if (len > bestLen) {
      best = candidates[i];
      bestLen = len;
    }
  }

  return best;
}

function extractTitle(root: Root): string {
  const html = findHtml(root);
  const head = isElement(html)
    ? findFirst(html, 'head')
    : findFirst(root, 'head');
  if (!head) return '';

  const titleEl = findFirst(head, 'title');
  return titleEl ? collectText(titleEl) : '';
}

function extractDescription(root: Root): string {
  const html = findHtml(root);
  const head = isElement(html)
    ? findFirst(html, 'head')
    : findFirst(root, 'head');
  if (!head) return '';

  const metas = findAll(head, 'meta');
  for (const meta of metas) {
    const name = (meta.properties?.name as string) ?? '';
    if (name.toLowerCase() === 'description') {
      return (meta.properties?.content as string) ?? '';
    }
  }
  return '';
}

function extractNavigation(body: Element | Root): string[] {
  const navEl = findFirst(body as Element, 'nav');
  if (!navEl) return [];

  const anchors = findAll(navEl, 'a');
  return anchors
    .map((a) => collectText(a))
    .filter((t) => t.length > 0);
}

function extractFooter(body: Element | Root): string {
  const footerEl = findFirst(body as Element, 'footer');
  return footerEl ? collectText(footerEl) : '';
}

function extractImages(body: Element | Root): Array<{ src: string; alt: string }> {
  const imgs = findAll(body as Element, 'img');
  return imgs.map((img) => ({
    src: (img.properties?.src as string) ?? '',
    alt: (img.properties?.alt as string) ?? '',
  }));
}

function extractLinks(body: Element | Root): Array<{ href: string; text: string }> {
  const anchors = findAll(body as Element, 'a');
  return anchors.map((a) => ({
    href: (a.properties?.href as string) ?? '',
    text: collectText(a),
  }));
}

function extractJsonLd(root: Root): unknown[] {
  const body = findBody(root);
  const html = findHtml(root);
  // JSON-LD scripts can appear in <head> or <body>
  const scripts = [...findAll(html as Element, 'script'), ...findAll(body as Element, 'script')];
  const results: unknown[] = [];

  for (const script of scripts) {
    const type = (script.properties?.type as string) ?? '';
    if (type !== 'application/ld+json') continue;

    const text = collectText(script);
    try {
      results.push(JSON.parse(text));
    } catch {
      // skip malformed
    }
  }

  // Deduplicate by JSON string
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Extract structured content from raw HTML using rehype-parse.
 *
 * Identifies the main content area (preferring <main>/<article> elements),
 * navigation, footer, images, links, and JSON-LD structured data.
 */
export function extractStatic(html: string): ExtractedContent {
  const tree = unified().use(rehypeParse).parse(html);

  const body = findBody(tree);
  const mainEl = findMainContentElement(body);

  return {
    title: extractTitle(tree),
    description: extractDescription(tree),
    mainContent: collectText(mainEl),
    navigation: extractNavigation(body),
    footer: extractFooter(body),
    images: extractImages(body),
    links: extractLinks(body),
    structuredData: extractJsonLd(tree),
  };
}
