// ── Types ────────────────────────────────────────────────────────────

export interface SchemaError {
  type: string;
  property: string;
  message: string;
}

export interface SchemaWarning {
  type: string;
  property: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: SchemaError[];
  warnings: SchemaWarning[];
}

interface ParsedSchemaBlock {
  type: string;
  properties: Map<string, string>;
  raw: string;
}

// ── Required properties per Schema.org type ──────────────────────────

const REQUIRED_PROPERTIES: Record<string, string[]> = {
  LocalBusiness: ['name', 'address', 'telephone'],
  Restaurant: ['name', 'address', 'telephone', 'servesCuisine'],
  MedicalClinic: ['name', 'address', 'telephone', 'medicalSpecialty'],
  Hospital: ['name', 'address', 'telephone'],
  Organization: ['name', 'url'],
  Product: ['name', 'description'],
  Service: ['name', 'provider'],
  WebPage: ['name', 'url'],
  Article: ['headline', 'author', 'datePublished'],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  Event: ['name', 'startDate', 'location'],
  Person: ['name'],
  Offer: ['price', 'priceCurrency'],
};

const RECOMMENDED_PROPERTIES: Record<string, string[]> = {
  LocalBusiness: ['openingHours', 'geo', 'image', 'priceRange'],
  Restaurant: ['openingHours', 'menu', 'acceptsReservations'],
  MedicalClinic: ['openingHours', 'availableService'],
  Organization: ['logo', 'contactPoint', 'sameAs'],
  Product: ['image', 'offers', 'brand'],
  Article: ['image', 'publisher', 'dateModified'],
  Event: ['description', 'endDate', 'offers'],
};

// ── Parsing ──────────────────────────────────────────────────────────

/**
 * Parse inline Schema.org blocks from markdown.
 *
 * Expected pattern:
 * ```
 * **Schema.org/LocalBusiness**
 * - name: Example Corp
 * - address: 123 Main St
 * ```
 */
function parseSchemaBlocks(markdown: string): ParsedSchemaBlock[] {
  const blocks: ParsedSchemaBlock[] = [];
  const blockPattern =
    /\*\*Schema\.org\/(\w+)\*\*\s*\n((?:\s*-\s+.+\n?)*)/g;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(markdown)) !== null) {
    const type = match[1];
    const body = match[2];
    const properties = new Map<string, string>();

    const propPattern = /^\s*-\s+(\w+):\s*(.+)$/gm;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propPattern.exec(body)) !== null) {
      properties.set(propMatch[1], propMatch[2].trim());
    }

    blocks.push({ type, properties, raw: match[0] });
  }

  return blocks;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Validate Schema.org blocks embedded in markdown content.
 */
export function validateSchema(markdown: string): ValidationResult {
  const errors: SchemaError[] = [];
  const warnings: SchemaWarning[] = [];
  const blocks = parseSchemaBlocks(markdown);

  if (blocks.length === 0) {
    warnings.push({
      type: 'general',
      property: '',
      message: 'No Schema.org blocks found in the markdown.',
    });
    return { valid: true, errors, warnings };
  }

  for (const block of blocks) {
    const required = REQUIRED_PROPERTIES[block.type];
    if (!required) {
      warnings.push({
        type: block.type,
        property: '',
        message: `Unknown Schema.org type "${block.type}". Skipping required-property checks.`,
      });
      continue;
    }

    // Check required properties
    for (const prop of required) {
      if (!block.properties.has(prop)) {
        errors.push({
          type: block.type,
          property: prop,
          message: `Required property "${prop}" is missing from Schema.org/${block.type}.`,
        });
      }
    }

    // Check recommended properties
    const recommended = RECOMMENDED_PROPERTIES[block.type] ?? [];
    for (const prop of recommended) {
      if (!block.properties.has(prop)) {
        warnings.push({
          type: block.type,
          property: prop,
          message: `Recommended property "${prop}" is missing from Schema.org/${block.type}.`,
        });
      }
    }

    // Check for empty values in present properties
    for (const [key, value] of block.properties) {
      if (value.trim() === '') {
        errors.push({
          type: block.type,
          property: key,
          message: `Property "${key}" in Schema.org/${block.type} has an empty value.`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
