import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { verifyArtifactSet } from '../../../tools/fixed-guest-builder/src/artifact.ts';
import { BuildError } from '../../../tools/fixed-guest-builder/src/errors.ts';
import {
  type Fetcher,
  fetchLimited,
} from '../../../tools/fixed-guest-builder/src/http.ts';
import {
  assetUrl,
  BUILD_INFO_ASSET,
  CATALOG_ASSET,
  RELEASE_REPOSITORY,
  releaseTag,
} from '../../../tools/fixed-guest-builder/src/reuse.ts';
import {
  COI_SERVICEWORKER_FILE,
  coiServiceWorkerProblem,
} from '../coi-serviceworker-pin';
import {
  type AcceptedGuest,
  FORMICARIUM_PIN_PATH,
  type FormicariumRecipe,
  type GuestRole,
  loadGuestAllowlist,
  type RecipeGuest,
  readFormicariumRecipe,
  recipeState,
  validateAccepted,
} from '../generate-recipes-index';
import {
  isStagedBundlePath,
  readNpmTarball,
  verifyArchiveAgainstPin,
} from './archive';
import {
  type FormicariumPin,
  type PinnedFile,
  parsePin,
  tarballUrl,
} from './pin';
import {
  ASSETS_MANIFEST,
  BUNDLE_ENTRIES,
  FORMICARIUM_PACKAGE,
  fail,
  GUEST_TOOLS_PATH,
  LAYER1_DIR,
  LOCAL_ACCEPTED_ASSET,
  SITE_DIR,
  STAGE_DEADLINE_MS,
  STAGED_BUNDLE_DIR,
  STAGED_GUESTS_DIR,
  sha256Hex,
  TRANSFER_LIMITS,
} from './shared';

export interface SummaryRow {
  item: string;
  source: string;
  bytes: number;
  sha256: string;
  ms: number;
}

export interface StageContext {
  fetcher?: Fetcher;
  timeoutSignal?: (ms: number) => AbortSignal;
  now?: () => number;
}

interface RunContext {
  fetcher: Fetcher | undefined;
  timeoutSignal: (ms: number) => AbortSignal;
  now: () => number;
  overall: AbortSignal;
  rows: SummaryRow[];
}

function checkDeadline(ctx: RunContext): void {
  if (ctx.overall.aborted)
    fail('TIMEOUT', `staging passed its ${STAGE_DEADLINE_MS} ms cap`);
}

function withoutQuery(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

async function fetchAsset(
  ctx: RunContext,
  item: string,
  url: string,
  limitBytes: number,
): Promise<Uint8Array> {
  checkDeadline(ctx);
  const started = ctx.now();
  const perFetch = ctx.timeoutSignal(TRANSFER_LIMITS.fetchDeadlineMs);
  const signal = AbortSignal.any([ctx.overall, perFetch]);
  try {
    const result = await fetchLimited(url, {
      limitBytes,
      signal,
      ...(ctx.fetcher === undefined ? {} : { fetcher: ctx.fetcher }),
    });
    ctx.rows.push({
      item,
      // The final URL of a Release asset is signed and short-lived; log
      // where it came from without the query.
      source: withoutQuery(result.finalUrl),
      bytes: result.bytes.byteLength,
      sha256: result.sha256,
      ms: Math.round(ctx.now() - started),
    });
    return result.bytes;
  } catch (error) {
    if (ctx.overall.aborted)
      fail('TIMEOUT', `${url}: staging passed its ${STAGE_DEADLINE_MS} ms cap`);
    if (perFetch.aborted)
      fail(
        'TIMEOUT',
        `${url}: no complete response within ${TRANSFER_LIMITS.fetchDeadlineMs} ms`,
      );
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof BuildError) {
      if (error.code === 'LIMIT_EXCEEDED')
        fail('LIMIT_EXCEEDED', `${url}: ${message}`);
      if (error.code === 'ABORTED') fail('ABORTED', `${url}: ${message}`);
      if (error.code === 'VERIFY_FAILED')
        fail('VERIFY_FAILED', `${url}: ${message}`);
    }
    fail('ASSET_LOAD', `${url}: ${message}`);
  }
}

