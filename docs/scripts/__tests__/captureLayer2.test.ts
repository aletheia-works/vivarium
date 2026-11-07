import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../site-paths';

const SCRIPT = join(REPO_ROOT, 'mise-tasks', 'verdict', 'capture-layer2.sh');

function capture(exitCode: number, stderrLines: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'capture-layer2-'));
  const docker = join(dir, 'docker');
  const printed = stderrLines
    .map((line) => `printf '%s\\n' '${line}' >&2\n`)
    .join('');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash\necho repro-stdout\n${printed}exit ${exitCode}\n`,
  );
  chmodSync(docker, 0o755);
  const output = join(dir, 'verdict.json');
  const run = Bun.spawnSync(['bash', SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      usage_image: 'example/image:test',
      usage_output: output,
    },
  });
  return { run, output, stderr: run.stderr.toString() };
}

function expectNoVerdict(
  result: ReturnType<typeof capture>,
  reason: string,
): void {
  expect(result.run.exitCode).toBe(1);
  expect(existsSync(result.output)).toBe(false);
  expect(result.stderr).toContain(`example/image:test ${reason}`);
  expect(result.stderr).toContain('repro-stdout');
}

describe('verdict:capture-layer2', () => {
  test.each([
    [0, 'reproduced'],
    [1, 'unreproduced'],
  ])('exit code %d with a matching line records %s', (exitCode, verdict) => {
    const { run, output } = capture(exitCode, [
      'progress',
      `verdict=${verdict} — detail`,
    ]);
    expect(run.exitCode).toBe(0);
    const written = JSON.parse(readFileSync(output, 'utf-8'));
    expect(written).toMatchObject({
      contract: 'v1',
      verdict,
      exit_code: exitCode,
      image_tag: 'example/image:test',
      stdout: 'repro-stdout',
      stderr_tail: `progress\nverdict=${verdict} — detail`,
    });
  });

  test('the last verdict line counts', () => {
    const { run, output } = capture(1, [
      'verdict=reproduced',
      'verdict=unreproduced',
    ]);
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf-8')).verdict).toBe(
      'unreproduced',
    );
  });

  test.each([2, 125, 137])(
    'exit code %d is an error, not a verdict',
    (exitCode) => {
      const result = capture(exitCode, ['verdict=unreproduced']);
      expectNoVerdict(
        result,
        `exited ${exitCode}; only 0 (reproduced) and 1 (unreproduced) are verdicts`,
      );
      expect(result.stderr).toContain('verdict=unreproduced');
    },
  );

  test.each([0, 1])(
    'exit code %d without a verdict line is an error',
    (exitCode) => {
      expectNoVerdict(
        capture(exitCode, [
          'set -e stopped here',
          'verdict=reproducedish',
          'verdict=reproduced1',
          'verdict=unreproduced_x',
        ]),
        `exited ${exitCode} but printed no verdict= line on stderr`,
      );
    },
  );

  test.each([
    [0, 'unreproduced'],
    [1, 'reproduced'],
  ])('exit code %d with verdict=%s is an error', (exitCode, stated) => {
    expectNoVerdict(
      capture(exitCode, [`verdict=${stated}`]),
      `printed verdict=${stated} but exited ${exitCode}`,
    );
  });
});
