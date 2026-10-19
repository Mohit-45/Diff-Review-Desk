import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const indexPath = 'dist/index.html';
if (!existsSync(indexPath)) {
  throw new Error('dist/index.html is missing; run npm run build first.');
}

const html = readFileSync(indexPath, 'utf8');
const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
if (headMatch === null) {
  throw new Error('dist/index.html has no head.');
}

const head = headMatch[1].trimStart();
const firstTag = head.match(/^<meta\b[^>]*>/i)?.[0] ?? '';
const csp = /^<meta\b[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i;
if (!csp.test(firstTag)) {
  throw new Error('The CSP meta must be the first child of head.');
}
if ((html.match(/<script\b/gi) ?? []).length !== 2) {
  throw new Error('The production page must have exactly two script tags.');
}
if (/<style\b|\sstyle=|\son[a-z]+=/.test(html)) {
  throw new Error('The production page contains inline style or event attributes.');
}

const publicUrls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/gi)].map((match) => match[1]);
for (const url of publicUrls) {
  if (url === undefined || /^(?:https?:|\/\/|\/)/.test(url)) {
    throw new Error(`Non-relative asset URL: ${url ?? 'missing'}`);
  }
}

const files = readdirSync('dist', { recursive: true, withFileTypes: true });
const assets = files.filter((entry) => entry.isFile() && /\.(?:js|css)$/.test(entry.name));
let scriptBytes = 0;
let styleBytes = 0;
for (const asset of assets) {
  const path = `${asset.parentPath}/${asset.name}`;
  const bytes = readFileSync(path);
  if (asset.name.endsWith('.js')) {
    scriptBytes += gzipSync(bytes).byteLength;
  } else {
    styleBytes += gzipSync(bytes).byteLength;
  }
  if (
    /\b(?:fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|new Worker)/.test(
      bytes.toString(),
    )
  ) {
    throw new Error(`Network or worker API found in ${path}.`);
  }
}
if (scriptBytes > 150 * 1024 || styleBytes > 20 * 1024) {
  throw new Error(`Bundle budget exceeded: JS ${scriptBytes}, CSS ${styleBytes}.`);
}
if (files.some((entry) => entry.isFile() && entry.name.endsWith('.map'))) {
  throw new Error('Source maps are not allowed in dist.');
}
if (
  files.some((entry) => entry.isFile() && statSync(`${entry.parentPath}/${entry.name}`).size === 0)
) {
  throw new Error('dist contains an empty file.');
}
