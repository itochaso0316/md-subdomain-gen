import { spawn } from 'node:child_process';
import type { DeployConfig } from '../config.js';

export interface DeployResult {
  success: boolean;
  url: string;
  errors?: string[];
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
 * Deploy markdown content to Netlify using the Netlify CLI.
 *
 * Requires `netlify-cli` to be installed and authenticated.
 * Deploys the outputDir as a static site.
 */
export async function deployNetlify(
  config: DeployConfig,
  outputDir: string,
): Promise<DeployResult> {
  // Deploy using netlify CLI
  const args = [
    'deploy',
    '--dir', outputDir,
    '--prod',
    '--json',
  ];

  const result = await exec('netlify', args);

  if (result.code !== 0) {
    return {
      success: false,
      url: '',
      errors: [`netlify deploy failed: ${result.stderr.trim()}`],
    };
  }

  // Parse JSON output from netlify CLI
  let url = '';
  try {
    const output = JSON.parse(result.stdout);
    url = output.deploy_url ?? output.url ?? '';
  } catch {
    // Fall back to regex extraction
    const urlMatch = result.stdout.match(/https?:\/\/[^\s"]+\.netlify\.app/);
    url = urlMatch?.[0] ?? `https://${config.subdomain}.netlify.app`;
  }

  return { success: true, url };
}
