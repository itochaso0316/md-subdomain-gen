/**
 * validate command — validate generated markdown files for schema correctness
 * and report token counts.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import { validateSchema } from '../validate/schema-validator.js';
import { countTokens } from '../validate/token-counter.js';

export async function runValidate(dir: string): Promise<void> {
  console.log(chalk.bold('\n  md-subdomain-gen validate\n'));

  const resolvedDir = resolve(dir);

  // ── Find markdown files ───────────────────────────────────────────
  const findSpinner = ora('Scanning for markdown files...').start();
  let files: string[];
  try {
    files = await glob('**/*.md', { cwd: resolvedDir, absolute: true });
    if (files.length === 0) {
      findSpinner.fail('No .md files found');
      console.log(chalk.yellow(`  Directory: ${resolvedDir}\n`));
      return;
    }
    findSpinner.succeed(`Found ${chalk.cyan(String(files.length))} markdown file(s)`);
  } catch (err) {
    findSpinner.fail('Failed to scan directory');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  // ── Validate each file ────────────────────────────────────────────
  const validateSpinner = ora('Validating...').start();

  let totalTokens = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let validCount = 0;
  const fileResults: Array<{
    file: string;
    tokens: number;
    errors: number;
    warnings: number;
    valid: boolean;
  }> = [];

  try {
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const tokens = countTokens(content);
      const result = validateSchema(content);

      totalTokens += tokens;
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      if (result.valid) validCount++;

      fileResults.push({
        file: file.replace(resolvedDir + '/', ''),
        tokens,
        errors: result.errors.length,
        warnings: result.warnings.length,
        valid: result.valid,
      });

      // Print per-file errors/warnings
      if (result.errors.length > 0 || result.warnings.length > 0) {
        validateSpinner.stop();
        const relativePath = file.replace(resolvedDir + '/', '');
        console.log(`\n  ${chalk.bold(relativePath)}`);
        for (const err of result.errors) {
          console.log(chalk.red(`    ERROR  ${err.type}/${err.property}: ${err.message}`));
        }
        for (const warn of result.warnings) {
          console.log(chalk.yellow(`    WARN   ${warn.type}/${warn.property}: ${warn.message}`));
        }
        validateSpinner.start('Validating...');
      }
    }

    validateSpinner.succeed('Validation complete');
  } catch (err) {
    validateSpinner.fail('Validation failed');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold('  Results'));
  console.log(chalk.dim('  ─────────────────────────────────'));
  console.log(`  Files checked:   ${chalk.cyan(String(files.length))}`);
  console.log(`  Valid:           ${chalk.green(String(validCount))}`);
  console.log(`  Errors:          ${totalErrors > 0 ? chalk.red(String(totalErrors)) : chalk.green('0')}`);
  console.log(`  Warnings:        ${totalWarnings > 0 ? chalk.yellow(String(totalWarnings)) : chalk.green('0')}`);
  console.log(`  Total tokens:    ${chalk.cyan(totalTokens.toLocaleString())}`);
  console.log('');

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}
