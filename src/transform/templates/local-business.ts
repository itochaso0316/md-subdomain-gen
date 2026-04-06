// ── Local Business Template ──────────────────────────────────────────
//
// Generic template for local businesses that don't fit the more
// specific medical, restaurant, or e-commerce templates.
//
// Schema.org types: LocalBusiness, PostalAddress, OpeningHoursSpecification

import { buildSchemaBlock } from '../schema-injector.js';

// ── Types ────────────────────────────────────────────────────────────

export interface OpeningHours {
  dayOfWeek: string;
  opens: string;
  closes: string;
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface PostalAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

export interface LocalBusinessServiceData {
  name: string;
  description?: string;
  price?: string;
}

export interface LocalBusinessPageData {
  /** Business name. */
  name: string;
  /** Business description / tagline. */
  description?: string;
  /** Official URL. */
  url?: string;
  /** Phone number. */
  telephone?: string;
  /** Email address. */
  email?: string;
  /** Fax number. */
  faxNumber?: string;

  /** Address as a string. */
  address?: string;
  /** Structured postal address. */
  postalAddress?: PostalAddress;
  /** Geographic coordinates. */
  geo?: GeoCoordinates;

  /** Opening hours. */
  openingHours?: OpeningHours[];

  /** Price range indicator (e.g. "$$", "¥¥"). */
  priceRange?: string;
  /** Accepted payment methods. */
  paymentAccepted?: string[];
  /** Currencies accepted. */
  currenciesAccepted?: string;

  /** Services or products offered. */
  services?: LocalBusinessServiceData[];

  /** Access / directions description. */
  accessDescription?: string;

  /** Area served description. */
  areaServed?: string;

  /** Natural-language business context for AI agents. */
  businessContext?: string;

  /** Page URL for front matter. */
  pageUrl?: string;
  /** Page path for front matter. */
  pagePath?: string;
}

// ── Template ────────────────────────────────────────────────────────

/**
 * Generate an AI-optimized markdown page for a generic local business.
 *
 * Sections:
 * - LocalBusiness schema at top
 * - Business overview
 * - Services / products
 * - Hours & access
 * - Contact
 */
export function localBusinessTemplate(data: LocalBusinessPageData): string {
  const parts: string[] = [];

  // Front matter
  if (data.pageUrl || data.pagePath) {
    parts.push(buildFrontMatter(data));
  }

  // Title
  parts.push(`# ${data.name}`);

  // LocalBusiness schema
  const bizProperties: Record<string, unknown> = {
    name: data.name,
  };
  if (data.description) bizProperties['description'] = data.description;
  if (data.url) bizProperties['url'] = data.url;
  if (data.telephone) bizProperties['telephone'] = data.telephone;
  if (data.email) bizProperties['email'] = data.email;
  if (data.priceRange) bizProperties['priceRange'] = data.priceRange;
  if (data.areaServed) bizProperties['areaServed'] = data.areaServed;

  // Address
  if (data.postalAddress) {
    const addrParts: string[] = [];
    if (data.postalAddress.postalCode) addrParts.push(`〒${data.postalAddress.postalCode}`);
    if (data.postalAddress.addressRegion) addrParts.push(data.postalAddress.addressRegion);
    if (data.postalAddress.addressLocality) addrParts.push(data.postalAddress.addressLocality);
    if (data.postalAddress.streetAddress) addrParts.push(data.postalAddress.streetAddress);
    if (addrParts.length > 0) bizProperties['address'] = addrParts.join(' ');
  } else if (data.address) {
    bizProperties['address'] = data.address;
  }

  if (data.geo) {
    bizProperties['geo'] = {
      latitude: data.geo.latitude,
      longitude: data.geo.longitude,
    };
  }

  if (data.openingHours && data.openingHours.length > 0) {
    bizProperties['openingHoursSpecification'] = data.openingHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  parts.push(buildSchemaBlock('LocalBusiness', bizProperties));

  // Business context / description
  if (data.businessContext) {
    parts.push(data.businessContext);
  } else if (data.description) {
    parts.push(data.description);
  }

  // Services
  if (data.services && data.services.length > 0) {
    parts.push('## サービス・商品');

    for (const service of data.services) {
      let line = `### ${service.name}`;
      parts.push(line);

      if (service.price) {
        parts.push(`料金: ${service.price}`);
      }

      if (service.description) {
        parts.push(service.description);
      }
    }
  }

  // Hours & Access
  if (data.openingHours || data.accessDescription) {
    parts.push('## 営業時間・アクセス');

    if (data.openingHours && data.openingHours.length > 0) {
      const hoursLines = data.openingHours.map(
        (h) => `- ${h.dayOfWeek}: ${h.opens} - ${h.closes}`,
      );
      parts.push(hoursLines.join('\n'));
    }

    if (data.accessDescription) {
      parts.push(data.accessDescription);
    }
  }

  // Contact
  if (data.telephone || data.email || data.address) {
    parts.push('## お問い合わせ');

    const contactLines: string[] = [];
    if (data.telephone) contactLines.push(`- 電話: ${data.telephone}`);
    if (data.email) contactLines.push(`- メール: ${data.email}`);
    if (data.faxNumber) contactLines.push(`- FAX: ${data.faxNumber}`);
    if (data.address) contactLines.push(`- 所在地: ${data.address}`);
    if (data.paymentAccepted && data.paymentAccepted.length > 0) {
      contactLines.push(`- 決済方法: ${data.paymentAccepted.join(', ')}`);
    }

    if (contactLines.length > 0) {
      parts.push(contactLines.join('\n'));
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildFrontMatter(data: LocalBusinessPageData): string {
  const lines: string[] = ['---'];
  if (data.pageUrl) lines.push(`url: ${data.pageUrl}`);
  if (data.pagePath) lines.push(`path: ${data.pagePath}`);
  lines.push(`title: "${data.name.replace(/"/g, '\\"')}"`);
  lines.push(`type: local-business`);
  lines.push('---');
  return lines.join('\n');
}
