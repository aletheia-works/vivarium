import {
  type PyodideWorker,
  startPyodideWorker,
} from '../_shared/pyodide-worker-client.js';
import {
  reportRuntimeFailure,
  requiredElement,
  showReproSource,
} from '../_shared/recipe_page.js';
import {
  capturePyodideRun,
  type Evaluation,
  type RecipeCapture,
  timingSince,
} from '../_shared/recipe_result.js';
import { enableRunner } from '../_shared/runner.js';
import {
  setResult,
  setVerdict,
  type VivariumResultV1,
} from '../_shared/verdict.js';

const REPRO_CODE = `
import sqlite3
import sys

DROPPED = "   <-- setting dropped"

off = sqlite3.connect(":memory:", autocommit=False)
off.execute("PRAGMA foreign_keys = ON")
off.commit()

on = sqlite3.connect(":memory:", autocommit=True)
on.execute("PRAGMA foreign_keys = ON")

off_value = int(off.execute("PRAGMA foreign_keys").fetchone()[0])
on_value = int(on.execute("PRAGMA foreign_keys").fetchone()[0])
disagreement = off_value != on_value

result = {
    "python_version": sys.version.split()[0],
    "sqlite_version": sqlite3.sqlite_version,
    "off_autocommit_fk": off_value,
    "on_autocommit_fk": on_value,
    "fk_disagreement": disagreement,
}

off_note = DROPPED if off_value == 0 else ""
on_note = DROPPED if on_value == 0 else ""

print("Set PRAGMA foreign_keys = ON on two connections, then read it back:")
print()
print("autocommit".ljust(14) + "foreign_keys".rjust(14))
print("False".ljust(14) + str(off_value).rjust(14) + off_note)
print("True".ljust(14) + str(on_value).rjust(14) + on_note)
print()
if disagreement:
    print("The two connections disagree: autocommit=False dropped the PRAGMA.")
else:
    print("Both connections agree: the PRAGMA survived on both.")
print("Python " + result["python_version"] + " / SQLite " + result["sqlite_version"])
`.trim();

interface ReproOutput {
  python_version: string;
  sqlite_version: string;
  off_autocommit_fk: number;
  on_autocommit_fk: number;
  fk_disagreement: boolean;
}

const outputEl = requiredElement('cpython-137205', 'output');
const metaEl = requiredElement('cpython-137205', 'meta');
const reproCodeEl = requiredElement('cpython-137205', 'repro-code');

showReproSource(reproCodeEl, REPRO_CODE);

function evaluate(result: ReproOutput | null): Evaluation {
  if (!result) {
    return {
      verdict: 'unreproduced',
      message:
        'bug not reproduced — the script left no `result` mapping behind.',
    };
  }
  if (result.fk_disagreement) {
    return {
      verdict: 'reproduced',
      message:
        'bug reproduced — autocommit=False silently drops PRAGMA foreign_keys; the two connections disagree.',
    };
  }
  return {
    verdict: 'unreproduced',
    message:
      'bug not reproduced — both connections agree on PRAGMA foreign_keys (likely fixed upstream).',
  };
}

async function captureIn(
  worker: PyodideWorker,
  source: string,
): Promise<RecipeCapture<ReproOutput>> {
  return capturePyodideRun(await worker.run(source), evaluate);
}

const startedAt = new Date();

try {
  const worker = await startPyodideWorker({
    runtimeLabel: {
      en: 'Loading runtime + stdlib…',
      ja: 'runtime と stdlib を読み込み中…',
    },
  });

  setVerdict('pending', 'Running reproduction script…', 'running');
  const baseline = await captureIn(worker, REPRO_CODE);
  outputEl.textContent = baseline.run.stdout;
  setVerdict(baseline.run.verdict, baseline.run.message);

  const baselineResult = baseline.parsed;
  if (!baselineResult) {
    throw new Error(baseline.run.message);
  }

  metaEl.textContent =
    `Python ${baselineResult.python_version} with stdlib sqlite3 ` +
    `(SQLite ${baselineResult.sqlite_version}) via Pyodide v${worker.pyodideVersion} ` +
    '(Web Worker).';

  const envelope: VivariumResultV1 = {
    contract: 'v1',
    bug: {
      project: 'cpython',
      issue: 137205,
      upstream_url: 'https://github.com/python/cpython/issues/137205',
    },
    runtime: {
      name: 'pyodide',
      version: worker.pyodideVersion,
      extras: {
        python: baselineResult.python_version,
        sqlite: baselineResult.sqlite_version,
      },
    },
    result: {
      off_autocommit_fk: baselineResult.off_autocommit_fk,
      on_autocommit_fk: baselineResult.on_autocommit_fk,
      fk_disagreement: baselineResult.fk_disagreement,
    },
    timing: timingSince(startedAt),
  };
  setResult(envelope);

  enableRunner({
    slug: 'cpython-137205',
    baselineSource: REPRO_CODE,
    runFix: async (source) => (await captureIn(worker, source)).run,
  });
} catch (err: unknown) {
  reportRuntimeFailure(outputEl, err);
}
