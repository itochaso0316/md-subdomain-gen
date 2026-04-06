/**
 * generate command — crawl a site and produce AI-optimized markdown files.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, createDefaultConfig, type MdSubdomainConfig } from '../config.js';
import { detectCMS } from '../crawl/detector.js';
import { crawlSite, type PageContent } from '../crawl/crawler.js';
import { buildMarkdown } from '../transform/markdown-builder.js';
import { countTokens } from '../validate/token-counter.js';

export interface GenerateOptions {
  pages?: string[];
  output?: string;
}

/**
 * Resolve the output file path for a given page, maintaining URL path structure.
 */
function resolveOutputPath(outputDir: string, pagePath: string): string {
  // Normalise: "/" -> "index", "/about" -> "about", "/about/" -> "about/index"
  let relativePath = pagePath;
  if (relativePath === '/') {
    relativePath = 'index';
  } else {
    // Strip leading slash
    relativePath = relativePath.replace(/^\//, '');
    // If it ends with slash, append index
    if (relativePath.endsWith('/')) {
      relativePath += 'index';
    }
  }
  return join(outputDir, `${relativePath}.md`);
}

export async function runGenerate(url: string, opts: GenerateOptions): Promise<void> {
  console.log(chalk.bold('\n  md-subdomain-gen generate\n'));

  // ── Load config ────────────────────────────────────────────────────
  let config: MdSubdomainConfig;
  try {
    config = await loadConfig();
    console.log(chalk.dim('  Config loaded from md-subdomain.config.yaml'));
  } catch {
    // No config file — use defaults derived from the provided URL
    const hostname = new URL(url).hostname.replace(/\./g, '-');
    config = createDefaultConfig({ url, name: hostname });
    console.log(chalk.dim('  No config file found, using defaults'));
  }

  const outputDir = opts.output ?? config.output.dir;

  // ── CMS Detection ─────────────────────────────────────────────────
  const cmsSpinner = ora('Detecting CMS...').start();
  let cmsType: string;
  try {
    cmsType = await detectCMS(url);
    cmsSpinner.succeed(`CMS detected: ${chalk.cyan(cmsType)}`);
  } catch (err) {
    cmsSpinner.fail('CMS detection failed');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  // ── Crawl ─────────────────────────────────────────────────────────
  const crawlSpinner = ora('Crawling site...').start();
  let pages: PageContent[];
  try {
    const includePaths = opts.pages ?? config.crawl.include_paths;
    pages = await crawlSite({
      url,
      cms: cmsType as 'wordpress' | 'shopify' | 'webflow' | 'static',
      max_pages: config.crawl.max_pages,
      include_paths: includePaths,
      exclude_paths: config.crawl.exclude_paths,
      respect_robots_txt: config.crawl.respect_robots_txt,
      delay_ms: config.crawl.delay_ms,
    });
    crawlSpinner.succeed(`Crawled ${chalk.cyan(String(pages.length))} page(s)`);
  } catch (err) {
    crawlSpinner.fail('Crawl failed');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  if (pages.length === 0) {
    console.log(chalk.yellow('\n  No pages found. Nothing to generate.\n'));
    return;
  }

  // ── Transform & Write ─────────────────────────────────────────────
  const transformSpinner = ora('Generating markdown...').start();
  let totalHtmlTokens = 0;
  let totalMdTokens = 0;
  let written = 0;

  try {
    for (const page of pages) {
      const markdown = await buildMarkdown(page, {
        siteType: config.site.type,
        schemaTypes: config.transform.schema_types,
        customContext: config.transform.custom_context,
      });

      const outPath = resolveOutputPath(outputDir, page.path);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, markdown, 'utf-8');

      totalHtmlTokens += countTokens(page.html);
      totalMdTokens += countTokens(markdown);
      written++;

      transformSpinner.text = `Generating markdown... (${written}/${pages.length})`;
    }

    transformSpinner.succeed(`Generated ${chalk.cyan(String(written))} markdown file(s)`);
  } catch (err) {
    transformSpinner.fail('Markdown generation failed');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  // ── Summary ───────────────────────────────────────────────────────
  const reduction = totalHtmlTokens === 0
    ? 0
    : ((totalHtmlTokens - totalMdTokens) / totalHtmlTokens) * 100;

  console.log('');
  console.log(chalk.bold('  Summary'));
  console.log(chalk.dim('  ─────────────────────────────────'));
  console.log(`  Pages generated:   ${chalk.green(String(written))}`);
  console.log(`  Output directory:  ${chalk.dim(outputDir)}`);
  console.log(`  HTML tokens:       ${chalk.yellow(totalHtmlTokens.toLocaleString())}`);
  console.log(`  Markdown tokens:   ${chalk.green(totalMdTokens.toLocaleString())}`);
  console.log(`  Token reduction:   ${chalk.cyan(reduction.toFixed(1) + '%')}`);
  console.log(`  Tokens saved:      ${chalk.green((totalHtmlTokens - totalMdTokens).toLocaleString())}`);
  console.log('');
}
