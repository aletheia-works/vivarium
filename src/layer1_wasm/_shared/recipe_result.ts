import type { PathACapturedRun } from './path_a.js';
import type { RunResult } from './pyodide-worker-client.js';
import type { VivariumResultV1Timing } from './verdict.js';

export type Evaluation = Pick<PathACapturedRun, 'verdict' | 'message'>;

export interface RecipeCapture<T> {
  run: PathACapturedRun;
  parsed: T | null;
}

function resultMapping<T>(value: unknown): T | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as T)
    : null;
}

export function capturePyodideRun<T>(
  run: RunResult,
  evaluate: (parsed: T | null) => Evaluation,
  parse: (value: unknown) => T | null = resultMapping,
): RecipeCapture<T> {
  if (run.error !== null) {
    return {
      run: {
        exitCode: 1,
        verdict: 'unreproduced',
        message: `runtime error: ${run.error}`,
        stdout: run.stdout,
      },
      parsed: null,
    };
  }
  const parsed = parse(run.value);
  return {
    run: {
      exitCode: parsed ? 0 : 1,
      ...evaluate(parsed),
      stdout: run.stdout,
    },
    parsed,
  };
}

export function timingSince(startedAt: Date): VivariumResultV1Timing {
  const finishedAt = new Date();
  return {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
  };
}
