/**
 * Cloudflare Worker that serves markdown content from KV.
 *
 * KV Namespace binding: MD_CONTENT
 * Key format: md:/{path}
 */

export interface Env {
  MD_CONTENT: KVNamespace;
}

/** User-Agent patterns for known AI agent crawlers. */
const AI_AGENT_PATTERNS = [
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'PerplexityBot',
  'Bytespider',
  'Googlebot',           // May also benefit from markdown
  'Bingbot',
];

/**
 * Check if the request comes from a known AI agent.
 */
function isAiAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return AI_AGENT_PATTERNS.some((pattern) => ua.includes(pattern.toLowerCase()));
}

/**
 * Build the KV key from the request URL path.
 *
 * - Strips trailing slashes
 * - Strips `.md` extension if present
 * - Prefixes with `md:/`
 * - Root path becomes `md:/`
 */
function toKvKey(pathname: string): string {
  let path = pathname.replace(/\/+$/, '').replace(/\.md$/, '');
  if (!path || path === '/') {
    return 'md:/';
  }
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  return `md:${path}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') ?? '';
    const aiOptimized = isAiAgent(userAgent);

    const kvKey = toKvKey(url.pathname);
    const content = await env.MD_CONTENT.get(kvKey);

    const headers = new Headers({
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type': 'markdown',
    });

    if (aiOptimized) {
      headers.set('X-AI-Optimized', 'true');
    }

    if (content === null) {
      const notFound = [
        '# 404 - Page Not Found',
        '',
        `The requested page \`${url.pathname}\` was not found.`,
        '',
        '---',
        '',
        '[Return to top](/) ',
      ].join('\n');

      return new Response(notFound, { status: 404, headers });
    }

    return new Response(content, { status: 200, headers });
  },
};
