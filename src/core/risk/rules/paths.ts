import type { DiffFile } from '../../types';

function pathBase(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

export function lowerBase(path: string): string {
  return pathBase(path).toLowerCase();
}

export function isGeneratedPath(path: string, file: DiffFile): boolean {
  const lower = path.toLowerCase();
  return (
    file.generated ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.map')
  );
}

export function isVendoredPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('/vendor/') ||
    lower.startsWith('vendor/') ||
    lower.includes('/vendors/') ||
    lower.startsWith('vendors/') ||
    lower.includes('/third_party/') ||
    lower.startsWith('third_party/') ||
    lower.includes('/third-party/') ||
    lower.startsWith('third-party/') ||
    lower.includes('/node_modules/') ||
    lower.startsWith('node_modules/') ||
    lower.includes('/bower_components/') ||
    lower.startsWith('bower_components/')
  );
}

export function isLockPath(path: string): boolean {
  const base = lowerBase(path);
  return (
    base === 'package-lock.json' ||
    base === 'npm-shrinkwrap.json' ||
    base === 'yarn.lock' ||
    base === 'pnpm-lock.yaml' ||
    base === 'cargo.lock' ||
    base === 'gemfile.lock' ||
    base === 'composer.lock' ||
    base === 'go.sum' ||
    base === 'go.work.sum' ||
    base === 'podfile.lock' ||
    base.endsWith('.lock') ||
    base.endsWith('.lock.json')
  );
}

export function isDocsPath(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lowerBase(path);
  return (
    lower.includes('/docs/') ||
    lower.startsWith('docs/') ||
    lower.includes('/documentation/') ||
    base.startsWith('readme') ||
    base.startsWith('changelog') ||
    base.endsWith('.md') ||
    base.endsWith('.mdx')
  );
}

const LOW_BINARY_MARKERS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.ttf',
  '.otf',
  '.woff',
] as const;

export function lowBinaryPath(path: string): boolean {
  const lower = path.toLowerCase();
  return LOW_BINARY_MARKERS.some((marker) => lower.includes(marker));
}

const EXAMPLE_ENV_SUFFIXES = ['.example', '.sample', '.template'] as const;
const SENSITIVE_SUFFIXES = ['.pem', '.key', '.p12', '.tfstate'] as const;
const SENSITIVE_NAMES: ReadonlySet<string> = new Set(['id_rsa', 'id_ed25519', '.netrc']);

function isEnvFile(base: string): boolean {
  if (base === '.env') {
    return true;
  }
  return base.startsWith('.env.') && !EXAMPLE_ENV_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

export function isSensitivePath(path: string): boolean {
  const base = lowerBase(path);
  return (
    isEnvFile(base) ||
    SENSITIVE_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
    SENSITIVE_NAMES.has(base) ||
    (base.startsWith('serviceaccount') && base.endsWith('.json'))
  );
}
