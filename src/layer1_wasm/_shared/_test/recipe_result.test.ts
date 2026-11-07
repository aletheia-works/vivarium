import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import type { RunResult } from '../pyodide-worker-client.js';
import {
  capturePyodideRun,
  type Evaluation,
  timingSince,
} from '../recipe_result.js';

interface Output {
  buggy: boolean;
}

const evaluate = (parsed: Output | null): Evaluation =>
  parsed?.buggy
    ? { verdict: 'reproduced', message: 'yes' }
    : { verdict: 'unreproduced', message: parsed ? 'no' : 'nothing' };

function run(fields: Partial<RunResult>): RunResult {
  return { stdout: 'out', value: null, error: null, ...fields } as RunResult;
}

describe('capturePyodideRun', () => {
  test('reports a runtime error without evaluating', () => {
    expect(
      capturePyodideRun(run({ error: 'boom', value: { buggy: true } }), evaluate),
    ).toEqual({
      run: {
        exitCode: 1,
        verdict: 'unreproduced',
        message: 'runtime error: boom',
        stdout: 'out',
      },
      parsed: null,
    });
  });

  test('evaluates a result mapping', () => {
    const value = { buggy: true };
    expect(capturePyodideRun(run({ value }), evaluate)).toEqual({
      run: { exitCode: 0, verdict: 'reproduced', message: 'yes', stdout: 'out' },
      parsed: value,
    });
  });

  test.each([[null], [[{ buggy: true }]], ['text'], [1]])(
    'treats %j as no result',
    (value) => {
      expect(capturePyodideRun(run({ value }), evaluate)).toEqual({
        run: {
          exitCode: 1,
          verdict: 'unreproduced',
          message: 'nothing',
          stdout: 'out',
        },
        parsed: null,
      });
    },
  );

  test('uses a custom parser', () => {
    const parse = (value: unknown): Output | null =>
      Array.isArray(value) ? { buggy: value.length > 0 } : null;
    expect(capturePyodideRun(run({ value: [1] }), evaluate, parse)).toEqual({
      run: { exitCode: 0, verdict: 'reproduced', message: 'yes', stdout: 'out' },
      parsed: { buggy: true },
    });
  });
});

describe('timingSince', () => {
  afterEach(() => {
    setSystemTime();
  });

  test('measures from the start to now', () => {
    setSystemTime(new Date('2026-01-01T00:00:01.500Z'));
    expect(timingSince(new Date('2026-01-01T00:00:00.000Z'))).toEqual({
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:01.500Z',
      duration_ms: 1500,
    });
  });
});
