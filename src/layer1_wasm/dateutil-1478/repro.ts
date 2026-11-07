import {
  fetchWheelManifest,
  resolveFixCandidateSpec,
  type WheelManifest,
} from '../_shared/fix-candidate.js';
import type { PathACapturedRun } from '../_shared/path_a.js';
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

import dateutil
from dateutil.parser import parse

STAMP = "2026-03-11 14:32:45"
CASES = [("UTC-4", -4), ("UTC+4", +4), ("UTC-04:00", -4), ("UTC+04:00", +4)]


def offset(seconds):
    sign = "-" if seconds < 0 else "+"
    return f"{sign}{abs(seconds) // 3600:02d}:{abs(seconds) % 3600 // 60:02d}"


results = []
for spec, expected_hours in CASES:
    expected = expected_hours * 3600
    actual = int(parse(f"{STAMP} {spec}").utcoffset().total_seconds())
    results.append(
        {
            "input": spec,
            "expected_offset_seconds": expected,
            "actual_offset_seconds": actual,
            "inverted": actual == -expected and actual != expected,
        }
    )

print(f"parse('{STAMP} <input>').utcoffset()")
print()
print(f"{'input':<12}{'expected':>10}{'actual':>10}")
for row in results:
    flag = "   <-- sign flipped" if row["inverted"] else ""
    print(
        f"{row['input']:<12}"
        f"{offset(row['expected_offset_seconds']):>10}"
        f"{offset(row['actual_offset_seconds']):>10}{flag}"
    )
