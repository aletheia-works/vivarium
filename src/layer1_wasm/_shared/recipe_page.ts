import { setVerdict } from './verdict.js';

export function requiredElement(slug: string, id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`${slug}: missing required DOM element #${id}.`);
  }
  return element;
}

export function showReproSource(codeEl: HTMLElement, source: string): void {
  if (codeEl.firstChild) return;
  codeEl.textContent = source;
  fetch('./repro.highlighted.html')
    .then((r) => (r.ok ? r.text() : null))
    .then((html) => {
      if (html) codeEl.innerHTML = html;
    })
    .catch(() => {});
}

export function reportRuntimeFailure(
  outputEl: HTMLElement,
  err: unknown,
): void {
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
}
