// Build the repo's own flight-motion fixture (tests/fixtures/flight-motion.html, the same page
// scripts/capture-landing.mjs and verify-flight-motion.mjs drive) into this scratch folder and serve
// it with `vite preview`. Nothing is written inside the repo.
//
//   node fixture-server.mjs [--rebuild] [--port=8771]
//
// Run with any cwd; the nanawing2 checkout is the sibling of narenana-website (override with NW2_REPO).
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

export const REPO = process.env.NW2_REPO ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../nanawing2');
// Playwright and Vite come from the repo's own node_modules (npm ci), so versions match its tests.
export const repoRequire = createRequire(resolve(REPO, 'package.json'));
export const { chromium } = repoRequire('playwright');
const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = resolve(here, '..', 'fixture-build');

const vite = await import(
  pathToFileURL(resolve(REPO, 'node_modules/vite/dist/node/index.js')).href
);

export async function buildFixture({ force = false } = {}) {
  const marker = resolve(FIXTURE_DIR, 'tests/fixtures/flight-motion.html');
  if (!force && existsSync(marker)) return FIXTURE_DIR;
  const t = Date.now();
  await vite.build({
    configFile: false,
    root: REPO,
    logLevel: 'error',
    build: {
      outDir: FIXTURE_DIR,
      emptyOutDir: true,
      target: 'chrome120',
      rolldownOptions: {
        input: resolve(REPO, 'tests/fixtures/flight-motion.html'),
        output: {
          codeSplitting: {
            groups: [
              { name: 'babylon', test: /node_modules[\\/]@babylonjs[\\/]/ },
            ],
          },
        },
      },
    },
  });
  console.error(`fixture built in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return FIXTURE_DIR;
}

export async function serveFixture({ port = 0 } = {}) {
  const server = await vite.preview({
    configFile: false,
    root: REPO,
    build: { outDir: FIXTURE_DIR },
    preview: { host: '127.0.0.1', port, strictPort: port !== 0 },
    logLevel: 'error',
  });
  const base = server.resolvedUrls.local[0];
  return { server, base, url: `${base}tests/fixtures/flight-motion.html` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildFixture({ force: process.argv.includes('--rebuild') });
  const port = Number(
    process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? 8771,
  );
  const { url } = await serveFixture({ port });
  console.log(`serving ${url}`);
}
