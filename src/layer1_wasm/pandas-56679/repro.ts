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
import sys

import pandas as pd

series_dtype = str(pd.Series([]).dtype)
df_dtype = str(pd.DataFrame({"a": []})["a"].dtype)
mismatch = series_dtype != df_dtype

result = {
    "pandas_version": pd.__version__,
    "python_version": sys.version.split()[0],
    "series_dtype": series_dtype,
    "df_dtype": df_dtype,
    "mismatch": mismatch,
}

print("Two empty containers built from the same empty input:")
print()
print("pd.Series([]).dtype".ljust(36) + "-> " + series_dtype)
print('pd.DataFrame({"a": []})["a"].dtype'.ljust(36) + "-> " + df_dtype)
print()
if mismatch:
    print("The two disagree: the same empty input yields different dtypes.")
else:
    print("The two agree: both empty containers report the same dtype.")
print("pandas " + result["pandas_version"] + " / Python " + result["python_version"])
`.trim();

interface ReproOutput {
  pandas_version: string;
  python_version: string;
  series_dtype: string;
  df_dtype: string;
  mismatch: boolean;
}

const outputEl = requiredElement('pandas-56679', 'output');
const metaEl = requiredElement('pandas-56679', 'meta');
const reproCodeEl = requiredElement('pandas-56679', 'repro-code');

showReproSource(reproCodeEl, REPRO_CODE);

function evaluate(result: ReproOutput | null): Evaluation {
  if (!result) {
    return {
      verdict: 'unreproduced',
      message: 'bug not reproduced — the script left no `result` mapping behind.',
    };
  }
  if (result.mismatch) {
    return {
      verdict: 'reproduced',
      message: 'bug reproduced — Series dtype ≠ DataFrame dtype.',
    };
  }
  return {
    verdict: 'unreproduced',
    message: 'bug not reproduced — dtypes are consistent in this pandas build.',
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
    packages: ['pandas'],
    runtimeLabel: {
      en: 'Loading runtime + pandas…',
      ja: 'runtime と pandas を読み込み中…',
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
    `pandas ${baselineResult.pandas_version} on Python ${baselineResult.python_version} ` +
    `via Pyodide v${worker.pyodideVersion} (Web Worker).`;

  const envelope: VivariumResultV1 = {
    contract: 'v1',
    bug: {
      project: 'pandas',
      issue: 56679,
      upstream_url: 'https://github.com/pandas-dev/pandas/issues/56679',
    },
    runtime: {
      name: 'pyodide',
      version: worker.pyodideVersion,
      extras: {
        python: baselineResult.python_version,
        pandas: baselineResult.pandas_version,
      },
    },
    result: {
      series_dtype: baselineResult.series_dtype,
      df_dtype: baselineResult.df_dtype,
      mismatch: baselineResult.mismatch,
    },
    timing: timingSince(startedAt),
  };
  setResult(envelope);

  enableRunner({
    slug: 'pandas-56679',
    baselineSource: REPRO_CODE,
    runFix: async (source) => (await captureIn(worker, source)).run,
  });
} catch (err: unknown) {
  reportRuntimeFailure(outputEl, err);
}
