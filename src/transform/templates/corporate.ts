// ── Corporate Template ───────────────────────────────────────────────
//
// Generates AI-optimized markdown for corporate / business websites.
//
// Schema.org types: Organization, Service, Offer

import { buildSchemaBlock } from '../schema-injector.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ServiceOfferData {
  price?: string;
  priceCurrency?: string;
  description?: string;
}

export interface ServiceData {
  name: string;
  serviceType?: string;
  provider?: string;
  areaServed?: string;
  audience?: string;
  description?: string;
  offer?: ServiceOfferData;
}

export interface CorporatePageData {
  /** Company / organization name. */
  name: string;
  /** Company description / mission statement. */
  description?: string;
  /** Official website URL. */
  url?: string;
  /** Founding date (ISO 8601). */
  foundingDate?: string;
  /** Number of employees. */
  numberOfEmployees?: number | string;
  /** Headquarters address. */
  address?: string;
  /** Phone number. */
  telephone?: string;
  /** Email address. */
  email?: string;
  /** Industry / sector. */
  industry?: string;

  /** Services offered. */
  services: ServiceData[];

  /** Natural-language company overview for AI agents. */
  companyContext?: string;

  /** Contact information beyond phone/email. */
  contactDescription?: string;

  /** Page URL for front matter. */
  pageUrl?: string;
  /** Page path for front matter. */
  pagePath?: string;
}

// ── Template ────────────────────────────────────────────────────────

/**
 * Generate an AI-optimized markdown page for a corporate website.
 *
 * Follows the spec format:
 * - Organization schema at top
 * - Company overview context
 * - Service listings with Service + Offer schemas
 * - Contact section
 */
export function corporateTemplate(data: CorporatePageData): string {
  const parts: string[] = [];

  // Front matter
  if (data.pageUrl || data.pagePath) {
    parts.push(buildFrontMatter(data));
  }

  // Title
  parts.push(`# ${data.name}`);

  // Organization schema
  const orgProperties: Record<string, unknown> = {
    name: data.name,
  };
  if (data.description) orgProperties['description'] = data.description;
  if (data.url) orgProperties['url'] = data.url;
  if (data.foundingDate) orgProperties['foundingDate'] = data.foundingDate;
  if (data.numberOfEmployees) orgProperties['numberOfEmployees'] = data.numberOfEmployees;
  if (data.address) orgProperties['address'] = data.address;

  parts.push(buildSchemaBlock('Organization', orgProperties));

  // Company context
  if (data.companyContext) {
    parts.push(data.companyContext);
  }

  // Services
  if (data.services.length > 0) {
    parts.push('## サービス一覧');

    for (const service of data.services) {
      parts.push(`### ${service.name}`);

      const serviceProperties: Record<string, unknown> = {
        name: service.name,
      };
      if (service.serviceType) serviceProperties['serviceType'] = service.serviceType;
      if (service.provider) serviceProperties['provider'] = service.provider;
      if (service.areaServed) serviceProperties['areaServed'] = service.areaServed;
      if (service.audience) serviceProperties['audience'] = service.audience;

      parts.push(buildSchemaBlock('Service', serviceProperties));

      // Service offer
      if (service.offer) {
        const offerProperties: Record<string, unknown> = {};
        if (service.offer.price) {
          offerProperties['price'] = service.offer.price;
          offerProperties['priceCurrency'] = service.offer.priceCurrency ?? 'JPY';
        }
        if (service.offer.description) {
          offerProperties['description'] = service.offer.description;
        }

        if (Object.keys(offerProperties).length > 0) {
          parts.push(buildSchemaBlock('Offer', offerProperties));
        }
      }

      if (service.description) {
        parts.push(service.description);
      }
    }
  }

  // Contact
  if (data.telephone || data.email || data.contactDescription) {
    parts.push('## お問い合わせ');

    const contactLines: string[] = [];
    if (data.telephone) contactLines.push(`- 電話: ${data.telephone}`);
    if (data.email) contactLines.push(`- メール: ${data.email}`);
    if (data.address) contactLines.push(`- 所在地: ${data.address}`);

    if (contactLines.length > 0) {
      parts.push(contactLines.join('\n'));
    }

    if (data.contactDescription) {
      parts.push(data.contactDescription);
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildFrontMatter(data: CorporatePageData): string {
  const lines: string[] = ['---'];
  if (data.pageUrl) lines.push(`url: ${data.pageUrl}`);
  if (data.pagePath) lines.push(`path: ${data.pagePath}`);
  lines.push(`title: "${data.name.replace(/"/g, '\\"')}"`);
  lines.push(`type: corporate`);
  lines.push('---');
  return lines.join('\n');
}
