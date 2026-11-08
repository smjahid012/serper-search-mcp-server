#!/usr/bin/env node
/**
 * Generates the root index.js (zero-build CJS entry) from src/index.ts.
 *
 *   node scripts/bundle.mjs           → writes index.js
 *   node scripts/bundle.mjs --check   → verifies index.js is up to date (use in CI)
 *
 * Single source of truth: src/. Never edit index.js by hand.
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'index.js');
const check = process.argv.includes('--check');

const buildOptions = (out) => ({
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: out,
  external: ['@modelcontextprotocol/sdk'],
  logLevel: 'warning',
});

const normalize = (text) => text.replace(/\r\n/g, '\n');

if (check) {
  const dir = mkdtempSync(join(tmpdir(), 'serper-bundle-'));
  try {
    await build(buildOptions(join(dir, 'index.js')));
    const generated = normalize(readFileSync(join(dir, 'index.js'), 'utf8'));
    let current = '';
    try {
      current = normalize(readFileSync(outfile, 'utf8'));
    } catch {
      // index.js missing — treated as stale
    }
    if (generated === current) {
      console.log('index.js is up to date with src/');
    } else {
      console.error('index.js is STALE — run `npm run bundle` and commit the result.');
      process.exitCode = 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  await build(buildOptions(outfile));
  console.log('Bundled src/index.ts -> index.js');
}