print()
flipped = sum(row["inverted"] for row in results)
print(f"{flipped} of {len(results)} UTC-prefixed offsets came back negated.")
print(f"python-dateutil {dateutil.__version__} / Python {sys.version.split()[0]}")
`.trim();

const VERSION_QUERY =
  'import dateutil, sys; [dateutil.__version__, sys.version.split()[0]]';

const BASELINE_SPEC = 'python-dateutil==4.0.0';

interface CaseObservation {
  input: string;
  expected_offset_seconds: number;
  actual_offset_seconds: number;
  inverted: boolean;
}

interface ReproOutput {
  cases: CaseObservation[];
  inverted_count: number;
  case_count: number;
  reproduced: boolean;
}

const outputBaselineEl = requiredElement('dateutil-1478', 'output');
const outputFixEl = requiredElement('dateutil-1478', 'output-fix');
const metaEl = requiredElement('dateutil-1478', 'meta');
const reproCodeEl = requiredElement('dateutil-1478', 'repro-code');

function setFixPane(text: string, status: 'pending' | 'ok' | 'error'): void {
  outputFixEl.textContent = text;
  outputFixEl.dataset['fixStatus'] = status;
}

showReproSource(reproCodeEl, REPRO_CODE);

function summarise(cases: CaseObservation[]): ReproOutput {
  const inverted = cases.filter((c) => c.inverted).length;
  return {
    cases,
    inverted_count: inverted,
    case_count: cases.length,
    reproduced: cases.length > 0 && inverted === cases.length,
  };
}

function evaluate(result: ReproOutput | null): Evaluation {
  if (!result) {
    return {
      verdict: 'unreproduced',
      message: 'bug not reproduced — the script left no `results` list behind.',
    };
  }
  if (result.reproduced) {
    return {
      verdict: 'reproduced',
      message:
        'bug reproduced — every "UTC±N" input parsed to its negated offset.',
    };
  }
  const correct = result.case_count - result.inverted_count;
  return {
    verdict: 'unreproduced',
    message: `bug not reproduced — ${correct}/${result.case_count} UTC±N cases parsed with the correct sign.`,
  };
}

function parseCases(value: unknown): ReproOutput | null {
  return Array.isArray(value) ? summarise(value as CaseObservation[]) : null;
}

async function captureIn(
  worker: PyodideWorker,
  source: string,
): Promise<RecipeCapture<ReproOutput>> {
  return capturePyodideRun(await worker.run(source), evaluate, parseCases);
}

async function readVersions(
  worker: PyodideWorker,
): Promise<{ dateutil: string; python: string }> {
  const probe = await worker.evaluate(VERSION_QUERY);
  const pair = Array.isArray(probe.value) ? probe.value : [];
  return { dateutil: String(pair[0] ?? ''), python: String(pair[1] ?? '') };
}

const startedAt = new Date();

let baselineCapture: PathACapturedRun | null = null;
let baselineParsed: ReproOutput | null = null;
let baselineVersions: { dateutil: string; python: string } | null = null;
let pyodideVersion = '';
let fixCapture: PathACapturedRun | null = null;
let fixParsed: ReproOutput | null = null;
let fixDateutilVersion = '';
let manifest: WheelManifest | null = null;

try {
  const worker = await startPyodideWorker({
    packages: ['micropip'],
    spec: BASELINE_SPEC,
    pipPackage: 'python-dateutil',
    rootModule: 'dateutil',
    resultGlobal: 'results',
    installLabel: {
      en: 'Installing python-dateutil…',
      ja: 'python-dateutil をインストール中…',
    },
  });
  pyodideVersion = worker.pyodideVersion;
  baselineVersions = await readVersions(worker);

  setVerdict('pending', 'Running reproduction script (baseline)…', 'running');
  const baseline = await captureIn(worker, REPRO_CODE);
  baselineCapture = baseline.run;
  baselineParsed = baseline.parsed;
  outputBaselineEl.textContent = baselineCapture.stdout;

  const buildEnvelope = (): VivariumResultV1 | null => {
    if (!baselineParsed || !baselineCapture || !baselineVersions) return null;
    return {
      contract: 'v1',
      bug: {
        project: 'dateutil',
        issue: 1478,
        upstream_url: 'https://github.com/dateutil/dateutil/issues/1478',
      },
      runtime: {
        name: 'pyodide',
        version: pyodideVersion,
        extras: {
          python: baselineVersions.python,
          'python-dateutil': baselineVersions.dateutil,
          ...(fixParsed
            ? { 'python-dateutil_fix_candidate': fixDateutilVersion }
            : {}),
        },
      },
      result: {
        cases: baselineParsed.cases,
        inverted_count: baselineParsed.inverted_count,
        case_count: baselineParsed.case_count,
        reproduced: baselineParsed.reproduced,
        baseline: {
          spec: BASELINE_SPEC,
          verdict: baselineCapture.verdict,
          dateutil_version: baselineVersions.dateutil,
          cases: baselineParsed.cases,
          inverted_count: baselineParsed.inverted_count,
          case_count: baselineParsed.case_count,
          reproduced: baselineParsed.reproduced,
        },
        fix_candidate:
          fixParsed && fixCapture && manifest
            ? {
                spec: resolveFixCandidateSpec(manifest, 'python-dateutil'),
                verdict: fixCapture.verdict,
                dateutil_version: fixDateutilVersion,
                cases: fixParsed.cases,
                inverted_count: fixParsed.inverted_count,
                case_count: fixParsed.case_count,
                reproduced: fixParsed.reproduced,
                upstream_pr: manifest.upstream_pr || null,
              }
            : null,
      },
      timing: timingSince(startedAt),
    };
  };

  const initialEnvelope = buildEnvelope();
  if (initialEnvelope) setResult(initialEnvelope);

  setVerdict(baselineCapture.verdict, baselineCapture.message);

  metaEl.textContent =
    `Baseline python-dateutil ${baselineVersions.dateutil || '?'} on Python ` +
    `${baselineVersions.python || '?'} via Pyodide v${pyodideVersion} ` +
    `(Web Worker).`;

  setFixPane('Fetching wheel manifest…', 'pending');
  const manifestResult = await fetchWheelManifest();

  if (manifestResult.ok) {
    manifest = manifestResult.manifest;
    setFixPane(
      `Installing ${manifest.filename} (${manifest.version})…\n` +
        `from ${manifest.source.url}@${manifest.source.ref}` +
        (manifest.source.subdirectory
          ? ` (subdir: ${manifest.source.subdirectory})`
          : ''),
      'pending',
    );
    const installed = await worker.install(manifestResult.wheelUrl);
    if (installed.error !== null) {
      setFixPane(`Fix-candidate install failed: ${installed.error}`, 'error');
    } else {
      fixDateutilVersion = (await readVersions(worker)).dateutil;
      const fix = await captureIn(worker, REPRO_CODE);
      fixCapture = fix.run;
      fixParsed = fix.parsed;
      setFixPane(fixCapture.stdout, fixParsed ? 'ok' : 'error');
    }

    const restored = await worker.install(BASELINE_SPEC);
    if (restored.error !== null) {
      console.warn(
        'dateutil-1478: failed to restore the baseline install; Run will exercise the fix candidate.',
      );
    }
  } else {
    setFixPane(manifestResult.reason, 'error');
  }

  const finalEnvelope = buildEnvelope();
  if (finalEnvelope) setResult(finalEnvelope);

  enableRunner({
    slug: 'dateutil-1478',
    baselineSource: REPRO_CODE,
    runFix: async (source) => (await captureIn(worker, source)).run,
  });
} catch (err: unknown) {
  reportRuntimeFailure(outputBaselineEl, err);
}