async function readLocal(
  ctx: RunContext,
  item: string,
  path: string,
  limitBytes: number,
): Promise<Uint8Array> {
  checkDeadline(ctx);
  const started = ctx.now();
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    fail('ASSET_LOAD', `${path}: cannot read`);
  }
  if (size > limitBytes)
    fail('LIMIT_EXCEEDED', `${path} is larger than ${limitBytes} bytes`);
  const bytes = new Uint8Array(await readFile(path));
  if (bytes.byteLength > limitBytes)
    fail('LIMIT_EXCEEDED', `${path} is larger than ${limitBytes} bytes`);
  const sha256 = sha256Hex(bytes);
  ctx.rows.push({
    item,
    source: path,
    bytes: bytes.byteLength,
    sha256,
    ms: Math.round(ctx.now() - started),
  });
  return bytes;
}

export function loadGuestBinaries(
  path = GUEST_TOOLS_PATH,
): Record<string, string> {
  const tools =
    (
      JSON.parse(readFileSync(path, 'utf-8')) as {
        tools?: Record<string, { binary?: unknown }>;
      }
    ).tools ?? {};
  const out: Record<string, string> = {};
  for (const [tool, spec] of Object.entries(tools)) {
    if (
      typeof spec.binary === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spec.binary)
    )
      out[tool] = spec.binary;
  }
  return out;
}

interface StagedGuest {
  role: GuestRole;
  accepted: AcceptedGuest;
  binary: string;
  elf: Uint8Array;
  buildInfo: Uint8Array;
  catalog: Uint8Array;
}

