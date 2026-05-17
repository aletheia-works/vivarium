// Vivarium Layer 1 reproduction — lark-parser/lark#1585.
//
// The grammar `start.1: "a" | start start*` causes an infinite
// loop in lark's LALR back-end when `parser='lalr'` is supplied.
// CYK exhibits the same hang; Earley terminates normally.
//
// Because the bug is a hang rather than a wrong result, the repro
// runs Pyodide + lark inside a Web Worker. The main thread races
// the worker's result message against a wall-clock budget and
// terminates the worker if it does not return within the budget —
// that termination is the verdict signal.
//
// Verdict semantics (per Contract v1):
//   - "reproduced"   — the worker did not return within TIMEOUT_MS;
//                      the infinite loop is confirmed.
//   - "unreproduced" — the worker returned (parse completed; bug
//                      fixed upstream) or raised an exception (bug
//                      behaviour changed; the specific hang did
//                      not trigger) before the budget elapsed.

import {
  setResult,
  setVerdict,
  type VivariumResultV1,
} from '../_shared/verdict.js';

const TIMEOUT_MS = 8000;
const PYODIDE_VERSION = '0.29.3';

// Canonical reproduction source. The worker wraps it in a
// `try/except` + timing harness, but this is the part the recipe
// page surfaces in `<pre id="repro-code">` and the highlight-repros
// build step extracts. Editing this constant changes both the
// rendered source and the parse the worker actually runs.
const REPRO_CODE = `
Lark('start.1: "a" | start start*', parser='lalr').parse('aa')
`.trim();

interface ReproOutput {
  lark_version: string;
  python_version: string;
  outcome: 'returned' | 'raised';
  error: string | null;
  elapsed_ms: number;
}

interface WorkerReady {
  type: 'ready';
  pyodide_version: string;
  lark_version: string;
  python_version: string;
}

interface WorkerProgress {
  type: 'progress';
  stage: string;
}

interface WorkerResult {
  type: 'result';
  data: ReproOutput;
}

interface WorkerError {
  type: 'error';
  message: string;
}

type WorkerMessage = WorkerReady | WorkerProgress | WorkerResult | WorkerError;

const outputEl = document.getElementById('output');
const metaEl = document.getElementById('meta');
const reproCodeEl = document.getElementById('repro-code');

