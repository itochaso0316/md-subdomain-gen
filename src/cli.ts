#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('md-subdomain-gen')
  .description('AI-optimized markdown subdomain generator for existing websites')
  .version(pkg.version);

// ── init ──────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Interactive setup for a new md-subdomain project')
  .action(async () => {
    const { runInit } = await import('./commands/init.js');
    await runInit();
  });

// ── generate ──────────────────────────────────────────────────────────
program
  .command('generate <url>')
  .description('Generate AI-optimized markdown from a website')
  .option('-p, --pages <paths>', 'Comma-separated page paths to generate (e.g. /,/about,/services)')
  .option('-o, --output <dir>', 'Output directory (default: ./md-output)')
  .option('--no-wp-api', 'Disable WordPress REST API mode (use HTML crawling instead)')
  .action(async (url: string, opts: { pages?: string; output?: string; wpApi?: boolean }) => {
    const pages = opts.pages?.split(',').map((p) => p.trim());
    const { runGenerate } = await import('./commands/generate.js');
    await runGenerate(url, { pages, output: opts.output, wpApi: opts.wpApi });
  });

// ── validate ──────────────────────────────────────────────────────────
program
  .command('validate <dir>')
  .description('Validate generated markdown files')
  .action(async (dir: string) => {
    const { runValidate } = await import('./commands/validate.js');
    await runValidate(dir);
  });

// ── deploy ────────────────────────────────────────────────────────────
program
  .command('deploy')
  .description('Deploy markdown subdomain to a hosting platform')
  .option('--platform <platform>', 'Deployment platform', 'cloudflare')
  .action(async (opts: { platform: string }) => {
    const { loadConfig } = await import('./config.js');
    const config = await loadConfig();

    console.log(`Deploying to ${opts.platform}`);
    console.log(`  Subdomain: ${config.deploy.subdomain}.${new URL(config.site.url).hostname}`);

    // TODO: wire up deploy module
    console.log('Deploy not yet implemented.');
  });

// ── sync ──────────────────────────────────────────────────────────────
program
  .command('sync')
  .description('Sync markdown with main site changes')
  .option('-p, --pages <paths>', 'Comma-separated page paths to sync')
  .option('-f, --force', 'Force full re-generation instead of diff-based sync')
  .action(async (opts: { pages?: string; force?: boolean }) => {
    const pages = opts.pages?.split(',').map((p) => p.trim());

    console.log('Syncing markdown with main site');
    if (pages) {
      console.log(`  Pages: ${pages.join(', ')}`);
    }
    if (opts.force) {
      console.log('  Mode: force (full re-generation)');
    }

    // TODO: wire up sync module
    console.log('Sync not yet implemented.');
  });

// ── report ────────────────────────────────────────────────────────────
program
  .command('report <url>')
  .description('Generate token comparison report (HTML vs optimized markdown)')
  .action(async (url: string) => {
    const { runReport } = await import('./commands/report.js');
    await runReport(url);
  });

program.parse();
