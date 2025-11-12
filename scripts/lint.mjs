#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const IGNORED_FOLDERS = new Set(['.git', 'node_modules', 'dist']);

function parseArgs(argv) {
  const args = { scope: null };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--scope') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Expected a value after --scope');
      }
      args.scope = value.toLowerCase();
      index += 1;
    }
  }
  if (args.scope && !['html', 'css', 'js'].includes(args.scope)) {
    throw new Error(`Unknown scope "${args.scope}". Expected one of html, css, js.`);
  }
  return args;
}

async function walkForExtensions(directory, extensions) {
  const results = [];
  async function visit(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_FOLDERS.has(entry.name)) continue;
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (extensions.has(path.extname(entry.name))) {
        results.push(absolute);
      }
    }
  }
  await visit(directory);
  results.sort();
  return results;
}

function formatLocation(filePath, line) {
  return `${path.relative(rootDir, filePath)}:${line}`;
}

async function lintHtml() {
  const files = await walkForExtensions(rootDir, new Set(['.html']));
  const errors = [];
  const warnings = [];

  for (const filePath of files) {
    const contents = await readFile(filePath, 'utf8');
    const relative = path.relative(rootDir, filePath);

    if (!/^<!DOCTYPE html>/i.test(contents.trimStart())) {
      errors.push(`${relative}: Missing <!DOCTYPE html> declaration.`);
    }

    if (!/<html\b[^>]*\blang=/i.test(contents)) {
      errors.push(`${relative}: <html> tag is missing a lang attribute.`);
    }

    if (!/<meta\b[^>]*name=["']viewport["']/i.test(contents)) {
      warnings.push(`${relative}: Missing responsive <meta name="viewport"> tag.`);
    }

    const missingAlt = [];
    const imgPattern = /<img\b[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgPattern.exec(contents)) !== null) {
      const markup = imgMatch[0];
      if (!/\balt=/i.test(markup)) {
        const upToMatch = contents.slice(0, imgMatch.index);
        const line = upToMatch.split(/\r?\n/).length;
        missingAlt.push(formatLocation(filePath, line));
      }
    }

    missingAlt.forEach((location) => {
      errors.push(`${location}: <img> tag is missing an alt attribute.`);
    });

    const buttonPattern = /<button\b[^>]*>/gi;
    let buttonMatch;
    while ((buttonMatch = buttonPattern.exec(contents)) !== null) {
      const markup = buttonMatch[0];
      if (!/\btype=/i.test(markup)) {
        const upToMatch = contents.slice(0, buttonMatch.index);
        const line = upToMatch.split(/\r?\n/).length;
        warnings.push(`${formatLocation(filePath, line)}: <button> should explicitly declare a type attribute.`);
      }
    }
  }

  return { errors, warnings };
}

async function lintCss() {
  const files = await walkForExtensions(rootDir, new Set(['.css']));
  const errors = [];
  const warnings = [];

  for (const filePath of files) {
    const contents = await readFile(filePath, 'utf8');
    const relative = path.relative(rootDir, filePath);

    // Check for mixed tabs to avoid inconsistent indentation.
    const lines = contents.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\t/.test(line)) {
        errors.push(`${relative}:${index + 1}: Tabs detected; please use spaces for indentation.`);
      }
      if (line.length > 140) {
        warnings.push(`${relative}:${index + 1}: Line exceeds 140 characters and may harm readability.`);
      }
    });

    // Basic brace balance check.
    let balance = 0;
    for (const char of contents) {
      if (char === '{') balance += 1;
      if (char === '}') balance -= 1;
      if (balance < 0) {
        errors.push(`${relative}: Unexpected closing brace detected.`);
        break;
      }
    }
    if (balance > 0) {
      errors.push(`${relative}: Missing closing brace detected.`);
    }

    // Identify duplicated selectors as a potential maintenance concern.
    const selectorPattern = /(?!@)([^{}]+)\{/g;
    const seenSelectors = new Map();
    let match;
    while ((match = selectorPattern.exec(contents)) !== null) {
      const rawSelector = match[1].trim();
      if (!rawSelector) continue;
      const normalized = rawSelector.replace(/\s+/g, ' ');
      const preceding = contents.slice(0, match.index);
      const line = preceding.split(/\r?\n/).length;
      if (seenSelectors.has(normalized)) {
        const firstSeenLine = seenSelectors.get(normalized);
        warnings.push(
          `${relative}:${line}: Duplicate selector "${normalized}" detected (first seen at line ${firstSeenLine}).`
        );
      } else {
        seenSelectors.set(normalized, line);
      }
    }

    if (/!important/i.test(contents)) {
      warnings.push(`${relative}: Avoid using !important; consider refactoring specificity instead.`);
    }
  }

  return { errors, warnings };
}

async function lintJs() {
  const files = await walkForExtensions(rootDir, new Set(['.js']));
  const errors = [];
  const warnings = [];

  for (const filePath of files) {
    const relative = path.relative(rootDir, filePath);
    try {
      await execFileAsync(process.execPath, ['--check', filePath]);
    } catch (error) {
      errors.push(`${relative}: JavaScript syntax error detected.\n${error.stderr || error.message}`);
      continue;
    }

    const contents = await readFile(filePath, 'utf8');
    const trimmed = contents.trimStart();
    if (!trimmed.startsWith('"use strict";') && !trimmed.startsWith("'use strict';")) {
      warnings.push(`${relative}: Consider enabling strict mode at the top of the file.`);
    }

    if (/\bvar\b/.test(contents)) {
      warnings.push(`${relative}: Avoid using var; prefer const or let.`);
    }
  }

  return { errors, warnings };
}

async function main() {
  try {
    const { scope } = parseArgs(process.argv);
    const tasks = new Map([
      ['html', lintHtml],
      ['css', lintCss],
      ['js', lintJs],
    ]);

    const scopesToRun = scope ? [scope] : Array.from(tasks.keys());
    let hasErrors = false;

    for (const currentScope of scopesToRun) {
      const task = tasks.get(currentScope);
      const { errors, warnings } = await task();

      if (errors.length === 0 && warnings.length === 0) {
        console.log(`[${currentScope}] ✔ No issues found.`);
        continue;
      }

      console.log(`[${currentScope}]`);
      warnings.forEach((warning) => {
        console.warn(`  warning: ${warning}`);
      });
      errors.forEach((error) => {
        hasErrors = true;
        console.error(`  error: ${error}`);
      });
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`lint failed: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
