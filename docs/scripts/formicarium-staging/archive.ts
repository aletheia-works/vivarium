import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { FormicariumPin } from './pin';
import {
  BUNDLE_ENTRIES,
  checkedAdd,
  fail,
  isRecord,
  sha256Hex,
  TRANSFER_LIMITS,
} from './shared';

export interface ArchiveLimits {
  maxExpandedBytes: number;
  maxArchiveEntries: number;
  maxPathBytes: number;
}

export function checkArchivePath(
  path: string,
  maxPathBytes: number = TRANSFER_LIMITS.maxPathBytes,
): void {
  if (new TextEncoder().encode(path).length > maxPathBytes)
    fail('LIMIT_EXCEEDED', `path is longer than ${maxPathBytes} bytes`);
  if (path.length === 0) fail('INVALID_INPUT', 'empty path');
  if (path.includes('\0') || path.includes('\\'))
    fail('INVALID_INPUT', `${JSON.stringify(path)} has a NUL or a backslash`);
  if (path.startsWith('/'))
    fail('INVALID_INPUT', `${JSON.stringify(path)} is absolute`);
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..')
      fail(
        'INVALID_INPUT',
        `${JSON.stringify(path)} has an empty, . or .. segment`,
      );
  }
}

export interface ArchiveFile {
  path: string;
  bytes: Uint8Array;
}

const BLOCK = 512;
const TAR_END_SLACK = 10_240;
const decoder = new TextDecoder('utf-8', { fatal: true });

function field(block: Uint8Array, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  try {
    return decoder.decode(end === -1 ? slice : slice.subarray(0, end));
  } catch {
    fail('INVALID_INPUT', 'tar header field is not UTF-8');
  }
}

function octal(block: Uint8Array, start: number, length: number): number {
  if ((block[start] ?? 0) & 0x80)
    fail('INVALID_INPUT', 'tar header uses a base-256 number');
  const text = field(block, start, length).trim();
  if (!/^[0-7]+$/.test(text))
    fail('INVALID_INPUT', 'tar header number is not octal');
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value))
    fail('INVALID_INPUT', 'tar number overflows');
  return value;
}

function isZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
}

function parsePax(data: Uint8Array): { path?: string; size?: number } {
  const out: { path?: string; size?: number } = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) fail('INVALID_INPUT', 'pax record has no length');
    const lengthText = String.fromCharCode(...data.subarray(at, space));
    if (!/^[1-9]\d{0,9}$/.test(lengthText))
      fail('INVALID_INPUT', 'pax record length is invalid');
    const end = at + Number(lengthText);
    if (end <= space + 1 || end > data.length || data[end - 1] !== 0x0a)
      fail('INVALID_INPUT', 'pax record is truncated');
    let record: string;
    try {
      record = decoder.decode(data.subarray(space + 1, end - 1));
    } catch {
      fail('INVALID_INPUT', 'pax record is not UTF-8');
    }
    const equals = record.indexOf('=');
    if (equals <= 0) fail('INVALID_INPUT', 'pax record has no key');
    const key = record.slice(0, equals);
    const value = record.slice(equals + 1);
    if (key === 'path') out.path = value;
    if (key === 'size') {
      if (!/^\d{1,15}$/.test(value))
        fail('INVALID_INPUT', 'pax size is not a number');
      out.size = Number(value);
    }
    if (key === 'linkpath') fail('INVALID_INPUT', 'pax header names a link');
    at = end;
  }
  return out;
}

const TYPE_NAMES: Record<string, string> = {
  '1': 'hardlink',
  '2': 'symlink',
  '3': 'character device',
  '4': 'block device',
  '5': 'directory',
  '6': 'FIFO',
  '7': 'contiguous file',
  g: 'global pax header',
  L: 'GNU long name',
  K: 'GNU long link',
};

