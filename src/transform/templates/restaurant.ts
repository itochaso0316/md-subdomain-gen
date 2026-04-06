// ── Restaurant Template ──────────────────────────────────────────────
//
// Generates AI-optimized markdown for restaurants and food
// establishments.
//
// Schema.org types: Restaurant, Menu, FoodEstablishment

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

export interface MenuItemData {
  name: string;
  description?: string;
  price?: number | string;
  priceCurrency?: string;
  image?: string;
  /** Dietary notes (e.g. "vegetarian", "gluten-free"). */
  suitableForDiet?: string[];
}

export interface MenuSectionData {
  name: string;
  description?: string;
  items: MenuItemData[];
}

export interface ReservationData {
  /** Reservation URL (e.g. Tabelog, Hot Pepper, direct). */
  url?: string;
  /** Phone number for reservations. */
  telephone?: string;
  /** Description of reservation policy. */
  description?: string;
}

export interface RestaurantPageData {
  /** Restaurant name. */
  name: string;
  /** Cuisine type(s) (e.g. ["和食", "寿司"]). */
  servesCuisine?: string[];
  /** Address. */
  address?: string;
  /** Phone number. */
  telephone?: string;
  /** Official URL. */
  url?: string;
  /** Price range (e.g. "¥¥", "1000-3000円"). */
  priceRange?: string;
  /** General description. */
  description?: string;

  /** Opening hours. */
  openingHours?: OpeningHours[];
  /** Geographic coordinates. */
  geo?: GeoCoordinates;
  /** Access directions / nearest station / parking. */
  accessDescription?: string;

  /** Menu sections with items. */
  menuSections?: MenuSectionData[];
  /** General menu description if no structured menu is available. */
  menuDescription?: string;

  /** Reservation info. */
  reservation?: ReservationData;

  /** Seating capacity. */
  seatingCapacity?: number;
  /** Accepted payment methods. */
  paymentAccepted?: string[];
  /** Smoking policy. */
  smokingAllowed?: boolean | string;

  /** Natural-language restaurant context for AI agents. */
  restaurantContext?: string;

  /** Page URL for front matter. */
  pageUrl?: string;
  /** Page path for front matter. */
  pagePath?: string;
}

// ── Template ────────────────────────────────────────────────────────

/**
 * Generate an AI-optimized markdown page for a restaurant.
 *
 * Sections:
 * - Restaurant/FoodEstablishment schema at top
 * - Menu with Menu schema and item listings
 * - Hours, access, and reservation info
 */
export function restaurantTemplate(data: RestaurantPageData): string {
  const parts: string[] = [];

  // Front matter
  if (data.pageUrl || data.pagePath) {
    parts.push(buildFrontMatter(data));
  }

  // Title
  parts.push(`# ${data.name}`);

  // Restaurant schema
  const restaurantProperties: Record<string, unknown> = {
    name: data.name,
  };
  if (data.servesCuisine && data.servesCuisine.length > 0) {
    restaurantProperties['servesCuisine'] = data.servesCuisine.join(', ');
  }
  if (data.address) restaurantProperties['address'] = data.address;
  if (data.telephone) restaurantProperties['telephone'] = data.telephone;
  if (data.url) restaurantProperties['url'] = data.url;
  if (data.priceRange) restaurantProperties['priceRange'] = data.priceRange;

  parts.push(buildSchemaBlock('Restaurant', restaurantProperties));

  // FoodEstablishment schema for additional properties
  const feProperties: Record<string, unknown> = {};
  if (data.seatingCapacity) feProperties['seatingCapacity'] = data.seatingCapacity;
  if (data.paymentAccepted && data.paymentAccepted.length > 0) {
    feProperties['paymentAccepted'] = data.paymentAccepted.join(', ');
  }
  if (data.smokingAllowed !== undefined) {
    feProperties['smokingAllowed'] = data.smokingAllowed;
  }

  if (Object.keys(feProperties).length > 0) {
    parts.push(buildSchemaBlock('FoodEstablishment', feProperties));
  }

  // Description / context
  if (data.description) {
    parts.push(data.description);
  }
  if (data.restaurantContext) {
    parts.push(data.restaurantContext);
  }

  // Menu
  if (
    (data.menuSections && data.menuSections.length > 0) ||
    data.menuDescription
  ) {
    parts.push('## メニュー');

    // Menu schema (lightweight reference)
    parts.push(
      buildSchemaBlock('Menu', {
        name: `${data.name} メニュー`,
        ...(data.url ? { url: data.url } : {}),
      }),
    );

    if (data.menuSections) {
      for (const section of data.menuSections) {
        parts.push(`### ${section.name}`);

        if (section.description) {
          parts.push(section.description);
        }

        const itemLines: string[] = [];
        for (const item of section.items) {
          let line = `- **${item.name}**`;
          if (item.price !== undefined) {
            const currency = item.priceCurrency ?? '円';
            line += ` — ${item.price}${currency === 'JPY' || currency === '円' ? '円' : ` ${currency}`}`;
          }
          if (item.description) line += `\n  ${item.description}`;
          if (item.suitableForDiet && item.suitableForDiet.length > 0) {
            line += `\n  対応: ${item.suitableForDiet.join(', ')}`;
          }
          itemLines.push(line);
        }

        if (itemLines.length > 0) {
          parts.push(itemLines.join('\n'));
        }
      }
    }

    if (data.menuDescription) {
      parts.push(data.menuDescription);
    }
  }

  // Hours & Access
  if (data.openingHours || data.accessDescription || data.geo) {
    parts.push('## 営業時間・アクセス');

    if (data.openingHours && data.openingHours.length > 0) {
      const hoursLines = data.openingHours.map(
        (h) => `- ${h.dayOfWeek}: ${h.opens} - ${h.closes}`,
      );
      parts.push(hoursLines.join('\n'));
    }

    if (data.geo) {
      parts.push(`位置情報: ${data.geo.latitude}, ${data.geo.longitude}`);
    }

    if (data.accessDescription) {
      parts.push(data.accessDescription);
    }
  }

  // Reservation
  if (data.reservation) {
    parts.push('## ご予約');

    const reservationLines: string[] = [];
    if (data.reservation.telephone) {
      reservationLines.push(`- 電話予約: ${data.reservation.telephone}`);
    }
    if (data.reservation.url) {
      reservationLines.push(`- オンライン予約: ${data.reservation.url}`);
    }

    if (reservationLines.length > 0) {
      parts.push(reservationLines.join('\n'));
    }

    if (data.reservation.description) {
      parts.push(data.reservation.description);
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildFrontMatter(data: RestaurantPageData): string {
  const lines: string[] = ['---'];
  if (data.pageUrl) lines.push(`url: ${data.pageUrl}`);
  if (data.pagePath) lines.push(`path: ${data.pagePath}`);
  lines.push(`title: "${data.name.replace(/"/g, '\\"')}"`);
  lines.push(`type: restaurant`);
  lines.push('---');
  return lines.join('\n');
}