async function verifyGuest(
  slug: string,
  guest: RecipeGuest,
  binaries: Record<string, string>,
  read: (
    asset: string,
    limitBytes: number,
    item: string,
  ) => Promise<Uint8Array>,
  ctx: RunContext,
): Promise<StagedGuest> {
  const { role, accepted } = guest;
  if (accepted === undefined)
    fail('INVALID_INPUT', `${slug}: ${role} is not accepted`);
  const binary = binaries[guest.tool];
  if (binary === undefined)
    fail('INVALID_INPUT', `${slug}: tool ${guest.tool} is not in tools.json`);
  const label = `${slug} ${role}`;
  const buildInfo = await read(
    BUILD_INFO_ASSET,
    TRANSFER_LIMITS.maxMetadataBytes,
    `${label} build-info`,
  );
  const catalog = await read(
    CATALOG_ASSET,
    TRANSFER_LIMITS.maxCatalogBytes,
    `${label} catalog`,
  );
  const elf = await read(binary, TRANSFER_LIMITS.maxElfBytes, `${label} ELF`);
  checkDeadline(ctx);
  let verified: ReturnType<typeof verifyArtifactSet>;
  try {
    verified = verifyArtifactSet(
      { elf, buildInfo, catalog },
      {
        buildKey: accepted.buildKey,
        tool: guest.tool,
        repository: guest.repository,
        commit: accepted.commit,
      },
    );
  } catch (error) {
    fail(
      'VERIFY_FAILED',
      `${label} (tag ${releaseTag(guest.tool, accepted.buildKey)}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (verified.elfSha256 !== accepted.elfSha256)
    fail(
      'VERIFY_FAILED',
      `${label}: ELF SHA256 ${verified.elfSha256} is not the accepted ${accepted.elfSha256}`,
    );
  if (verified.buildInfoSha256 !== accepted.buildInfoSha256)
    fail(
      'VERIFY_FAILED',
      `${label}: build-info SHA256 ${verified.buildInfoSha256} is not the accepted ${accepted.buildInfoSha256}`,
    );
  if (verified.buildInfo.versionOrName !== accepted.versionOrName)
    fail(
      'VERIFY_FAILED',
      `${label}: build-info versionOrName ${verified.buildInfo.versionOrName} is not the accepted ${accepted.versionOrName}`,
    );
  return { role, accepted, binary, elf, buildInfo, catalog };
}

export interface LocalGuestInput {
  dir: string;
  accepted: unknown;
}

export interface LocalInputs {
  tarballPath: string;
  expected: {
    pin: unknown;
    guests?: Record<string, Partial<Record<GuestRole, LocalGuestInput>>>;
  };
}

export interface StageOptions extends StageContext {
  mode: 'pin' | 'local';
  layer1Dir?: string;
  pinPath?: string;
  local?: LocalInputs;
  summaryPath?: string;
}

export interface StageReport {
  mode: 'pin' | 'local';
  version: string | null;
  staged: { slug: string; bytes: number }[];
  pending: { slug: string; reasons: string[] }[];
  rows: SummaryRow[];
}

function recipesIn(layer1Dir: string, hasPin: boolean): FormicariumRecipe[] {
  const allowlist = loadGuestAllowlist();
  const out: FormicariumRecipe[] = [];
  for (const slug of readdirSync(layer1Dir).sort()) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const dir = join(layer1Dir, slug);
    if (!statSync(dir).isDirectory()) continue;
    const recipe = readFormicariumRecipe(slug, dir, allowlist, hasPin);
    if (recipe) out.push(recipe);
  }
  return out;
}

function insideDir(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || !(rel.startsWith('..') || isAbsolute(rel));
}

async function writeOutputs(
  recipe: FormicariumRecipe,
  pin: FormicariumPin,
  tarballSha256: string,
  bundle: Map<string, Uint8Array>,
  guests: StagedGuest[],
  mode: 'pin' | 'local',
): Promise<number> {
  const root = join(recipe.dir, STAGED_BUNDLE_DIR);
  const version = pin.packageVersion;
  let bytes = 0;
  const files: PinnedFile[] = [];
  for (const [path, content] of [...bundle.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (!isStagedBundlePath(path)) continue;
    const target = join(root, version, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    bytes += content.byteLength;
    files.push({ path: `${version}/${path}`, sha256: sha256Hex(content) });
  }
  const manifest = {
    schemaVersion: 1,
    package: FORMICARIUM_PACKAGE,
    version,
    tarballSha256,
    sourceCommit: pin.sourceCommit,
    entries: Object.fromEntries(
      Object.entries(BUNDLE_ENTRIES).map(([name, path]) => [
        name,
        `${version}/${path}`,
      ]),
    ),
    files,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(root, ASSETS_MANIFEST), manifestText);
  bytes += manifestText.length;
  for (const guest of guests) {
    const dir = join(recipe.dir, STAGED_GUESTS_DIR, guest.role);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, guest.binary), guest.elf, { mode: 0o644 });
    await writeFile(join(dir, BUILD_INFO_ASSET), guest.buildInfo);
    await writeFile(join(dir, CATALOG_ASSET), guest.catalog);
    // Only local staging writes it: a pending recipe has no accepted in its
    // recipe.json, and the page falls back to this file for local testing.
    if (mode === 'local')
      await writeFile(
        join(dir, LOCAL_ACCEPTED_ASSET),
        `${JSON.stringify(guest.accepted, null, 2)}\n`,
      );
    bytes +=
      guest.elf.byteLength +
      guest.buildInfo.byteLength +
      guest.catalog.byteLength;
  }
  return bytes;
}

function summaryMarkdown(report: StageReport, failure?: string): string {
  const lines = [
    '### formicarium assets',
    '',
    `Mode: \`${report.mode}\`. Package version: ${report.version ?? 'none (no pin)'}.`,
    '',
  ];
  if (report.rows.length > 0) {
    lines.push(
      '| Item | Source | Bytes | SHA256 | ms |',
      '|---|---|---:|---|---:|',
    );
    for (const row of report.rows)
      lines.push(
        `| ${row.item} | ${row.source} | ${row.bytes} | \`${row.sha256}\` | ${row.ms} |`,
      );
    lines.push('');
  }
  for (const item of report.staged)
    lines.push(`- staged ${item.slug}: ${item.bytes} bytes`);
  for (const item of report.pending)
    lines.push(`- pending ${item.slug}: ${item.reasons.join(', ')}`);
  if (failure) lines.push('', `**Failed:** ${failure}`);
  return `${lines.join('\n')}\n`;
}

export async function stageAssets(options: StageOptions): Promise<StageReport> {
  const layer1Dir = resolve(options.layer1Dir ?? LAYER1_DIR);
  if (insideDir(layer1Dir, SITE_DIR))
    fail('INVALID_INPUT', `staging never writes into ${SITE_DIR}`);
  const timeoutSignal =
    options.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));
  const ctx: RunContext = {
    fetcher: options.fetcher,
    timeoutSignal,
    now: options.now ?? (() => performance.now()),
    overall: timeoutSignal(STAGE_DEADLINE_MS),
    rows: [],
  };
  const report: StageReport = {
    mode: options.mode,
    version: null,
    staged: [],
    pending: [],
    rows: ctx.rows,
  };
  try {
    await stageInto(options, layer1Dir, ctx, report);
  } catch (error) {
    if (options.summaryPath)
      await appendFile(
        options.summaryPath,
        summaryMarkdown(
          report,
          error instanceof Error ? error.message : String(error),
        ),
      );
    throw error;
  }
  if (options.summaryPath)
    await appendFile(options.summaryPath, summaryMarkdown(report));
  return report;
}

