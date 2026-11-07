import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import {
  COI_SERVICEWORKER_FILE,
  coiServiceWorkerProblem,
} from '../coi-serviceworker-pin';
import { REPO_ROOT } from '../site-paths';
import { checkArchivePath } from './archive';
import type { PinnedFile } from './pin';
import {
  ASSETS_MANIFEST,
  BUNDLE_ENTRIES,
  checkedAdd,
  fail,
  LOCAL_ACCEPTED_ASSET,
  PAGES_SITE_LIMIT_BYTES,
  SITE_DIR,
  STAGED_BUNDLE_DIR,
  sha256Hex,
} from './shared';

export interface SiteReport {
  bytes: number;
  // GitHub Pages states no per-file limit; the largest file is recorded per build.
  largest: { path: string; bytes: number } | null;
  coiCopies: number;
  bundles: number;
  hiddenFiles: string[];
}

export const DEPLOY_WORKFLOW_PATH = join(
  REPO_ROOT,
  '.github',
  'workflows',
  'deploy-docs.yml',
);
const UPLOAD_PAGES_ACTION = 'actions/upload-pages-artifact@';
// actions/upload-pages-artifact always passes --exclude=.git and
// --exclude=.github to tar, whatever include-hidden-files says.
const ALWAYS_EXCLUDED = new Set(['.git', '.github']);

export interface UploadSettings {
  includeHiddenFiles: boolean;
}

// check-site runs before the upload, so it reads the upload step's own
// setting instead of a flag that could drift from the workflow.
export function readUploadSettings(
  workflowPath = DEPLOY_WORKFLOW_PATH,
): UploadSettings {
  const flow = Bun.YAML.parse(readFileSync(workflowPath, 'utf-8')) as {
    jobs?: Record<
      string,
      { steps?: { uses?: string; with?: Record<string, unknown> }[] }
    >;
  };
  const uploads = Object.values(flow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).filter((step) =>
      step.uses?.startsWith(UPLOAD_PAGES_ACTION),
    ),
  );
  if (uploads.length !== 1)
    fail(
      'INVALID_INPUT',
      `${workflowPath} has ${uploads.length} ${UPLOAD_PAGES_ACTION} steps; expected 1`,
    );
  // The action compares the input as the string 'true'.
  const value = uploads[0]?.with?.['include-hidden-files'];
  return { includeHiddenFiles: value === true || value === 'true' };
}

export function uploadDropsPath(
  relativePath: string,
  settings: UploadSettings,
): boolean {
  return relativePath
    .split(/[\\/]/)
    .some(
      (part) =>
        ALWAYS_EXCLUDED.has(part) ||
        (!settings.includeHiddenFiles && part.startsWith('.')),
    );
}

async function walk(
  dir: string,
  visit: (path: string, size: number) => Promise<void>,
): Promise<void> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink())
      fail('VERIFY_FAILED', `${path} is a symlink; Pages refuses them`);
    if (entry.isDirectory()) await walk(path, visit);
    else if (entry.isFile()) await visit(path, (await stat(path)).size);
  }
}

export async function checkSite(
  siteDir = SITE_DIR,
  summaryPath?: string,
  upload: UploadSettings = readUploadSettings(),
): Promise<SiteReport> {
  if (!existsSync(siteDir)) fail('INVALID_INPUT', `${siteDir} does not exist`);
  const report: SiteReport = {
    bytes: 0,
    largest: null,
    coiCopies: 0,
    bundles: 0,
    hiddenFiles: [],
  };
  const manifests: string[] = [];
  await walk(siteDir, async (path, size) => {
    report.bytes = checkedAdd(
      report.bytes,
      size,
      PAGES_SITE_LIMIT_BYTES,
      `site ${siteDir}`,
    );
    const rel = relative(siteDir, path);
    if (!report.largest || size > report.largest.bytes)
      report.largest = { path: rel.split(sep).join('/'), bytes: size };
    // The local-staging copy of an accepted build must never be published.
    const parts = rel.split(sep);
    if (parts.at(-1) === LOCAL_ACCEPTED_ASSET && parts.at(-3) === 'guests')
      fail(
        'VERIFY_FAILED',
        `${rel} is a local-staging ${LOCAL_ACCEPTED_ASSET}`,
      );
    if (rel.split(sep).some((part) => part.startsWith('.')))
      report.hiddenFiles.push(rel.split(sep).join('/'));
    if (path.endsWith(`${sep}${COI_SERVICEWORKER_FILE}`)) {
      const problem = coiServiceWorkerProblem(path);
      if (problem) fail('VERIFY_FAILED', problem);
      report.coiCopies += 1;
    }
    if (path.endsWith(`${sep}${STAGED_BUNDLE_DIR}${sep}${ASSETS_MANIFEST}`))
      manifests.push(path);
  });
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      files?: PinnedFile[];
    };
    const root = dirname(manifestPath);
    for (const file of manifest.files ?? []) {
      checkArchivePath(file.path);
      const path = join(root, file.path);
      if (!existsSync(path))
        fail(
          'VERIFY_FAILED',
          `${path} is listed in ${manifestPath} but missing`,
        );
      const digest = sha256Hex(readFileSync(path));
      if (digest !== file.sha256)
        fail(
          'VERIFY_FAILED',
          `${path}: SHA256 ${digest} differs from ${manifestPath}`,
        );
    }
    for (const notice of [BUNDLE_ENTRIES.license, BUNDLE_ENTRIES.coreLicense]) {
      if (
        !(manifest.files ?? []).some((file) => file.path.endsWith(`/${notice}`))
      )
        fail('VERIFY_FAILED', `${manifestPath} does not ship ${notice}`);
    }
    report.bundles += 1;
  }
  report.hiddenFiles.sort();
  const dropped = report.hiddenFiles.filter((rel) =>
    uploadDropsPath(rel, upload),
  );
  if (dropped.length > 0)
    fail(
      'VERIFY_FAILED',
      `the Pages upload (include-hidden-files: ${upload.includeHiddenFiles}) would drop ${dropped.join(', ')}`,
    );
  if (summaryPath)
    await appendFile(
      summaryPath,
      `### site size\n\n${report.bytes} bytes of ${PAGES_SITE_LIMIT_BYTES}; largest file ${report.largest ? `\`${report.largest.path}\` ${report.largest.bytes} bytes` : 'none'}; ${report.coiCopies} coi-serviceworker copies and ${report.bundles} formicarium bundles verified. Hidden files kept by the upload: ${report.hiddenFiles.length === 0 ? 'none' : report.hiddenFiles.map((rel) => `\`${rel}\``).join(', ')}.\n`,
    );
  return report;
}
