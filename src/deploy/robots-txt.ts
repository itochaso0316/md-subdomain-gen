import { readFile, writeFile } from 'node:fs/promises';

/** AI agent bot names that should be directed to the markdown subdomain. */
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'PerplexityBot',
  'Bytespider',
] as const;

const SECTION_HEADER = '# ── md-subdomain: AI Agent Directives ──';
const SECTION_FOOTER = '# ── /md-subdomain ──';

/**
 * Generate robots.txt additions that direct AI agents to the markdown subdomain.
 *
 * Uses non-standard `Markdown-Site` and `Markdown-Alt` directives
 * as proposed by the md-subdomain spec, plus standard `Sitemap` for
 * the markdown sitemap.
 */
export function generateRobotsTxtAdditions(mdSubdomain: string): string {
  const lines: string[] = [
    '',
    SECTION_HEADER,
    '',
    `# Markdown subdomain: ${mdSubdomain}`,
    `# AI agents should prefer the markdown version for structured content.`,
    '',
  ];

  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`);
    lines.push(`Markdown-Site: ${mdSubdomain}`);
    lines.push(`Markdown-Alt: ${mdSubdomain}/{path}.md`);
    lines.push('');
  }

  // Generic directive for any AI crawler
  lines.push('User-agent: *');
  lines.push(`Markdown-Site: ${mdSubdomain}`);
  lines.push(`Markdown-Alt: ${mdSubdomain}/{path}.md`);
  lines.push('');

  lines.push(`Sitemap: ${mdSubdomain}/sitemap.xml`);
  lines.push('');
  lines.push(SECTION_FOOTER);
  lines.push('');

  return lines.join('\n');
}

/**
 * Update an existing robots.txt file by appending md-subdomain directives.
 *
 * Non-destructive: existing rules are preserved. If md-subdomain directives
 * already exist (identified by the section header), they are replaced.
 *
 * @param robotsTxtContent - The current content of robots.txt
 * @param mdSubdomain - The full URL of the markdown subdomain (e.g. "https://md.example.com")
 * @returns The updated robots.txt content
 */
export function updateRobotsTxt(robotsTxtContent: string, mdSubdomain: string): string {
  const additions = generateRobotsTxtAdditions(mdSubdomain);

  // If existing md-subdomain section exists, replace it
  const headerIdx = robotsTxtContent.indexOf(SECTION_HEADER);
  const footerIdx = robotsTxtContent.indexOf(SECTION_FOOTER);

  if (headerIdx !== -1 && footerIdx !== -1) {
    const before = robotsTxtContent.slice(0, headerIdx).trimEnd();
    const after = robotsTxtContent.slice(footerIdx + SECTION_FOOTER.length).trimStart();
    return before + additions + (after ? '\n' + after : '');
  }

  // Append to existing content
  const trimmed = robotsTxtContent.trimEnd();
  return trimmed + additions;
}

/**
 * Read a robots.txt file, update it with md-subdomain directives, and write it back.
 */
export async function updateRobotsTxtFile(
  robotsTxtPath: string,
  mdSubdomain: string,
): Promise<void> {
  let content = '';
  try {
    content = await readFile(robotsTxtPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    // File does not exist; start fresh
  }

  const updated = updateRobotsTxt(content, mdSubdomain);
  await writeFile(robotsTxtPath, updated, 'utf-8');
}
