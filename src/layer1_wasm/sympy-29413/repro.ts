// Vivarium Layer 1 reproduction — sympy/sympy#29413.
//
// `ask(a + 1 > a, Q.extended_real(a))` returns True under sympy
// 1.14.0, but the correct answer is None: `a + 1 > a` is undefined
// when `a = ±oo` (which `Q.extended_real` admits). Assumption-system
// blind spot in `core.relational`.
//
// Verdict semantics (per ADR-0008 / contract v1) — applied to each
// variant card individually; the top-level `#verdict` pill mirrors
// the **baseline** variant so the existing Contract v1 single-verdict
// surface (`__VIVARIUM_VERDICT__`, `data-verdict`) keeps its prior
// meaning and downstream consumers do not need to branch.
//   - "reproduced"   — `ask()` returned `True` (the bug).
//   - "unreproduced" — `ask()` returned `None` or `False` (likely
//                      fixed upstream), or the runtime errored before
//                      producing a result.
//
// sympy is **not** in Pyodide's bundled package set, so we install
// it via `micropip` after the Pyodide bootstrap. sympy has only
// pure-Python dependencies (mpmath), so the install is a couple of
// PyPI wheels — slower than `pandas` but still cold-loads in well
// under the Playwright timeout. The fix-candidate this page renders
// side-by-side is a pure-Python wheel under `./wheels/` built from
// the fork+branch `JamBalaya56562/sympy@claude/fix-sympy-29413-8Lyc6`.

import { loadVivariumPyodide } from '../_shared/loader.js';
import type { PathACapturedRun } from '../_shared/path_a.js';
import { enableRunner } from '../_shared/runner.js';
import {
  setResult,
  setVerdict,
  type VivariumResultV1,
} from '../_shared/verdict.js';

const REPRO_CODE = `
import sys
import sympy
from sympy import ask, Q, Symbol

a = Symbol('a')
result_value = ask(a + 1 > a, Q.extended_real(a))

{
    "sympy_version": sympy.__version__,
    "python_version": sys.version.split()[0],
    "ask_result": repr(result_value),
    "reproduced": result_value is True,
}
`.trim();

interface ReproOutput {
  sympy_version: string;
  python_version: string;
  ask_result: string;
  reproduced: boolean;
}

interface PyodideRuntime {
  runPythonAsync(code: string): Promise<{
    toJs(opts: { dict_converter: typeof Object.fromEntries }): ReproOutput;
    destroy?(): void;
  }>;
}

interface WheelManifest {
  schema_version: number;
  package: string;
  filename: string;
  version: string;
  source: {
    type: string;
    url: string;
    ref: string;
    commit?: string;
    spec?: string;
    subdirectory?: string;
  };
  upstream_pr?: string;
  fetched_at?: string;
}

const outputBaselineEl = document.getElementById('output');
const outputFixEl = document.getElementById('output-fix');
const metaEl = document.getElementById('meta');
const reproCodeEl = document.getElementById('repro-code');

if (!outputBaselineEl || !outputFixEl || !metaEl || !reproCodeEl) {
  throw new Error(
    'sympy-29413: missing required DOM elements (#output, #output-fix, #meta, #repro-code).',
  );
}

if (!reproCodeEl.firstChild) {
  reproCodeEl.textContent = REPRO_CODE;
  fetch('./repro.highlighted.html')
    .then((r) => (r.ok ? r.text() : null))
    .then((html) => {
      if (html) reproCodeEl.innerHTML = html;
    })
    .catch(() => {});
}

function evaluate(result: ReproOutput): {
  verdict: 'reproduced' | 'unreproduced';
  message: string;
} {
  if (result.reproduced) {
    return {
      verdict: 'reproduced',
      message:
        'bug reproduced — ask((a+1)>a, Q.extended_real(a)) returned True, but a=±oo would make this undefined.',
    };
  }
  return {
    verdict: 'unreproduced',
    message: `bug not reproduced — ask returned ${result.ask_result} (expected None for the bug; True signals the blind spot).`,
  };
}

