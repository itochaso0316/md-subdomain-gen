import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import type { DeployConfig } from '../config.js';

export interface DeployResult {
  success: boolean;
  url: string;
  errors?: string[];
}

/**
 * Convert a file path to a KV key.
 * - Strips `.md` extension
 * - Strips trailing `/index`
 * - Prefixes with `md:/`
 *
 * Examples:
 *   "about.md"           -> "md:/about"
 *   "blog/post-1.md"     -> "md:/blog/post-1"
 *   "index.md"           -> "md:/"
 *   "docs/index.md"      -> "md:/docs"
 */
function toKvKey(filePath: string): string {
  let key = filePath.replace(/\.md$/, '');
  key = key.replace(/\/index$/, '').replace(/^index$/, '');
  return `md:/${key}`;
}

/**
 * Recursively collect all `.md` files under a directory.
 */
async function collectMarkdownFiles(dir: string, base?: string): Promise<{ path: string; content: string }[]> {
  const root = base ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: { path: string; content: string }[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath, root));
    } else if (entry.name.endsWith('.md')) {
      const relPath = relative(root, fullPath);
      const content = await readFile(fullPath, 'utf-8');
      files.push({ path: relPath, content });
    }
  }

  return files;
}

/**
 * Run a shell command and return stdout/stderr.
 */
function exec(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Deploy markdown content to Cloudflare Workers + KV.
 *
 * 1. Upload all markdown files to the MD_CONTENT KV namespace.
 * 2. Deploy the worker using `wrangler deploy`.
 */
export async function deployCloudflareWorker(
  config: DeployConfig,
  outputDir: string,
): Promise<DeployResult> {
  const errors: string[] = [];

  // Collect markdown files
  const mdFiles = await collectMarkdownFiles(outputDir);
  if (mdFiles.length === 0) {
    return { success: false, url: '', errors: ['No markdown files found in output directory'] };
  }

  // Upload each file to KV via wrangler
  for (const file of mdFiles) {
    const key = toKvKey(file.path);
    const result = await exec('wrangler', [
      'kv:key',
      'put',
      '--namespace-id', config.cloudflare.zone_id,
      '--binding', 'MD_CONTENT',
      JSON.stringify(key),
      JSON.stringify(file.content),
    ]);

    if (result.code !== 0) {
      errors.push(`KV upload failed for ${key}: ${result.stderr.trim()}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, url: '', errors };
  }

  // Deploy the worker
  const deployArgs = ['deploy'];
  if (config.cloudflare.account_id) {
    deployArgs.push('--account-id', config.cloudflare.account_id);
  }
  if (config.cloudflare.route) {
    deployArgs.push('--route', config.cloudflare.route);
  }

  const deployResult = await exec('wrangler', deployArgs);

  if (deployResult.code !== 0) {
    return {
      success: false,
      url: '',
      errors: [`wrangler deploy failed: ${deployResult.stderr.trim()}`],
    };
  }

  // Extract URL from wrangler output
  const urlMatch = deployResult.stdout.match(/https?:\/\/[^\s]+\.workers\.dev/);
  const url = urlMatch?.[0] ?? `https://${config.subdomain}.workers.dev`;

  return { success: true, url };
}
