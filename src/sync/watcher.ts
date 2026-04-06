import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SyncConfig } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────

export interface WatcherConfig extends SyncConfig {
  siteUrl: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

// ── Sitemap helpers ──────────────────────────────────────────────────

/**
 * Fetch and parse a sitemap.xml from the site, returning a list of URLs
 * with their lastmod dates.
 */
async function fetchSitemap(siteUrl: string): Promise<SitemapEntry[]> {
  const sitemapUrl = new URL('/sitemap.xml', siteUrl).href;
  const res = await fetch(sitemapUrl);

  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const entries: SitemapEntry[] = [];

  // Simple XML extraction — avoids a full parser dependency
  const urlPattern = /<url>\s*([\s\S]*?)\s*<\/url>/g;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(xml)) !== null) {
    const block = match[1];
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1] ?? '';
    const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? null;
    if (loc) {
      entries.push({ loc, lastmod });
    }
  }

  return entries;
}

/**
 * Parse a polling interval string like "6h", "30m", "1d" into
 * milliseconds.
 */
function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid polling interval: "${interval}". Use format like "6h", "30m", "1d".`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit];
}

// ── Polling mode ─────────────────────────────────────────────────────

let lastKnownSitemap: Map<string, string | null> = new Map();

async function pollOnce(
  siteUrl: string,
  onChange: (changed: SitemapEntry[]) => void,
): Promise<void> {
  const entries = await fetchSitemap(siteUrl);
  const changed: SitemapEntry[] = [];

  for (const entry of entries) {
    const prev = lastKnownSitemap.get(entry.loc);
    if (prev === undefined || prev !== entry.lastmod) {
      changed.push(entry);
    }
  }

  // Update cache
  lastKnownSitemap = new Map(entries.map((e) => [e.loc, e.lastmod]));

  if (changed.length > 0) {
    onChange(changed);
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Watch a site for content changes. Uses polling mode by comparing
 * sitemap lastmod dates at the configured interval.
 */
export function watchForChanges(config: WatcherConfig): void {
  const intervalMs = parseInterval(config.polling_interval);

  console.log(
    `[watcher] Polling "${config.siteUrl}" every ${config.polling_interval}`,
  );

  const run = async () => {
    try {
      await pollOnce(config.siteUrl, (changed) => {
        console.log(
          `[watcher] Detected ${changed.length} changed page(s):`,
          changed.map((c) => c.loc),
        );
      });
    } catch (err) {
      console.error('[watcher] Poll error:', err);
    }
  };

  // Initial poll
  void run();
  // Recurring
  setInterval(() => void run(), intervalMs);
}

/**
 * Create an HTTP request handler for webhook-based change notifications.
 *
 * Validates the request signature against the shared secret using HMAC
 * SHA-256, then triggers the provided callback with the parsed payload.
 */
export function createWebhookHandler(
  secret: string,
  onWebhook?: (payload: unknown) => void,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      // Validate signature
      const signature = req.headers['x-signature'] as string | undefined;
      if (secret && signature) {
        const expected = createHmac('sha256', secret)
          .update(body)
          .digest('hex');
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');

        if (
          sigBuffer.length !== expectedBuffer.length ||
          !timingSafeEqual(sigBuffer, expectedBuffer)
        ) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Invalid signature');
          return;
        }
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body.toString('utf-8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON');
        return;
      }

      console.log('[webhook] Received change notification');
      onWebhook?.(payload);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  };
}

/**
 * Convenience: start a webhook HTTP server on the given port.
 */
export function startWebhookServer(
  port: number,
  secret: string,
  onWebhook?: (payload: unknown) => void,
): void {
  const handler = createWebhookHandler(secret, onWebhook);
  const server = createServer(handler);
  server.listen(port, () => {
    console.log(`[webhook] Listening on port ${port}`);
  });
}