if (!outputEl || !metaEl || !reproCodeEl) {
  throw new Error(
    'lark-1585: missing required DOM elements (#output, #meta, #repro-code).',
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

const startedAt = new Date();

function publishEnvelope(args: {
  pyodideVersion: string;
  larkVersion: string;
  pythonVersion: string;
  reproduced: boolean;
  outcome: 'timeout' | ReproOutput['outcome'];
  error: string | null;
  elapsedMs: number;
  timeoutMs: number;
}): void {
  const finishedAt = new Date();
  const envelope: VivariumResultV1 = {
    contract: 'v1',
    bug: {
      project: 'lark',
      issue: 1585,
      upstream_url: 'https://github.com/lark-parser/lark/issues/1585',
    },
    runtime: {
      name: 'pyodide',
      version: args.pyodideVersion,
      extras: {
        python: args.pythonVersion,
        lark: args.larkVersion,
      },
    },
    result: {
      outcome: args.outcome,
      error: args.error,
      elapsed_ms: args.elapsedMs,
      timeout_ms: args.timeoutMs,
      reproduced: args.reproduced,
    },
    timing: {
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    },
  };
  setResult(envelope);
}

try {
  setVerdict('pending', 'Spawning Pyodide worker…');

  const worker = new Worker(new URL('./repro.worker.js', import.meta.url), {
    type: 'module',
  });

  const ready = await new Promise<WorkerReady>((resolve, reject) => {
    const onMessage = (ev: MessageEvent<WorkerMessage>): void => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        setVerdict('pending', `Worker: ${msg.stage}…`);
      } else if (msg.type === 'ready') {
        worker.removeEventListener('message', onMessage);
        resolve(msg);
      } else if (msg.type === 'error') {
        worker.removeEventListener('message', onMessage);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', (ev) => reject(new Error(ev.message)));
  });

  metaEl.textContent =
    `lark ${ready.lark_version} on Python ${ready.python_version} ` +
    `via Pyodide v${ready.pyodide_version}; budget ${TIMEOUT_MS} ms.`;

  setVerdict(
    'pending',
    `Running Lark(...).parse('aa') with a ${TIMEOUT_MS / 1000}s budget…`,
  );

  const resultPromise = new Promise<WorkerResult | WorkerError>(
    (resolve, reject) => {
      const onMessage = (ev: MessageEvent<WorkerMessage>): void => {
        if (ev.data.type === 'result' || ev.data.type === 'error') {
          worker.removeEventListener('message', onMessage);
          resolve(ev.data);
        }
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', (ev) =>
        reject(new Error(`worker errored: ${ev.message}`)),
      );
    },
  );

  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), TIMEOUT_MS);
  });

  worker.postMessage({ type: 'go', source: REPRO_CODE });

  const outcome = await Promise.race([resultPromise, timeoutPromise]);

  if (outcome === 'timeout') {
    worker.terminate();
    const message =
      `bug reproduced — Lark('start.1: "a" | start start*', parser='lalr')` +
      `.parse('aa') did not return within ${TIMEOUT_MS / 1000}s; ` +
      `the LALR back-end is in an infinite loop.`;
    outputEl.textContent = JSON.stringify(
      {
        lark_version: ready.lark_version,
        python_version: ready.python_version,
        outcome: 'timeout',
        timeout_ms: TIMEOUT_MS,
        reproduced: true,
      },
      null,
      2,
    );
    setVerdict('reproduced', message);
    publishEnvelope({
      pyodideVersion: ready.pyodide_version,
      larkVersion: ready.lark_version,
      pythonVersion: ready.python_version,
      reproduced: true,
      outcome: 'timeout',
      error: null,
      elapsedMs: TIMEOUT_MS,
      timeoutMs: TIMEOUT_MS,
    });
  } else if (outcome.type === 'error') {
    outputEl.textContent = outcome.message;
    setVerdict(
      'unreproduced',
      `bug not reproduced — worker errored before timeout: ${outcome.message}.`,
    );
    publishEnvelope({
      pyodideVersion: ready.pyodide_version,
      larkVersion: ready.lark_version,
      pythonVersion: ready.python_version,
      reproduced: false,
      outcome: 'raised',
      error: outcome.message,
      elapsedMs: 0,
      timeoutMs: TIMEOUT_MS,
    });
  } else {
    const data = outcome.data;
    outputEl.textContent = JSON.stringify(data, null, 2);
    const message =
      data.outcome === 'returned'
        ? `bug not reproduced — parse returned in ${data.elapsed_ms.toFixed(0)} ms (likely fixed upstream).`
        : `bug not reproduced — parse raised ${data.error ?? '<unknown>'} in ${data.elapsed_ms.toFixed(0)} ms; the specific infinite loop did not trigger.`;
    setVerdict('unreproduced', message);
    publishEnvelope({
      pyodideVersion: ready.pyodide_version,
      larkVersion: data.lark_version,
      pythonVersion: data.python_version,
      reproduced: false,
      outcome: data.outcome,
      error: data.error,
      elapsedMs: data.elapsed_ms,
      timeoutMs: TIMEOUT_MS,
    });
  }
} catch (err: unknown) {
  console.error(err);
  const errAny = err as { stack?: string; message?: string } | null;
  outputEl.textContent =
    (errAny && (errAny.stack ?? errAny.message)) ?? String(err);
  if (globalThis.__VIVARIUM_VERDICT__ !== 'unreproduced') {
    setVerdict(
      'unreproduced',
      `bug not reproduced — runtime error: ${errAny?.message ?? String(err)}`,
    );
  }
  publishEnvelope({
    pyodideVersion: PYODIDE_VERSION,
    larkVersion: 'unknown',
    pythonVersion: 'unknown',
    reproduced: false,
    outcome: 'raised',
    error: errAny?.message ?? String(err),
    elapsedMs: 0,
    timeoutMs: TIMEOUT_MS,
  });
}
