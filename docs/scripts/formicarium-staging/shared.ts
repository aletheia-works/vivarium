import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  MAX_CATALOG_BYTES,
  MAX_ELF_BYTES,
  MAX_METADATA_BYTES,
} from '../../../tools/fixed-guest-builder/src/artifact.ts';
import { DOCS_DIR, REPO_ROOT } from '../site-paths';

export const FORMICARIUM_PACKAGE = '@aletheia-works/formicarium';
export const NPM_REGISTRY = 'https://registry.npmjs.org';
export const LAYER1_DIR = join(REPO_ROOT, 'src', 'layer1_wasm');
export const SITE_DIR = join(DOCS_DIR, 'doc_build');
export const GUEST_TOOLS_PATH = join(
  REPO_ROOT,
  'tools',
  'fixed-guest-builder',
  'tools.json',
);
export const STAGED_BUNDLE_DIR = '_formicarium';
export const STAGED_GUESTS_DIR = 'guests';
export const ASSETS_MANIFEST = 'assets.json';
export const LOCAL_ACCEPTED_ASSET = 'accepted.json';

export const TRANSFER_LIMITS = {
  fetchDeadlineMs: 120_000,
  maxDownloadBytes: 134_217_728,
  maxExpandedBytes: 268_435_456,
  maxElfBytes: MAX_ELF_BYTES,
  maxArchiveEntries: 4096,
  maxMetadataBytes: MAX_METADATA_BYTES,
  maxCatalogBytes: MAX_CATALOG_BYTES,
  maxPathBytes: 4096,
} as const;

// Operational cap on the whole run, stricter than the transfer limits above
// and not a C11 limit; raising it needs a reviewed measurement.
export const STAGE_DEADLINE_MS = 360_000;

export const PAGES_SITE_LIMIT_BYTES = 1_073_741_824;

export const BUNDLE_ENTRIES = {
  public: 'runtime/public.js',
  browser: 'runtime/web/api.js',
  worker: 'runtime/web/package-worker.bundle.js',
  loader: 'assets/paludarium/index.mjs',
  wasm: 'assets/paludarium/paludarium.wasm',
  buildInfo: 'assets/paludarium/build-info.json',
  license: 'LICENSE',
  coreLicense: 'assets/paludarium/LICENSE',
} as const;

export type StageErrorCode =
  | 'INVALID_INPUT'
  | 'LIMIT_EXCEEDED'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'ASSET_LOAD'
  | 'VERIFY_FAILED';

export class StageError extends Error {
  readonly code: StageErrorCode;

  constructor(code: StageErrorCode, message: string) {
    super(message);
    this.name = 'StageError';
    this.code = code;
  }
}

export function fail(code: StageErrorCode, message: string): never {
  throw new StageError(code, message);
}

export const SHA256 = /^[0-9a-f]{64}$/;
export const COMMIT = /^[0-9a-f]{40}$/;
export const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function checkedAdd(
  total: number,
  add: number,
  limit: number,
  what: string,
) {
  const sum = total + add;
  if (!Number.isSafeInteger(sum) || sum > limit)
    fail('LIMIT_EXCEEDED', `${what} is larger than ${limit}`);
  return sum;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
