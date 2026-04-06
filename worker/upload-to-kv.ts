/**
 * Upload all markdown files from md-output/ to Cloudflare KV.
 * Key format: md:/{path} (strip .md extension, strip /index)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUTPUT_DIR = join(import.meta.dirname, '..', 'md-output');
const KV_NAMESPACE_ID = 'f0a29e2231a342a78244835f05e5b15f';

interface KVBulkEntry {
  key: string;
  value: string;
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function fileToKVKey(file: string): string {
  let rel = relative(OUTPUT_DIR, file);
  // Strip .md extension
  rel = rel.replace(/\.md$/, '');
  // Normalize path separators
  rel = rel.replace(/\\/g, '/');
  // Strip trailing /index for directory-style paths
  // but keep "index" for root
  if (rel === 'index') {
    return 'md:/index';
  }
  if (rel.endsWith('/index')) {
    rel = rel.slice(0, -'/index'.length);
  }
  return `md:/${rel}`;
}

async function main() {
  const files = collectFiles(OUTPUT_DIR);
  console.log(`Found ${files.length} markdown files`);

  const entries: KVBulkEntry[] = files.map((file) => ({
    key: fileToKVKey(file),
    value: readFileSync(file, 'utf-8'),
  }));

  // Wrangler bulk put expects JSON array of {key, value} on stdin
  // We'll write a JSON file and use wrangler kv bulk put
  const bulkFile = join(import.meta.dirname, 'kv-bulk.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(bulkFile, JSON.stringify(entries, null, 0));

  console.log(`Prepared ${entries.length} KV entries`);
  console.log('Sample keys:');
  entries.slice(0, 10).forEach((e) => console.log(`  ${e.key}`));

  // Execute wrangler bulk put
  const { execSync } = await import('node:child_process');
  try {
    execSync(
      `npx wrangler kv bulk put "${bulkFile}" --namespace-id ${KV_NAMESPACE_ID}`,
      { stdio: 'inherit', cwd: import.meta.dirname },
    );
    console.log('\nUpload complete!');
  } catch (err) {
    console.error('Upload failed:', err);
    process.exit(1);
  }

  // Clean up
  const { unlinkSync } = await import('node:fs');
  unlinkSync(bulkFile);
}

main();
