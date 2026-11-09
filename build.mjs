'use strict';
/**
 * Builds a clean `dist/` folder: only files that should be publicly deployed.
 *
 * Whitelist strategy — nothing extra can leak into production by accident:
 *   index.html            main SPA shell
 *   <route>/index.html    pre-rendered route shells (about, pulse, ...)
 *   img/                  OpenGraph, favicons, avatars (romateo-avatars)
 *   vercel.json           SPA rewrites for unknown paths
 *   assets/               all static assets (bundle, css, images, fonts, cv, og)
 *
 * Everything else (snapshots, manifests, reports, dev server, build files)
 * stays out of dist.
 *
 * Usage: npm run build   →   dist/
 * Deploy: cd dist && npx vercel deploy
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

const ROUTES = ['about', 'bankomat', 'blog', 'components', 'everquests', 'invert', 'pulse', 'umo'];

/* ── clean ───────────────────────────────────────────────────────────────── */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const copied = [];

function copyFile(rel) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) { console.error(`  !! missing: ${rel}`); process.exitCode = 1; return; }
  const to = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied.push({ file: rel, bytes: fs.statSync(to).size });
}

function copyDir(rel) {
  fs.cpSync(path.join(ROOT, rel), path.join(DIST, rel), {
    recursive: true,
    filter: (src) => !/[\\/]\.DS_Store$/.test(src),
  });
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else copied.push({ file: path.relative(DIST, p), bytes: fs.statSync(p).size });
    }
  };
  walk(path.join(DIST, rel));
}

/* ── copy ────────────────────────────────────────────────────────────────── */
copyFile('index.html');
copyDir('img');
copyFile('vercel.json');
for (const route of ROUTES) copyFile(path.join(route, 'index.html'));
copyDir('assets');

/* ── report ──────────────────────────────────────────────────────────────── */
const total = copied.reduce((s, f) => s + f.bytes, 0);
const byFolder = {};
for (const f of copied) {
  const dir = f.file.includes('/') ? f.file.slice(0, f.file.indexOf('/')) : '(root)';
  byFolder[dir] = (byFolder[dir] || 0) + f.bytes;
}
console.log(`dist/ built: ${copied.length} files, ${(total / 1024 / 1024).toFixed(1)} MB`);
for (const [d, b] of Object.entries(byFolder)) console.log(`  ${d}: ${b} bytes`);

/* sanity checks the build fails on */
const mustHave = ['dist/index.html', 'dist/vercel.json', 'dist/img/favicon.ico', 'dist/img/OpenGraph.png', 'dist/assets/index-DWhZCUnu.js', 'dist/assets/index-Dur__Kta.css'];
let ok = true;
for (const f of mustHave) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`  MISSING ${f}`); ok = false; }
}
const leaks = copied.filter(
  (f) => (/\.orig\.bak$|redirect_patch_report|^serve\.js$/.test(f.file)) || (!f.file.startsWith('assets/') && /\.json$/.test(f.file) && f.file !== 'vercel.json'),
);
if (leaks.length) { console.error('  LEAKED FILES:', leaks.map((f) => f.file)); ok = false; }
console.log(ok ? 'sanity: OK' : 'sanity: FAILED');
process.exitCode = ok ? 0 : 1;
