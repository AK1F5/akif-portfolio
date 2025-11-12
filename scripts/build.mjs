#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function ensureCleanDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
}

async function copyFile(sourceRelative, targetRelative) {
  const source = path.join(rootDir, sourceRelative);
  const target = path.join(distDir, targetRelative);
  const contents = await readFile(source, 'utf8');
  const normalized = contents
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n');
  await writeFile(target, normalized, 'utf8');
  return { target: targetRelative, bytes: Buffer.byteLength(normalized, 'utf8') };
}

async function copyDirectory(sourceRelative, targetRelative) {
  const source = path.join(rootDir, sourceRelative);
  const target = path.join(distDir, targetRelative);
  await cp(source, target, { recursive: true });
  return { target: targetRelative, bytes: await calculateSize(target) };
}

async function calculateSize(entryPath) {
  const entryStat = await stat(entryPath);
  if (entryStat.isDirectory()) {
    const entries = await readdirRecursive(entryPath);
    let total = 0;
    for (const filePath of entries) {
      const fileStat = await stat(filePath);
      total += fileStat.size;
    }
    return total;
  }
  return entryStat.size;
}

async function readdirRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readdirRecursive(resolved)));
    } else {
      files.push(resolved);
    }
  }
  return files;
}

async function build() {
  const manifest = [];

  await ensureCleanDist();
  console.log('⚙️  Cleaning previous build artifacts...');

  const copies = [
    copyFile('index.html', 'index.html'),
    copyFile('styles.css', 'styles.css'),
    copyFile('index.js', 'index.js'),
  ];

  try {
    await stat(path.join(rootDir, 'assets'));
    copies.push(copyDirectory('assets', 'assets'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    console.warn('⚠️  assets directory not found; skipping asset copy.');
  }

  const results = await Promise.all(copies);
  manifest.push(...results);

  const reportPath = path.join(distDir, 'build-report.json');
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), artifacts: manifest }, null, 2));
  const reportStat = await stat(reportPath);
  manifest.push({ target: path.relative(distDir, reportPath), bytes: reportStat.size });

  console.log('📦 Build summary:');
  for (const item of manifest) {
    console.log(`  • ${item.target} (${item.bytes} bytes)`);
  }
  console.log(`✅ Build output written to ${path.relative(rootDir, distDir)}/`);
}

try {
  await build();
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
