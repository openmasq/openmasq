// Bundles the browser adapter into two SELF-CONTAINED files (a Web Worker loaded by URL
// can't resolve bare specifiers, so it must be pre-bundled):
//   dist/browser/index.js   — ESM, the host facade (imported by the consumer's bundler)
//   dist/browser/worker.js  — IIFE classic worker (spawned via `new Worker(url)`)
// Both are platform:'browser'; the shared core's `typeof Buffer`/fs branches are dead here.
import { build } from 'esbuild';

const common = { bundle: true, platform: 'browser', target: 'es2020', logLevel: 'info' };

await build({ ...common, entryPoints: ['src/browser/index.ts'], outfile: 'dist/browser/index.js', format: 'esm' });
await build({ ...common, entryPoints: ['src/browser/worker.ts'], outfile: 'dist/browser/worker.js', format: 'iife' });

console.log('tesseract2.js: browser bundle written to dist/browser/{index,worker}.js');
