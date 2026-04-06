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
 * Deploy markdown content to Vercel using the Vercel CLI.
 *
 * Requires `vercel` CLI to be installed and authenticated.
 * Deploys the outputDir as a static site to production.
 */
export async function deployVercel(
  config: DeployConfig,
  outputDir: string,
): Promise<DeployResult> {
  const args = [
    'deploy',
    outputDir,
    '--prod',
    '--yes',
  ];

  const result = await exec('vercel', args);

  if (result.code !== 0) {
    return {
      success: false,
      url: '',
      errors: [`vercel deploy failed: ${result.stderr.trim()}`],
    };
  }

  // Vercel CLI prints the deployment URL to stdout
  const url = result.stdout.trim().split('\n').pop() ?? `https://${config.subdomain}.vercel.app`;

  return { success: true, url };
}
