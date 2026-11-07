#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fail, SITE_DIR } from './formicarium-staging/shared';
import { checkSite } from './formicarium-staging/site';
import { type LocalInputs, stageAssets } from './formicarium-staging/stage';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      tarball: { type: 'string' },
      expect: { type: 'string' },
      layer1: { type: 'string' },
      site: { type: 'string' },
    },
    strict: true,
  });
  const summaryPath = process.env.GITHUB_STEP_SUMMARY || undefined;
  if (values.mode === 'check-site') {
    const report = await checkSite(
      values.site ? resolve(values.site) : SITE_DIR,
      summaryPath,
    );
    console.error(
      `Site: ${report.bytes} bytes, largest file ${report.largest ? `${report.largest.path} ${report.largest.bytes} bytes` : 'none'}, ${report.coiCopies} coi-serviceworker copies, ${report.bundles} formicarium bundles.`,
    );
    console.error(
      `Hidden files: ${report.hiddenFiles.length === 0 ? 'none' : report.hiddenFiles.join(', ')}.`,
    );
    return;
  }
  if (values.mode !== 'pin' && values.mode !== 'local')
    fail('INVALID_INPUT', '--mode must be pin, local or check-site');
  if (
    values.mode === 'pin' &&
    (values.tarball || values.expect || values.layer1)
  )
    fail(
      'INVALID_INPUT',
      'pin mode reads only the pin file and the public URLs',
    );
  let local: LocalInputs | undefined;
  if (values.mode === 'local') {
    if (!values.tarball || !values.expect)
      fail('INVALID_INPUT', 'local mode needs --tarball and --expect');
    const expected = JSON.parse(
      readFileSync(values.expect, 'utf-8'),
    ) as LocalInputs['expected'];
    const base = dirname(resolve(values.expect));
    for (const roles of Object.values(expected.guests ?? {}))
      for (const input of Object.values(roles))
        if (input && typeof input.dir === 'string')
          input.dir = resolve(base, input.dir);
    local = { tarballPath: values.tarball, expected };
  }
  const report = await stageAssets({
    mode: values.mode,
    ...(values.layer1 ? { layer1Dir: values.layer1 } : {}),
    ...(local ? { local } : {}),
    ...(summaryPath ? { summaryPath } : {}),
  });
  for (const row of report.rows)
    console.error(
      `${row.item}: ${row.bytes} bytes ${row.sha256} from ${row.source} (${row.ms} ms)`,
    );
  for (const item of report.staged)
    console.error(`Staged ${item.slug}: ${item.bytes} bytes`);
  for (const item of report.pending)
    console.error(`Pending ${item.slug}: ${item.reasons.join(', ')}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    );
    process.exit(1);
  });
}
