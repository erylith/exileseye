/**
 * esbuild config for the Chrome extension.
 * Produces individual bundles per entry point — Chrome MV3 requires separate
 * files for the service worker, content scripts, and panel pages.
 *
 * Usage:
 *   node build.mjs          # single build
 *   node build.mjs --watch  # rebuild on change
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const watch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  target: 'es2022',
  logLevel: 'info',
};

// Copy static HTML/CSS files to dist/
function copyStatic() {
  fs.mkdirSync('dist', { recursive: true });

  const staticFiles = [
    ['src/panel/panel.html',     'panel.html'],
    ['src/panel/panel.css',      'dist/panel.css'],
    ['src/options/options.html', 'options.html'],
    ['src/options/options.css',  'dist/options.css'],
    ['src/content.css',          'dist/content.css'],
  ];

  for (const [src, dest] of staticFiles) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

copyStatic();

const contexts = await Promise.all([
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/background.ts'],
    outfile: 'dist/background.js',
    // Service workers must be ESM in MV3
    format: 'esm',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/content.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/page-script.ts'],
    outfile: 'dist/page-script.js',
    format: 'iife',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/panel/panel.ts'],
    outfile: 'dist/panel.js',
    format: 'iife',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/options/options.ts'],
    outfile: 'dist/options.js',
    format: 'iife',
  }),
]);

if (watch) {
  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('Watching for changes…');
} else {
  await Promise.all(contexts.map(ctx => ctx.rebuild().then(r => {
    ctx.dispose();
    return r;
  })));
  console.log('Build complete → dist/');
}
