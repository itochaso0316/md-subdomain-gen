import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ── Zod Schemas ───────────────────────────────────────────────────────

const SiteConfigSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  type: z.enum(['medical', 'ecommerce', 'corporate', 'restaurant', 'local-business', 'custom']),
  language: z.string().default('ja'),
});

const CmsConfigSchema = z.object({
  type: z.enum(['wordpress', 'shopify', 'webflow', 'static', 'auto']).default('auto'),
  api_endpoint: z.string().optional(),
});

const CrawlConfigSchema = z.object({
  max_pages: z.number().int().positive().default(50),
  include_paths: z.array(z.string()).default([]),
  exclude_paths: z.array(z.string()).default(['/admin/*', '/wp-admin/*', '/cart/*']),
  respect_robots_txt: z.boolean().default(true),
  delay_ms: z.number().int().nonnegative().default(1000),
});

const TransformConfigSchema = z.object({
  use_llm: z.boolean().default(true),
  llm_model: z.string().default('claude-sonnet-4-20250514'),
  schema_types: z.array(z.string()).default([]),
  custom_context: z.string().default(''),
});

const CloudflareDeploySchema = z.object({
  account_id: z.string().default(''),
  zone_id: z.string().default(''),
  route: z.string().default(''),
});

const DeployConfigSchema = z.object({
  platform: z.enum(['cloudflare', 'github-pages', 'netlify', 'vercel']).default('cloudflare'),
  subdomain: z.string().default('md'),
  cloudflare: CloudflareDeploySchema.default({}),
});

const SyncConfigSchema = z.object({
  mode: z.enum(['webhook', 'polling', 'manual']).default('manual'),
  polling_interval: z.string().default('6h'),
  webhook_secret: z.string().default(''),
});

const OutputConfigSchema = z.object({
  dir: z.string().default('./md-output'),
  url_structure: z.enum(['mirror', 'flat']).default('mirror'),
});

const MdSubdomainConfigSchema = z.object({
  site: SiteConfigSchema,
  cms: CmsConfigSchema.default({}),
  crawl: CrawlConfigSchema.default({}),
  transform: TransformConfigSchema.default({}),
  deploy: DeployConfigSchema.default({}),
  sync: SyncConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
});

// ── TypeScript Interfaces ─────────────────────────────────────────────

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type CmsConfig = z.infer<typeof CmsConfigSchema>;
export type CrawlConfig = z.infer<typeof CrawlConfigSchema>;
export type TransformConfig = z.infer<typeof TransformConfigSchema>;
export type DeployConfig = z.infer<typeof DeployConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type MdSubdomainConfig = z.infer<typeof MdSubdomainConfigSchema>;

// ── Config Loading ────────────────────────────────────────────────────

const CONFIG_FILENAME = 'md-subdomain.config.yaml';

/**
 * Load configuration from `md-subdomain.config.yaml` in the current
 * working directory. Falls back to default values for any missing fields.
 */
export async function loadConfig(cwd?: string): Promise<MdSubdomainConfig> {
  const configPath = resolve(cwd ?? process.cwd(), CONFIG_FILENAME);

  let raw: unknown;
  try {
    const content = await readFile(configPath, 'utf-8');
    raw = parseYaml(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Config file not found: ${configPath}\nRun "md-subdomain-gen init" to create one.`,
      );
    }
    throw err;
  }

  return MdSubdomainConfigSchema.parse(raw);
}

/**
 * Return a fully-populated default config object. Useful for `init`
 * command scaffolding.
 */
export function createDefaultConfig(overrides?: Partial<{
  url: string;
  name: string;
  type: SiteConfig['type'];
  language: string;
}>): MdSubdomainConfig {
  return MdSubdomainConfigSchema.parse({
    site: {
      url: overrides?.url ?? 'https://example.com',
      name: overrides?.name ?? 'My Website',
      type: overrides?.type ?? 'corporate',
      language: overrides?.language ?? 'ja',
    },
  });
}

export { MdSubdomainConfigSchema };