async function captureRun(
  runtime: PyodideRuntime,
  source: string,
): Promise<PathACapturedRun> {
  try {
    const proxy = await runtime.runPythonAsync(source);
    const result = proxy.toJs({ dict_converter: Object.fromEntries });
    proxy.destroy?.();
    const ev = evaluate(result);
    return {
      exitCode: 0,
      verdict: ev.verdict,
      message: ev.message,
      stdout: JSON.stringify(result, null, 2),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      verdict: 'unreproduced',
      message: `runtime error: ${message}`,
      stdout: message,
    };
  }
}

// Drop the in-memory sympy module tree so the next `import sympy`
// resolves the freshly-installed wheel rather than the previously-
// loaded version. Pyodide caches imports in `sys.modules`; `del` is
// the only reliable way to force a re-resolution after
// `micropip.uninstall`.
async function reinstallSympy(
  runtime: PyodideRuntime,
  installSpec: string,
): Promise<void> {
  await runtime.runPythonAsync(`
import micropip, sys
try:
    await micropip.uninstall("sympy")
except Exception:
    pass
for _name in [n for n in list(sys.modules) if n == "sympy" or n.startswith("sympy.")]:
    del sys.modules[_name]
await micropip.install(${JSON.stringify(installSpec)})
`);
}

const startedAt = new Date();

let baselineCapture: PathACapturedRun | null = null;
let baselineParsed: ReproOutput | null = null;
let fixCapture: PathACapturedRun | null = null;
let fixParsed: ReproOutput | null = null;
let manifest: WheelManifest | null = null;

