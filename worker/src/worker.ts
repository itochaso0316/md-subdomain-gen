export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    // Normalize: strip trailing slash, default to /index
    if (path === '/') {
      path = '/index';
    } else {
      path = path.replace(/\/$/, '');
    }

    // Try KV lookup
    const key = `md:${path}`;
    let content = await env.MD_CONTENT.get(key);

    if (!content) {
      // Try with /index suffix for directory-style paths
      const indexKey = `md:${path}/index`;
      content = await env.MD_CONTENT.get(indexKey);
    }

    if (!content) {
      return new Response(
        `# 404 Not Found\n\nこのページは存在しません。\n\nリクエストパス: ${url.pathname}\n\nメインサイト: ${env.SOURCE_SITE_URL}`,
        {
          status: 404,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        },
      );
    }

    const ua = request.headers.get('user-agent') || '';
    const isAIAgent =
      /GPTBot|ChatGPT|Claude|Anthropic|PerplexityBot|Bytespider|Google-Extended|Googlebot/i.test(ua);

    const headers = new Headers({
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Format': 'markdown+schema.org',
      'X-Source-Site': env.SOURCE_SITE_URL,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });

    if (isAIAgent) {
      headers.set('X-AI-Optimized', 'true');
      headers.set('X-Token-Estimate', String(Math.ceil(content.length / 4)));
    }

    return new Response(content, { headers });
  },
};
