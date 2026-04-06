// ── Schema.org Inline Label Injection ────────────────────────────────
//
// Converts structured data (JSON-LD) into human/AI-readable inline
// markdown blocks rather than raw JSON-LD.

// ── Types ────────────────────────────────────────────────────────────

export interface SchemaBlock {
  type: string;
  properties: Record<string, unknown>;
}

// ── Formatting Helpers ──────────────────────────────────────────────

/**
 * Format a single value for inline display.
 * Handles primitives, arrays, and nested objects.
 */
function formatValue(value: unknown, indent: number = 0): string {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    // If array of primitives, join with comma
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      return value.map(String).join(', ');
    }
    // Array of objects: render each as nested block
    const lines: string[] = [];
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        lines.push(formatNestedObject(item as Record<string, unknown>, indent + 1));
      } else {
        lines.push(`${'  '.repeat(indent + 1)}- ${String(item)}`);
      }
    }
    return '\n' + lines.join('\n');
  }

  if (typeof value === 'object') {
    return '\n' + formatNestedObject(value as Record<string, unknown>, indent + 1);
  }

  return String(value);
}

/**
 * Format a nested object as indented markdown list items.
 * Handles common Schema.org nested structures like
 * openingHoursSpecification, geo, address, etc.
 */
function formatNestedObject(obj: Record<string, unknown>, indent: number): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, val] of Object.entries(obj)) {
    // Skip JSON-LD meta keys
    if (key.startsWith('@')) continue;
    if (val === null || val === undefined || val === '') continue;

    const formatted = formatValue(val, indent);
    if (formatted.startsWith('\n')) {
      lines.push(`${prefix}- ${key}:${formatted}`);
    } else {
      lines.push(`${prefix}- ${key}: ${formatted}`);
    }
  }

  return lines.join('\n');
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
 */
export function buildSchemaBlock(
  schemaType: string,
  properties: Record<string, unknown>,
): string {
  const filteredEntries = Object.entries(properties).filter(
    ([key, val]) => !key.startsWith('@') && val !== null && val !== undefined && val !== '',
  );

  if (filteredEntries.length === 0) return '';

  const lines: string[] = [`**Schema.org/${schemaType}**`];

  for (const [key, val] of filteredEntries) {
    const formatted = formatValue(val, 0);
    if (formatted.startsWith('\n')) {
      lines.push(`- ${key}:${formatted}`);
    } else {
      lines.push(`- ${key}: ${formatted}`);
    }
  }

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

  // Collect all non-meta properties
  const properties: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('@')) continue;
    properties[key] = val;
  }

  return { type: String(type), properties };
}
