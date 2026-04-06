/**
 * report command — crawl a site and compare HTML tokens vs optimized markdown tokens.
 */

import chalk from 'chalk';
import ora from 'ora';
import { createDefaultConfig, loadConfig, type MdSubdomainConfig } from '../config.js';
import { detectCMS } from '../crawl/detector.js';
import { crawlSite, type PageContent } from '../crawl/crawler.js';
import { buildMarkdown } from '../transform/markdown-builder.js';
import { countTokens, generateReport, type FullReport } from '../validate/token-counter.js';

function printReportTable(report: FullReport): void {
  // Column widths
  const urlWidth = 50;
  const numWidth = 12;

  const header = [
    'URL'.padEnd(urlWidth),
    'HTML Tokens'.padStart(numWidth),
    'MD Tokens'.padStart(numWidth),
    'Reduction'.padStart(numWidth),
  ].join('  ');

  const separator = '-'.repeat(header.length);

  console.log('');
  console.log(chalk.bold('  Token Comparison Report'));
  console.log('');
  console.log(`  ${chalk.dim(separator)}`);
  console.log(`  ${chalk.bold(header)}`);
  console.log(`  ${chalk.dim(separator)}`);

  for (const page of report.pages) {
    // Truncate long URLs
    const displayUrl = page.url.length > urlWidth
      ? page.url.slice(0, urlWidth - 3) + '...'
      : page.url;

    const reductionColor = page.reduction >= 90
      ? chalk.green
      : page.reduction >= 70
        ? chalk.yellow
        : chalk.red;

    const row = [
      displayUrl.padEnd(urlWidth),
      String(page.htmlTokens).padStart(numWidth),
      String(page.markdownTokens).padStart(numWidth),
      reductionColor(`${page.reduction.toFixed(1)}%`.padStart(numWidth)),
    ].join('  ');

    console.log(`  ${row}`);
  }

  console.log(`  ${chalk.dim(separator)}`);

  // Totals row
  const totalsRow = [
    chalk.bold('TOTAL'.padEnd(urlWidth)),
    chalk.bold(String(report.totalHtmlTokens).padStart(numWidth)),
    chalk.bold(String(report.totalMarkdownTokens).padStart(numWidth)),
    chalk.bold.cyan(`${report.averageReduction.toFixed(1)}%`.padStart(numWidth)),
  ].join('  ');

  console.log(`  ${totalsRow}`);
  console.log(`  ${chalk.dim(separator)}`);

  // Efficiency verdict
  const tokensSaved = report.totalHtmlTokens - report.totalMarkdownTokens;
  console.log('');
  if (report.efficiency) {
    console.log(chalk.green(`  PASS  Token reduction meets 90% target (${report.averageReduction.toFixed(1)}%)`));
  } else {
    console.log(chalk.yellow(`  WARN  Token reduction below 90% target (${report.averageReduction.toFixed(1)}%)`));
  }
  console.log(chalk.dim(`  Total tokens saved: ${tokensSaved.toLocaleString()}`));
  console.log(chalk.dim(`  Report generated at: ${report.generatedAt}`));
  console.log('');
}

export async function runReport(url: string): Promise<void> {
  console.log(chalk.bold('\n  md-subdomain-gen report\n'));

  // ── Load config ────────────────────────────────────────────────────
  let config: MdSubdomainConfig;
  try {
    config = await loadConfig();
  } catch {
    const hostname = new URL(url).hostname.replace(/\./g, '-');
    config = createDefaultConfig({ url, name: hostname });
  }

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
    pages = await crawlSite({
      url,
      cms: cmsType as 'wordpress' | 'shopify' | 'webflow' | 'static',
      max_pages: config.crawl.max_pages,
      include_paths: config.crawl.include_paths,
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
    console.log(chalk.yellow('\n  No pages found. Nothing to report.\n'));
    return;
  }

  // ── Generate markdown and build report ────────────────────────────
  const transformSpinner = ora('Generating markdown for comparison...').start();
  try {
    const reportData: Array<{ url: string; html: string; markdown: string }> = [];

    for (const page of pages) {
      const markdown = await buildMarkdown(page, {
        siteType: config.site.type,
        schemaTypes: config.transform.schema_types,
        customContext: config.transform.custom_context,
      });
      reportData.push({ url: page.url, html: page.html, markdown });
    }

    transformSpinner.succeed('Markdown generation complete');

    const report = generateReport(reportData);
    printReportTable(report);
  } catch (err) {
    transformSpinner.fail('Report generation failed');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }
}
