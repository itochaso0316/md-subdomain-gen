import { extractStatic, type ExtractedContent } from './static.js';

// ── Types ────────────────────────────────────────────────────────────

export type { ExtractedContent };

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  images: Array<{ src: string; alt: string | null }>;
  variants: Array<{
    title: string;
    price: string;
    sku: string;
    available: boolean;
  }>;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

interface ShopifyProductSingleResponse {
  product: ShopifyProduct;
}

// ── Internal Helpers ─────────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
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

/**
 * Fetch all products via Shopify's public `/products.json` endpoint.
 * Paginates through all available pages.
 */
async function fetchAllProducts(baseUrl: string): Promise<ShopifyProduct[]> {
  const origin = new URL(baseUrl).origin;
  const all: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const data = await fetchJson<ShopifyProductsResponse>(
      `${origin}/products.json?limit=250&page=${page}`,
    );

    if (!data || data.products.length === 0) break;
    all.push(...data.products);

    if (data.products.length < 250) break;
    page++;
  }

  return all;
}

/**
 * Build JSON-LD Product structured data from a Shopify product.
 */
function buildProductStructuredData(
  product: ShopifyProduct,
  baseUrl: string,
): Record<string, unknown> {
  const origin = new URL(baseUrl).origin;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: stripHtmlTags(product.body_html || ''),
    url: `${origin}/products/${product.handle}`,
    brand: product.vendor ? { '@type': 'Brand', name: product.vendor } : undefined,
    image: product.images.map((img) => img.src),
    offers: product.variants.map((v) => ({
      '@type': 'Offer',
      name: v.title,
      price: v.price,
      priceCurrency: 'JPY', // default; real implementation would check shop currency
      sku: v.sku,
      availability: v.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    })),
  };
}

function shopifyProductToExtracted(
  product: ShopifyProduct,
  baseUrl: string,
): ExtractedContent {
  const images = product.images.map((img) => ({
    src: img.src,
    alt: img.alt ?? product.title,
  }));

  // Extract links from body_html
  const links: Array<{ href: string; text: string }> = [];
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(product.body_html || '')) !== null) {
    links.push({ href: match[1], text: stripHtmlTags(match[2]) });
  }

  return {
    title: product.title,
    description: stripHtmlTags(product.body_html || '').slice(0, 300),
    mainContent: stripHtmlTags(product.body_html || ''),
    navigation: [],
    footer: '',
    images,
    links,
    structuredData: [buildProductStructuredData(product, baseUrl)],
  };
}

// ── Page-level extraction ────────────────────────────────────────────

/**
 * Fetch a single product's JSON by handle.
 */
async function fetchProductByHandle(
  baseUrl: string,
  handle: string,
): Promise<ShopifyProduct | null> {
  const origin = new URL(baseUrl).origin;
  const data = await fetchJson<ShopifyProductSingleResponse>(
    `${origin}/products/${handle}.json`,
  );
  return data?.product ?? null;
}

/**
 * Extract non-product pages (collections, pages) by fetching HTML.
 */
async function extractPageHtml(url: string): Promise<ExtractedContent> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return extractStatic(html);
  } catch {
    return {
      title: '',
      description: '',
      mainContent: '',
      navigation: [],
      footer: '',
      images: [],
      links: [],
      structuredData: [],
    };
  }
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Extract content from a Shopify store.
 *
 * Strategy:
 * 1. Fetch all products via `/products.json` API
 * 2. Convert each product into ExtractedContent with structured data
 * 3. Also extract the main page via HTML for non-product content
 */
export async function extractShopify(url: string): Promise<ExtractedContent[]> {
  const results: ExtractedContent[] = [];

  // Extract the main/home page via HTML
  const homePage = await extractPageHtml(url);
  results.push(homePage);

  // Fetch all products via JSON API
  const products = await fetchAllProducts(url);

  for (const product of products) {
    results.push(shopifyProductToExtracted(product, url));
  }

  return results;
}

export { fetchProductByHandle, extractPageHtml };