async function stageInto(
  options: StageOptions,
  layer1Dir: string,
  ctx: RunContext,
  report: StageReport,
): Promise<void> {
  let pinValue: unknown;
  let hasPin: boolean;
  if (options.mode === 'local') {
    if (options.local === undefined)
      fail('INVALID_INPUT', 'local mode needs its inputs');
    pinValue = options.local.expected.pin;
    hasPin = true;
  } else {
    const pinPath = options.pinPath ?? FORMICARIUM_PIN_PATH;
    hasPin = existsSync(pinPath);
    if (hasPin) {
      try {
        pinValue = JSON.parse(readFileSync(pinPath, 'utf-8'));
      } catch {
        fail('INVALID_INPUT', `${pinPath} is not JSON`);
      }
    }
  }
  const recipes = recipesIn(layer1Dir, hasPin);
  for (const recipe of recipes) {
    await rm(join(recipe.dir, STAGED_BUNDLE_DIR), {
      recursive: true,
      force: true,
    });
    await rm(join(recipe.dir, STAGED_GUESTS_DIR), {
      recursive: true,
      force: true,
    });
  }
  const active: { recipe: FormicariumRecipe; guests: RecipeGuest[] }[] = [];
  for (const recipe of recipes) {
    const guests = recipe.guests.map((guest): RecipeGuest => {
      const input =
        options.mode === 'local'
          ? options.local?.expected.guests?.[recipe.slug]?.[guest.role]
          : undefined;
      if (input === undefined) return guest;
      return {
        ...guest,
        accepted: validateAccepted(
          recipe.slug,
          `expected ${guest.role}`,
          input.accepted,
        ),
      };
    });
    const state = recipeState(guests, hasPin);
    if (state.state === 'pending')
      report.pending.push({ slug: recipe.slug, reasons: state.reasons });
    else active.push({ recipe, guests });
  }
  if (!hasPin) return;
  const pin = parsePin(pinValue);
  report.version = pin.packageVersion;
  const tarball =
    options.mode === 'local'
      ? await readLocal(
          ctx,
          'formicarium tarball',
          resolve((options.local as LocalInputs).tarballPath),
          TRANSFER_LIMITS.maxDownloadBytes,
        )
      : await fetchAsset(
          ctx,
          'formicarium tarball',
          tarballUrl(pin.packageVersion),
          TRANSFER_LIMITS.maxDownloadBytes,
        );
  const tarballSha256 = sha256Hex(tarball);
  if (tarballSha256 !== pin.tarballSha256)
    fail(
      'VERIFY_FAILED',
      `tarball SHA256 ${tarballSha256} is not the pinned ${pin.tarballSha256}`,
    );
  checkDeadline(ctx);
  const bundle = verifyArchiveAgainstPin(readNpmTarball(tarball), pin);
  checkDeadline(ctx);
  const binaries = loadGuestBinaries();
  const prepared: { recipe: FormicariumRecipe; guests: StagedGuest[] }[] = [];
  for (const { recipe, guests: declared } of active) {
    const coiProblem = coiServiceWorkerProblem(
      join(recipe.dir, COI_SERVICEWORKER_FILE),
    );
    if (coiProblem) fail('VERIFY_FAILED', coiProblem);
    const guests: StagedGuest[] = [];
    for (const guest of declared) {
      const accepted = guest.accepted as AcceptedGuest;
      const tag = releaseTag(guest.tool, accepted.buildKey);
      const localDir =
        options.local?.expected.guests?.[recipe.slug]?.[guest.role]?.dir;
      if (options.mode === 'local' && localDir === undefined)
        fail(
          'INVALID_INPUT',
          `${recipe.slug} ${guest.role}: local mode needs a guest dir`,
        );
      const read =
        options.mode === 'local'
          ? (asset: string, limit: number, item: string) =>
              readLocal(ctx, item, resolve(localDir as string, asset), limit)
          : (asset: string, limit: number, item: string) =>
              fetchAsset(
                ctx,
                item,
                assetUrl(RELEASE_REPOSITORY, tag, asset),
                limit,
              );
      guests.push(await verifyGuest(recipe.slug, guest, binaries, read, ctx));
    }
    prepared.push({ recipe, guests });
  }
  checkDeadline(ctx);
  for (const { recipe, guests } of prepared) {
    const bytes = await writeOutputs(
      recipe,
      pin,
      tarballSha256,
      bundle,
      guests,
      options.mode,
    );
    report.staged.push({ slug: recipe.slug, bytes });
  }
}
