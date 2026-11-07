import { checkArchivePath } from './archive';
import {
  BUNDLE_ENTRIES,
  COMMIT,
  FORMICARIUM_PACKAGE,
  fail,
  isRecord,
  NPM_REGISTRY,
  SHA256,
  TRANSFER_LIMITS,
  VERSION,
} from './shared';

export interface PinnedFile {
  path: string;
  sha256: string;
}

export interface FormicariumPin {
  schemaVersion: 1;
  package: typeof FORMICARIUM_PACKAGE;
  packageVersion: string;
  tarballSha256: string;
  sourceCommit: string;
  files: PinnedFile[];
}

const PIN_FIELDS = [
  'schemaVersion',
  'package',
  'packageVersion',
  'tarballSha256',
  'sourceCommit',
  'files',
];

export function parsePin(value: unknown): FormicariumPin {
  if (!isRecord(value)) fail('INVALID_INPUT', 'pin must be an object');
  const keys = Object.keys(value).sort();
  if (keys.join() !== [...PIN_FIELDS].sort().join())
    fail(
      'INVALID_INPUT',
      `pin needs exactly the fields ${PIN_FIELDS.join(', ')}`,
    );
  if (value.schemaVersion !== 1)
    fail('INVALID_INPUT', 'pin schemaVersion must be 1');
  if (value.package !== FORMICARIUM_PACKAGE)
    fail('INVALID_INPUT', `pin package must be ${FORMICARIUM_PACKAGE}`);
  if (
    typeof value.packageVersion !== 'string' ||
    !VERSION.test(value.packageVersion)
  )
    fail('INVALID_INPUT', 'pin packageVersion must be a released semver');
  if (
    typeof value.tarballSha256 !== 'string' ||
    !SHA256.test(value.tarballSha256)
  )
    fail('INVALID_INPUT', 'pin tarballSha256 must be a SHA256');
  if (
    typeof value.sourceCommit !== 'string' ||
    !COMMIT.test(value.sourceCommit)
  )
    fail('INVALID_INPUT', 'pin sourceCommit must be a full commit');
  if (!Array.isArray(value.files) || value.files.length === 0)
    fail('INVALID_INPUT', 'pin files must be a non-empty array');
  if (value.files.length > TRANSFER_LIMITS.maxArchiveEntries)
    fail('LIMIT_EXCEEDED', 'pin lists more files than an archive may hold');
  const files: PinnedFile[] = [];
  let previous = '';
  for (const raw of value.files) {
    if (
      !isRecord(raw) ||
      Object.keys(raw).sort().join() !== 'path,sha256' ||
      typeof raw.path !== 'string' ||
      typeof raw.sha256 !== 'string' ||
      !SHA256.test(raw.sha256)
    )
      fail('INVALID_INPUT', 'pin files entries are {path, sha256}');
    checkArchivePath(raw.path);
    if (raw.path <= previous)
      fail('INVALID_INPUT', 'pin files must be sorted by path without repeats');
    previous = raw.path;
    files.push({ path: raw.path, sha256: raw.sha256 });
  }
  for (const required of Object.values(BUNDLE_ENTRIES)) {
    if (!files.some((file) => file.path === required))
      fail('INVALID_INPUT', `pin files do not list ${required}`);
  }
  return value as unknown as FormicariumPin;
}

export function tarballUrl(version: string): string {
  return `${NPM_REGISTRY}/${FORMICARIUM_PACKAGE}/-/formicarium-${version}.tgz`;
}