try {
  const { pyodide, version } = await loadVivariumPyodide({
    packages: ['micropip'],
    pendingText: 'Loading Pyodide runtime and micropip…',
  });
  const runtime = pyodide as PyodideRuntime;

  // Baseline variant: PyPI sympy==1.14.0.
  setVerdict('pending', 'Installing sympy==1.14.0 from PyPI…');
  await runtime.runPythonAsync(`
import micropip
await micropip.install("sympy==1.14.0")
`);

  setVerdict('pending', 'Running reproduction script (baseline)…');
  baselineCapture = await captureRun(runtime, REPRO_CODE);
  try {
    baselineParsed = JSON.parse(baselineCapture.stdout) as ReproOutput;
  } catch {
    baselineParsed = null;
  }
  outputBaselineEl.textContent = baselineCapture.stdout;

  // Build the Contract v1 envelope as a closure that reflects whatever
  // variant data is currently captured. Called once after baseline (so
  // `__VIVARIUM_RESULT__` is populated by the time the top-level
  // `#verdict` pill flips to "reproduced" — Playwright reads the
  // envelope at that moment and would otherwise see `undefined`), and
  // again after the fix-candidate run completes so the envelope picks
  // up the second variant.
  const buildEnvelope = (): VivariumResultV1 | null => {
    if (!baselineParsed || !baselineCapture) return null;
    const finishedAt = new Date();
    return {
      contract: 'v1',
      bug: {
        project: 'sympy',
        issue: 29413,
        upstream_url: 'https://github.com/sympy/sympy/issues/29413',
      },
      runtime: {
        name: 'pyodide',
        version,
        extras: {
          python: baselineParsed.python_version,
          sympy: baselineParsed.sympy_version,
          ...(fixParsed
            ? { sympy_fix_candidate: fixParsed.sympy_version }
            : {}),
        },
      },
      result: {
        ask_result: baselineParsed.ask_result,
        reproduced: baselineParsed.reproduced,
        baseline: {
          spec: 'sympy==1.14.0',
          verdict: baselineCapture.verdict,
          sympy_version: baselineParsed.sympy_version,
          ask_result: baselineParsed.ask_result,
          reproduced: baselineParsed.reproduced,
        },
        fix_candidate:
          fixParsed && fixCapture && manifest
            ? {
                spec:
                  manifest.source.spec ??
                  `sympy @ git+${manifest.source.url}@${manifest.source.ref}` +
                    (manifest.source.subdirectory
                      ? `#subdirectory=${manifest.source.subdirectory}`
                      : ''),
                verdict: fixCapture.verdict,
                sympy_version: fixParsed.sympy_version,
                ask_result: fixParsed.ask_result,
                reproduced: fixParsed.reproduced,
                upstream_pr: manifest.upstream_pr || null,
              }
            : null,
      },
      timing: {
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      },
    };
  };

  // Publish the baseline-only envelope BEFORE flipping the verdict
  // pill — Playwright's regression suite reads `__VIVARIUM_RESULT__`
  // the moment `data-verdict` leaves `pending`.
  const initialEnvelope = buildEnvelope();
  if (initialEnvelope) setResult(initialEnvelope);

  // Top-level verdict pill mirrors baseline — preserves the
  // single-verdict Contract v1 surface for downstream consumers.
  setVerdict(baselineCapture.verdict, baselineCapture.message);

  metaEl.textContent =
    `Baseline sympy ${baselineParsed?.sympy_version ?? '?'} on Python ` +
    `${baselineParsed?.python_version ?? '?'} via Pyodide v${version}.`;

  // Fix-candidate variant: committed wheel.
  outputFixEl.textContent = 'Fetching wheel manifest…';
  let manifestRes: Response | null = null;
  try {
    manifestRes = await fetch('./wheels/manifest.json', { cache: 'no-store' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputFixEl.textContent = `Could not fetch wheel manifest: ${message}`;
  }

  if (manifestRes && manifestRes.ok) {
    manifest = (await manifestRes.json()) as WheelManifest;
    const wheelUrl = new URL(
      `./wheels/${manifest.filename}`,
      window.location.href,
    ).toString();
    outputFixEl.textContent =
      `Installing ${manifest.filename} (${manifest.version})…\n` +
      `from ${manifest.source.url}@${manifest.source.ref}` +
      (manifest.source.subdirectory
        ? ` (subdir: ${manifest.source.subdirectory})`
        : '');
    try {
      await reinstallSympy(runtime, wheelUrl);
      fixCapture = await captureRun(runtime, REPRO_CODE);
      try {
        fixParsed = JSON.parse(fixCapture.stdout) as ReproOutput;
      } catch {
        fixParsed = null;
      }
      outputFixEl.textContent = fixCapture.stdout;
    } catch (err) {
      const errAny = err as { stack?: string; message?: string } | null;
      const message =
        (errAny && (errAny.stack ?? errAny.message)) ?? String(err);
      outputFixEl.textContent = `Fix-candidate install/run failed: ${message}`;
    }
  } else if (manifestRes && !manifestRes.ok) {
    outputFixEl.textContent = `Wheel manifest unavailable (HTTP ${manifestRes.status}).`;
  }

  // Restore baseline sympy so the visitor-facing runner (Edit + Run)
  // operates against the buggy build — the runner's documented mental
  // model is "test your script change against the same broken
  // interpreter the recipe loaded". Without this, runner.runFix would
  // execute against the fix-candidate sympy, which is semantically
  // surprising for visitors paste-editing the script.
  try {
    await reinstallSympy(runtime, 'sympy==1.14.0');
  } catch {
    console.warn(
      'sympy-29413: failed to restore baseline for the runner; runner.runFix will run against the fix-candidate.',
    );
  }

  // ---- Contract v1 envelope (final) ---------------------------------
  // Re-publish the envelope now that the fix-candidate variant has
  // also captured (or definitively failed). `result` keeps the
  // historical baseline-only fields (`ask_result`, `reproduced`) so
  // consumers reading `__VIVARIUM_RESULT__.result.reproduced` continue
  // to work, and the additive `baseline` / `fix_candidate` sub-objects
  // describe each variant separately. Additive change — no `contract`
  // version bump.
  const finalEnvelope = buildEnvelope();
  if (finalEnvelope) setResult(finalEnvelope);

  enableRunner({
    slug: 'sympy-29413',
    baselineSource: REPRO_CODE,
    runFix: (source) => captureRun(runtime, source),
  });
} catch (err: unknown) {
  console.error(err);
  const errAny = err as { stack?: string; message?: string } | null;
  outputBaselineEl.textContent =
    (errAny && (errAny.stack ?? errAny.message)) ?? String(err);
  if (globalThis.__VIVARIUM_VERDICT__ !== 'unreproduced') {
    setVerdict(
      'unreproduced',
      `bug not reproduced — runtime error: ${errAny?.message ?? String(err)}`,
    );
  }
}
