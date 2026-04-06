// ── Schema.org Inline Label Injection ────────────────────────────────
//
// Converts structured data (JSON-LD) into human/AI-readable inline
// markdown blocks rather than raw JSON-LD.

// ── Types ────────────────────────────────────────────────────────────

export interface SchemaBlock {
  type: string;
  properties: Record<string, unknown>;
}

// ── Noise Schema Types ──────────────────────────────────────────────

/** Schema types that add noise without meaningful content for AI agents. */
const NOISE_SCHEMA_TYPES = new Set([
  'WebPage',
  'WebSite',
  'ImageObject',
  'BreadcrumbList',
  'SiteNavigationElement',
  'WPHeader',
  'WPFooter',
  'WPSideBar',
  'CollectionPage',
  'ProfilePage',
  'ItemPage',
  'SearchAction',
  'ReadAction',
]);

// ── Value Emptiness Check ───────────────────────────────────────────

/**
 * Check if a value is "empty" — null, undefined, empty string,
 * empty array, or empty object (no own keys).
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Object with only @type or @id and no real properties
    const meaningfulKeys = Object.keys(obj).filter((k) => !k.startsWith('@'));
    if (meaningfulKeys.length === 0) return true;
    // Check if all meaningful values are empty
    if (meaningfulKeys.every((k) => isEmpty(obj[k]))) return true;
  }
  return false;
}

// ── Formatting Helpers ──────────────────────────────────────────────

/**
 * Format a single value for inline display.
 * Handles primitives, arrays, and nested objects.
 * Returns empty string for empty/null/undefined values.
 */
function formatValue(value: unknown, indent: number = 0): string {
  if (isEmpty(value)) return '';

  if (Array.isArray(value)) {
    // Filter out empty items
    const nonEmpty = value.filter((v) => !isEmpty(v));
    if (nonEmpty.length === 0) return '';

    // If array of primitives, join with comma
    if (nonEmpty.every((v) => typeof v !== 'object' || v === null)) {
      return nonEmpty.map(String).join(', ');
    }
    // Array of objects: render each as nested block
    const lines: string[] = [];
    for (const item of nonEmpty) {
      if (typeof item === 'object' && item !== null) {
        const nested = formatNestedObject(item as Record<string, unknown>, indent + 1);
        if (nested) lines.push(nested);
      } else {
        lines.push(`${'  '.repeat(indent + 1)}- ${String(item)}`);
      }
    }
    if (lines.length === 0) return '';
    return '\n' + lines.join('\n');
  }

  if (typeof value === 'object') {
    const nested = formatNestedObject(value as Record<string, unknown>, indent + 1);
    if (!nested) return '';
    return '\n' + nested;
  }

  return String(value);
}

/**
 * Format a nested object as indented markdown list items.
 * Handles common Schema.org nested structures like
 * openingHoursSpecification, geo, address, etc.
 * Skips entries where the formatted value is empty.
 */
function formatNestedObject(obj: Record<string, unknown>, indent: number): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, val] of Object.entries(obj)) {
    // Skip JSON-LD meta keys
    if (key.startsWith('@')) continue;
    // Skip empty values
    if (isEmpty(val)) continue;

    const formatted = formatValue(val, indent);
    // Skip if formatting produced empty result
    if (!formatted) continue;

    if (formatted.startsWith('\n')) {
      lines.push(`${prefix}- ${key}:${formatted}`);
    } else {
      lines.push(`${prefix}- ${key}: ${formatted}`);
    }
  }

  return lines.join('\n');
}

// ── Schema Filtering ────────────────────────────────────────────────

/**
 * Filter schema blocks to remove noise and duplicates.
 *
 * - Removes noise types (WebPage, ImageObject, BreadcrumbList, etc.)
 * - Deduplicates by type, keeping the block with more properties
 * - For FAQPage, cleans out empty/null answers
 */
