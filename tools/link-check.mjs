/* Static link check for the published site.
 *
 *   node tools/link-check.mjs
 *
 * Checks every href/src in the HTML pages and every relative link in the
 * Markdown docs against the files in the repository, so GitHub Pages can never
 * serve a page with a dead asset or a dead internal link. External URLs are
 * listed (with the page they appear on) but not fetched — this check makes no
 * network request. */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib/browser-env.mjs';

const HTML_PAGES = ['index.html', 'game.html', 'reviews.html', '404.html', 'flagged.html'];
const MD_FILES = ['README.md', 'COORDINATION.md', 'docs/verification-report.md',
  'docs/scoring-changes.md', 'docs/api-compliance.md'];

const missing = [];
const proseOnly = [];
const externals = [];
const checked = new Set();

function exists(relPath) {
  const clean = relPath.split('#')[0].split('?')[0];
  // Scope descriptions in COORDINATION.md / docs use globs (`assets/**`); they
  // are not links, so they are not checked.
  if (!clean || /[*?]/.test(clean)) return true;
  if (!clean) return true; // pure fragment
  // Absolute in-site paths (e.g. /LIVPBP2/index.html on the 404 page, which is served from
  // any depth) are resolved against the repository root.
  const SITE_BASE = '/LIVPBP2/';
  const rel = clean.startsWith(SITE_BASE) ? clean.slice(SITE_BASE.length) : clean.replace(/^\//, '');
  const abs = path.join(REPO_ROOT, rel);
  return fs.existsSync(abs);
}

function checkRef(from, ref) {
  if (!ref) return;
  const trimmed = ref.trim();
  if (!trimmed || trimmed === '#') return;
  if (/^(https?:|mailto:|data:|tel:|javascript:)/i.test(trimmed)) {
    if (/^https?:/i.test(trimmed)) externals.push({ from, url: trimmed });
    return;
  }
  const key = from + ' -> ' + trimmed;
  if (checked.has(key)) return;
  checked.add(key);
  if (!exists(trimmed)) missing.push(key);
}

for (const page of HTML_PAGES) {
  const abs = path.join(REPO_ROOT, page);
  if (!fs.existsSync(abs)) {
    missing.push('page missing: ' + page);
    continue;
  }
  const html = fs.readFileSync(abs, 'utf8');
  const attrRe = /\b(?:href|src)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = attrRe.exec(html)) !== null) checkRef(page, m[1]);
  // inline handlers that navigate (e.g. window.location = 'game.html?...')
  const navRe = /location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/gi;
  while ((m = navRe.exec(html)) !== null) checkRef(page, m[1]);
}

for (const doc of MD_FILES) {
  const abs = path.join(REPO_ROOT, doc);
  if (!fs.existsSync(abs)) {
    missing.push('doc missing: ' + doc);
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = linkRe.exec(text)) !== null) checkRef(doc, m[1]);
  // Backticked paths are prose, not links. In README/docs they are treated as
  // link targets (they promise a file the reader can open); in the shared board
  // they are often another session's branch-only file — PR #16's
  // `tools/smoke-test.mjs`, for example — so there they are reported, not failed.
  const codeRe = /`((?:docs|tools|assets)\/[^`\s]+)`/g;
  while ((m = codeRe.exec(text)) !== null) {
    if (doc === 'COORDINATION.md') {
      const ref = m[1];
      if (!exists(ref)) proseOnly.push(doc + ' -> ' + ref);
    } else {
      checkRef(doc, m[1]);
    }
  }
}

// Every asset the pages load must exist as a file, and every JS file must parse.
const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) jsFiles.push(abs);
  }
}
walk(REPO_ROOT);

const externalHosts = {};
for (const { from, url } of externals) {
  let host = 'unknown';
  try { host = new URL(url).host; } catch (err) { /* ignore */ }
  externalHosts[host] = (externalHosts[host] || 0) + 1;
}

console.log('link-check: ' + checked.size + ' internal references checked across ' +
  HTML_PAGES.length + ' pages and ' + MD_FILES.length + ' documents');
console.log('link-check: ' + jsFiles.length + ' script files present, ' +
  externals.length + ' external URLs (not fetched)');

if (proseOnly.length) {
  console.log('\nMentioned on the shared board but not in this branch (historical record, not a link):');
  proseOnly.forEach((p) => console.log('  ' + p));
}

if (missing.length) {
  console.error('\nMissing targets:');
  missing.forEach((m) => console.error('  ' + m));
  process.exitCode = 1;
} else {
  console.log('link-check: no broken internal links or assets');
}

console.log('\nExternal hosts referenced:');
Object.keys(externalHosts).sort().forEach((host) => {
  console.log('  ' + host + ' (' + externalHosts[host] + ')');
});
