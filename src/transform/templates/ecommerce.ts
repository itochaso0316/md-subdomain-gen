// ── E-commerce Template ──────────────────────────────────────────────
//
// Generates AI-optimized markdown for product/shop pages.
//
// Schema.org types: Product, Offer, AggregateRating

import { buildSchemaBlock } from '../schema-injector.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ProductVariation {
  name: string;
  value: string;
  price?: number;
  availability?: string;
  sku?: string;
}

export interface AggregateRatingData {
  ratingValue: number;
  reviewCount: number;
  bestRating?: number;
  worstRating?: number;
}

export interface OfferData {
  price: number | string;
  priceCurrency?: string;
  availability?: string;
  seller?: string;
  priceValidUntil?: string;
  url?: string;
}

export interface EcommercePageData {
  /** Product name. */
  name: string;
  /** Brand name. */
  brand?: string;
  /** Product description. */
  description?: string;
  /** Stock Keeping Unit. */
  sku?: string;
  /** Product category. */
  category?: string;
  /** Product image URL. */
  image?: string;

  /** Pricing and offer details. */
  offer?: OfferData;

  /** Product variations (size, color, bundles, etc.). */
  variations?: ProductVariation[];

  /** Aggregate review rating. */
  aggregateRating?: AggregateRatingData;
  /** Review summary text (do not include verbatim user reviews). */
  reviewSummary?: string;

  /** Natural-language product context for AI agents. */
  productContext?: string;

  /** Page URL for front matter. */
  pageUrl?: string;
  /** Page path for front matter. */
  pagePath?: string;
}

// ── Template ────────────────────────────────────────────────────────

/**
 * Generate an AI-optimized markdown page for a product / e-commerce listing.
 *
 * Follows the spec format:
 * - Product schema with core properties
 * - Offer schema with pricing
 * - Variations section
 * - AggregateRating schema with review summary
 */
export function ecommerceTemplate(data: EcommercePageData): string {
  const parts: string[] = [];

  // Front matter
  if (data.pageUrl || data.pagePath) {
    parts.push(buildFrontMatter(data));
  }

  // Title
  parts.push(`# ${data.name}`);

  // Product schema
  const productProperties: Record<string, unknown> = {
    name: data.name,
  };
  if (data.brand) productProperties['brand'] = data.brand;
  if (data.description) productProperties['description'] = data.description;
  if (data.sku) productProperties['sku'] = data.sku;
  if (data.category) productProperties['category'] = data.category;

  parts.push(buildSchemaBlock('Product', productProperties));

  // Product context
  if (data.productContext) {
    parts.push(data.productContext);
  }

  // Offer schema
  if (data.offer) {
    const offerProperties: Record<string, unknown> = {
      price: data.offer.price,
      priceCurrency: data.offer.priceCurrency ?? 'JPY',
    };
    if (data.offer.availability) offerProperties['availability'] = data.offer.availability;
    if (data.offer.seller) offerProperties['seller'] = data.offer.seller;
    if (data.offer.priceValidUntil) {
      offerProperties['priceValidUntil'] = data.offer.priceValidUntil;
    }

    parts.push(buildSchemaBlock('Offer', offerProperties));
  }

  // Variations
  if (data.variations && data.variations.length > 0) {
    parts.push('## バリエーション');

    const variationLines: string[] = [];
    for (const v of data.variations) {
      let line = `- **${v.name}**: ${v.value}`;
      if (v.price !== undefined) line += ` (${v.price}円)`;
      if (v.availability) line += ` — ${v.availability}`;
      variationLines.push(line);
    }
    parts.push(variationLines.join('\n'));
  }

  // Review summary
  if (data.aggregateRating) {
    parts.push('## レビューサマリー');

    const ratingProperties: Record<string, unknown> = {
      ratingValue: data.aggregateRating.ratingValue,
      reviewCount: data.aggregateRating.reviewCount,
    };
    if (data.aggregateRating.bestRating) {
      ratingProperties['bestRating'] = data.aggregateRating.bestRating;
    }
    if (data.aggregateRating.worstRating) {
      ratingProperties['worstRating'] = data.aggregateRating.worstRating;
    }

    parts.push(buildSchemaBlock('AggregateRating', ratingProperties));

    if (data.reviewSummary) {
      parts.push(data.reviewSummary);
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildFrontMatter(data: EcommercePageData): string {
  const lines: string[] = ['---'];
  if (data.pageUrl) lines.push(`url: ${data.pageUrl}`);
  if (data.pagePath) lines.push(`path: ${data.pagePath}`);
  lines.push(`title: "${data.name.replace(/"/g, '\\"')}"`);
  lines.push(`type: ecommerce`);
  if (data.sku) lines.push(`sku: ${data.sku}`);
  lines.push('---');
  return lines.join('\n');
}