export function filterImportantSchemas(blocks: SchemaBlock[]): SchemaBlock[] {
  // Remove noise types
  let filtered = blocks.filter((b) => !NOISE_SCHEMA_TYPES.has(b.type));

  // Deduplicate by type — keep the one with more non-empty properties
  const byType = new Map<string, SchemaBlock>();
  for (const block of filtered) {
    const existing = byType.get(block.type);
    if (!existing) {
      byType.set(block.type, block);
    } else {
      const existingCount = Object.entries(existing.properties).filter(
        ([k, v]) => !k.startsWith('@') && !isEmpty(v),
      ).length;
      const newCount = Object.entries(block.properties).filter(
        ([k, v]) => !k.startsWith('@') && !isEmpty(v),
      ).length;
      if (newCount > existingCount) {
        byType.set(block.type, block);
      }
    }
  }

  filtered = Array.from(byType.values());

  // Merge Organization into MedicalOrganization (or other specific types)
  // If both exist, the specific type subsumes Organization
  const specificOrgTypes = ['MedicalOrganization', 'LocalBusiness', 'Restaurant'];
  const hasSpecific = filtered.find((b) => specificOrgTypes.includes(b.type));
  if (hasSpecific) {
    const orgBlock = filtered.find((b) => b.type === 'Organization');
    if (orgBlock) {
      // Merge Organization properties into the specific type (don't overwrite existing)
      for (const [key, val] of Object.entries(orgBlock.properties)) {
        if (!(key in hasSpecific.properties) && !isEmpty(val)) {
          hasSpecific.properties[key] = val;
        }
      }
      filtered = filtered.filter((b) => b.type !== 'Organization');
    }
  }

  // Clean FAQPage — remove entries with empty answers
  filtered = filtered.map((block) => {
    if (block.type === 'FAQPage' && block.properties['mainEntity']) {
      const entities = block.properties['mainEntity'];
      if (Array.isArray(entities)) {
        const cleaned = entities.filter((entity) => {
          if (typeof entity !== 'object' || entity === null) return false;
          const e = entity as Record<string, unknown>;
          const answer = e['acceptedAnswer'];
          if (!answer || isEmpty(answer)) return false;
          if (typeof answer === 'object' && answer !== null) {
            const a = answer as Record<string, unknown>;
            return !isEmpty(a['text']);
          }
          return true;
        });
        if (cleaned.length === 0) return null;
        return {
          ...block,
          properties: { ...block.properties, mainEntity: cleaned },
        };
      }
    }
    return block;
  }).filter((b): b is SchemaBlock => b !== null);

  return filtered;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Inject a Schema.org inline label block into markdown content.
 *
 * Produces a block like:
 * ```
 * **Schema.org/Organization**
 * - name: ACME Corp
 * - address: 123 Main St
 * ```
 *
 * @param content  Existing markdown content to prepend/append to
 * @param schemaType  Schema.org type name (e.g. "Organization")
 * @param properties  Key-value property map
 * @returns Content with the schema block appended
 */
export function injectSchema(
  content: string,
  schemaType: string,
  properties: Record<string, unknown>,
): string {
  const block = buildSchemaBlock(schemaType, properties);
  if (!block) return content;

  // If content is empty, just return the block
  if (!content.trim()) return block;

  return `${content}\n\n${block}`;
}

/**
 * Build a standalone schema block string without injecting it.
 * Skips properties where the value is empty, null, undefined,
 * empty array, or empty object.
 */
export function buildSchemaBlock(
  schemaType: string,
  properties: Record<string, unknown>,
): string {
  const filteredEntries = Object.entries(properties).filter(
    ([key, val]) => !key.startsWith('@') && !isEmpty(val),
  );

  if (filteredEntries.length === 0) return '';

  const lines: string[] = [`**Schema.org/${schemaType}**`];

  for (const [key, val] of filteredEntries) {
    const formatted = formatValue(val, 0);
    // Skip if formatting produced empty result
    if (!formatted) continue;

    if (formatted.startsWith('\n')) {
      lines.push(`- ${key}:${formatted}`);
    } else {
      lines.push(`- ${key}: ${formatted}`);
    }
  }

  // If only the header line remains, skip the block
  if (lines.length <= 1) return '';

  return lines.join('\n');
}

/**
 * Extract schema blocks from JSON-LD structured data found on a page.
 *
 * Handles:
 * - Single JSON-LD objects
 * - `@graph` arrays
 * - Arrays of JSON-LD objects
 *
 * @param jsonLd  Array of parsed JSON-LD objects from the page
 * @returns Array of SchemaBlock with type and flat properties
 */
export function extractSchemaFromStructuredData(jsonLd: unknown[]): SchemaBlock[] {
  const blocks: SchemaBlock[] = [];

  for (const item of jsonLd) {
    if (!item || typeof item !== 'object') continue;

    const obj = item as Record<string, unknown>;

    // Handle @graph arrays
    if (Array.isArray(obj['@graph'])) {
      for (const graphItem of obj['@graph']) {
        const block = extractSingleBlock(graphItem);
        if (block) blocks.push(block);
      }
      continue;
    }

    const block = extractSingleBlock(obj);
    if (block) blocks.push(block);
  }

  return blocks;
}

/**
 * Extract a single SchemaBlock from a JSON-LD object.
 */
function extractSingleBlock(item: unknown): SchemaBlock | null {
  if (!item || typeof item !== 'object') return null;

  const obj = item as Record<string, unknown>;
  const rawType = obj['@type'];

  if (!rawType) return null;

  const type = Array.isArray(rawType) ? rawType[0] : String(rawType);

  // Collect all non-meta, non-empty properties
  const properties: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('@')) continue;
    if (!isEmpty(val)) {
      properties[key] = val;
    }
  }

  // Skip blocks with no meaningful properties
  if (Object.keys(properties).length === 0) return null;

  return { type: String(type), properties };
}
