import type { PageContent } from './crawler.js';

// ── Types ────────────────────────────────────────────────────────────

export type PageType =
  | 'top'
  | 'service'
  | 'product'
  | 'about'
  | 'contact'
  | 'blog'
  | 'other';

export interface PageInfo {
  url: string;
  path: string;
  title: string;
  type: PageType;
  depth: number;
  meta: Record<string, string>;
  structuredDataTypes: string[];
}

export interface TreeNode {
  /** URL path segment (e.g. "about", "team"). Root node segment is "/". */
  segment: string;
  /** Full path up to this node. */
  path: string;
  /** Associated page info, if a page exists at this path. */
  page?: PageInfo;
  /** Child nodes keyed by path segment. */
  children: Map<string, TreeNode>;
}

export interface ContentMap {
  pages: PageInfo[];
  siteStructure: TreeNode;
}

// ── Classification ───────────────────────────────────────────────────

const CLASSIFICATION_RULES: Array<{
  type: PageType;
  pathPatterns: RegExp[];
  titlePatterns: RegExp[];
}> = [
  {
    type: 'top',
    pathPatterns: [/^\/$/],
    titlePatterns: [],
  },
  {
    type: 'contact',
    pathPatterns: [/\/contact/i, /\/inquiry/i, /\/enquiry/i, /\/toiawase/i],
    titlePatterns: [/contact/i, /お問[い|合]/i, /問[い|合]/i],
  },
  {
    type: 'about',
    pathPatterns: [
      /\/about/i,
      /\/company/i,
      /\/corporate/i,
      /\/profile/i,
      /\/gaiyou/i,
    ],
    titlePatterns: [/about/i, /会社[概情]/i, /企業/i],
  },
  {
    type: 'service',
    pathPatterns: [/\/service/i, /\/solution/i, /\/jigyou/i],
    titlePatterns: [/service/i, /事業/i, /サービス/i, /ソリューション/i],
  },
  {
    type: 'product',
    pathPatterns: [
      /\/product/i,
      /\/item/i,
      /\/shop/i,
      /\/store/i,
      /\/collections?\//i,
    ],
    titlePatterns: [/product/i, /商品/i, /製品/i],
  },
  {
    type: 'blog',
    pathPatterns: [
      /\/blog/i,
      /\/news/i,
      /\/article/i,
      /\/post/i,
      /\/column/i,
    ],
    titlePatterns: [/blog/i, /ブログ/i, /ニュース/i, /お知らせ/i, /コラム/i],
  },
];

function classifyPage(path: string, title: string): PageType {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pathPatterns.some((re) => re.test(path))) return rule.type;
    if (rule.titlePatterns.some((re) => re.test(title))) return rule.type;
  }
  return 'other';
}

// ── Tree Builder ─────────────────────────────────────────────────────

function getStructuredDataTypes(data: unknown[]): string[] {
  const types: string[] = [];
  for (const item of data) {
    if (item && typeof item === 'object' && '@type' in item) {
      const t = (item as Record<string, unknown>)['@type'];
      if (typeof t === 'string') types.push(t);
      if (Array.isArray(t)) types.push(...t.filter((v): v is string => typeof v === 'string'));
    }
  }
  return [...new Set(types)];
}

function buildTree(pages: PageInfo[]): TreeNode {
  const root: TreeNode = {
    segment: '/',
    path: '/',
    children: new Map(),
  };

  for (const page of pages) {
    const segments = page.path.split('/').filter(Boolean);
    let current = root;

    if (segments.length === 0) {
      // root page
      current.page = page;
      continue;
    }

    let builtPath = '';
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      builtPath += '/' + seg;

      if (!current.children.has(seg)) {
        current.children.set(seg, {
          segment: seg,
          path: builtPath,
          children: new Map(),
        });
      }

      current = current.children.get(seg)!;
    }

    current.page = page;
  }

  return root;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Build a structured content map from an array of crawled pages.
 *
 * - Classifies each page by type (top, service, product, about, etc.)
 * - Constructs a tree reflecting the URL hierarchy
 */
export function buildContentMap(pages: PageContent[]): ContentMap {
  const pageInfos: PageInfo[] = pages.map((p) => {
    const depth = p.path === '/' ? 0 : p.path.split('/').filter(Boolean).length;

    return {
      url: p.url,
      path: p.path,
      title: p.title,
      type: classifyPage(p.path, p.title),
      depth,
      meta: p.meta,
      structuredDataTypes: getStructuredDataTypes(p.structuredData),
    };
  });

  return {
    pages: pageInfos,
    siteStructure: buildTree(pageInfos),
  };
}
