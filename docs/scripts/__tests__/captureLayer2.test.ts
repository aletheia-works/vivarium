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

function capture(exitCode: number) {
  const dir = mkdtempSync(join(tmpdir(), 'capture-layer2-'));
  const docker = join(dir, 'docker');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash\necho repro-stdout\necho repro-stderr >&2\nexit ${exitCode}\n`,
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

describe('verdict:capture-layer2', () => {
  test.each([
    [0, 'reproduced'],
    [1, 'unreproduced'],
  ])('exit code %d records %s', (exitCode, verdict) => {
    const { run, output } = capture(exitCode);
    expect(run.exitCode).toBe(0);
    const written = JSON.parse(readFileSync(output, 'utf-8'));
    expect(written).toMatchObject({
      contract: 'v1',
      verdict,
      exit_code: exitCode,
      image_tag: 'example/image:test',
      stdout: 'repro-stdout',
      stderr_tail: 'repro-stderr',
    });
  });

  test.each([2, 125, 137])(
    'exit code %d is an error, not a verdict',
    (exitCode) => {
      const { run, output, stderr } = capture(exitCode);
      expect(run.exitCode).toBe(1);
      expect(existsSync(output)).toBe(false);
      expect(stderr).toContain(
        `example/image:test exited ${exitCode}; only 0 (reproduced) and 1 (unreproduced) are verdicts`,
      );
      expect(stderr).toContain('repro-stdout');
      expect(stderr).toContain('repro-stderr');
    },
  );
});