// Read in memory and checked whole before anything touches the disk, so a
// link or an escaping path in any entry fails the run instead of being skipped.
export function readNpmTarball(
  gzipped: Uint8Array,
  limits: ArchiveLimits = TRANSFER_LIMITS,
): ArchiveFile[] {
  let tar: Uint8Array;
  try {
    tar = gunzipSync(gzipped, {
      maxOutputLength:
        limits.maxExpandedBytes +
        limits.maxArchiveEntries * 2 * BLOCK +
        TAR_END_SLACK,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE')
      fail(
        'LIMIT_EXCEEDED',
        `tarball expands beyond ${limits.maxExpandedBytes} bytes`,
      );
    fail('INVALID_INPUT', 'tarball is not gzip');
  }
  const files: ArchiveFile[] = [];
  const seen = new Set<string>();
  let entries = 0;
  let expanded = 0;
  let pax: { path?: string; size?: number } | null = null;
  let at = 0;
  for (;;) {
    if (at + BLOCK > tar.length)
      fail('INVALID_INPUT', 'tar ends without its end marker');
    const header = tar.subarray(at, at + BLOCK);
    if (isZero(header)) {
      if (pax !== null) fail('INVALID_INPUT', 'pax header has no entry');
      if (!isZero(tar.subarray(at)))
        fail('INVALID_INPUT', 'data after the tar end marker');
      break;
    }
    entries = checkedAdd(
      entries,
      1,
      limits.maxArchiveEntries,
      'archive entry count',
    );
    const stored = octal(header, 148, 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1)
      sum += i >= 148 && i < 156 ? 0x20 : (header[i] as number);
    if (sum !== stored) fail('INVALID_INPUT', 'tar header checksum mismatch');
    const magic = field(header, 257, 6);
    if (magic !== 'ustar' && magic !== 'ustar ')
      fail('INVALID_INPUT', 'tar entry is not ustar');
    const type = String.fromCharCode(header[156] as number);
    let size = octal(header, 124, 12);
    if (type === 'x') {
      if (pax !== null) fail('INVALID_INPUT', 'two pax headers in a row');
      expanded = checkedAdd(
        expanded,
        size,
        limits.maxExpandedBytes,
        'expanded archive',
      );
      if (at + BLOCK + size > tar.length)
        fail('INVALID_INPUT', 'pax header is truncated');
      pax = parsePax(tar.subarray(at + BLOCK, at + BLOCK + size));
      at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
      continue;
    }
    if (type !== '0' && type !== '\0')
      fail(
        'INVALID_INPUT',
        `tar entry ${JSON.stringify(field(header, 0, 100))} is a ${TYPE_NAMES[type] ?? `type ${JSON.stringify(type)}`}, not a regular file`,
      );
    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const rawPath = pax?.path ?? (prefix ? `${prefix}/${name}` : name);
    if (pax?.size !== undefined) size = pax.size;
    pax = null;
    if (!rawPath.startsWith('package/'))
      fail('INVALID_INPUT', `${JSON.stringify(rawPath)} is outside package/`);
    const path = rawPath.slice('package/'.length);
    checkArchivePath(path, limits.maxPathBytes);
    if (seen.has(path))
      fail('INVALID_INPUT', `${JSON.stringify(path)} appears twice`);
    seen.add(path);
    expanded = checkedAdd(
      expanded,
      size,
      limits.maxExpandedBytes,
      'expanded archive',
    );
    const start = at + BLOCK;
    if (start + size > tar.length)
      fail('INVALID_INPUT', `${path} is truncated`);
    files.push({ path, bytes: tar.slice(start, start + size) });
    at = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

export function verifyArchiveAgainstPin(
  files: readonly ArchiveFile[],
  pin: FormicariumPin,
): Map<string, Uint8Array> {
  const byPath = new Map(files.map((file) => [file.path, file.bytes]));
  const pinned = new Set(pin.files.map((file) => file.path));
  const unlisted = [...byPath.keys()].filter((path) => !pinned.has(path));
  if (unlisted.length > 0)
    fail(
      'VERIFY_FAILED',
      `tarball holds files the pin does not list: ${unlisted.sort().join(', ')}`,
    );
  const absent = pin.files.filter((file) => !byPath.has(file.path));
  if (absent.length > 0)
    fail(
      'VERIFY_FAILED',
      `pin lists files the tarball lacks: ${absent.map((file) => file.path).join(', ')}`,
    );
  for (const file of pin.files) {
    const digest = sha256Hex(byPath.get(file.path) as Uint8Array);
    if (digest !== file.sha256)
      fail(
        'VERIFY_FAILED',
        `${file.path}: SHA256 ${digest} differs from the pin`,
      );
  }
  for (const notice of [BUNDLE_ENTRIES.license, BUNDLE_ENTRIES.coreLicense]) {
    if ((byPath.get(notice)?.byteLength ?? 0) === 0)
      fail(
        'VERIFY_FAILED',
        `${notice} is missing or empty; the site must ship it`,
      );
  }
  let buildInfo: unknown;
  try {
    buildInfo = JSON.parse(
      new TextDecoder().decode(byPath.get(BUNDLE_ENTRIES.buildInfo)),
    );
  } catch {
    fail('VERIFY_FAILED', `${BUNDLE_ENTRIES.buildInfo} is not JSON`);
  }
  const coreDir = dirname(BUNDLE_ENTRIES.buildInfo);
  const digests = isRecord(buildInfo) ? buildInfo.files : undefined;
  const coreFiles = [...byPath.keys()]
    .filter(
      (path) =>
        dirname(path) === coreDir &&
        path !== BUNDLE_ENTRIES.buildInfo &&
        path !== `${coreDir}/LICENSE`,
    )
    .map((path) => path.slice(coreDir.length + 1))
    .sort();
  if (
    !isRecord(digests) ||
    Object.keys(digests).sort().join() !== coreFiles.join() ||
    coreFiles.some(
      (name) =>
        digests[name] !==
        sha256Hex(byPath.get(`${coreDir}/${name}`) as Uint8Array),
    )
  )
    fail(
      'VERIFY_FAILED',
      `${BUNDLE_ENTRIES.buildInfo} does not describe the shipped core files`,
    );
  return byPath;
}

export function isStagedBundlePath(path: string): boolean {
  if (path === BUNDLE_ENTRIES.license || path === BUNDLE_ENTRIES.coreLicense)
    return true;
  if (path.startsWith('assets/')) return true;
  return path.startsWith('runtime/') && !path.startsWith('runtime/node/');
}
