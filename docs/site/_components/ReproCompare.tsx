import { useCallback, useEffect, useRef, useState } from 'react';
import recipesIndex from '../public/api/recipes.json';
import { VerdictCompareLayout } from './ReproCompareEvidence';
import { snapshotUrl } from './recipe-url';
import { type Lang, STRINGS } from './repro-compare-strings';
import {
  fetchVerdict,
  parseVerdict,
  readVerdictBundle,
  type Side,
  type SideError,
  type VerdictLiteral,
  type VerdictV1,
} from './repro-compare-verdict';
import './repro-compare.css';

function resolvePagesBase(): string {
  if (typeof window === 'undefined') {
    return 'https://aletheia-works.github.io/vivarium/repro';
  }
  const { origin, pathname } = window.location;
  const idx = pathname.indexOf('/repro');
  return idx >= 0
    ? `${origin}${pathname.slice(0, idx)}/repro`
    : `${origin}/repro`;
}

const PAGES_BASE = resolvePagesBase();

export interface ReproCompareProps {
  lang: Lang;
}

export function ReproCompareApp({ lang }: ReproCompareProps) {
  const s = STRINGS[lang];
  const [slug, setSlug] = useState('');
  const [expected, setExpected] = useState<VerdictLiteral>('unreproduced');
  const [branch, setBranch] = useState<VerdictV1 | null>(null);
  const [original, setOriginal] = useState<VerdictV1 | null>(null);
  const [errors, setErrors] = useState<SideError[]>([]);
  const [busy, setBusy] = useState(false);
  const [pasteOriginal, setPasteOriginal] = useState('');
  const [pasteBranch, setPasteBranch] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setSide = useCallback((side: Side, verdict: VerdictV1) => {
    if (side === 'branch') setBranch(verdict);
    else setOriginal(verdict);
  }, []);

  const addErrors = useCallback((newErrors: SideError[]) => {
    if (newErrors.length > 0) setErrors((xs) => [...xs, ...newErrors]);
  }, []);

  const loadFromUrl = useCallback(
    async (side: Side, url: string, reportFailure = true) => {
      setBusy(true);
      const r = await fetchVerdict(url);
      if (r.ok) {
        setSide(side, r.data);
      } else if (reportFailure) {
        addErrors([
          {
            side,
            path: r.error.path,
            message: `${s.fetchFailed(url)} (${r.error.message})`,
          },
        ]);
      }
      setBusy(false);
    },
    [s, setSide, addErrors],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlSlug = params.get('slug');
    const urlBranch = params.get('branch_url');
    const urlOriginal = params.get('original_url');
    const urlExpected = params.get('expected');
    if (urlSlug) setSlug(urlSlug);
    if (urlExpected === 'reproduced' || urlExpected === 'unreproduced') {
      setExpected(urlExpected);
    }
    if (urlBranch) void loadFromUrl('branch', urlBranch);
    if (urlOriginal) {
      void loadFromUrl('original', urlOriginal);
    } else if (urlSlug) {
      void loadFromUrl(
        'original',
        snapshotUrl(urlSlug, PAGES_BASE, recipesIndex.recipes),
        false,
      );
    }
  }, [loadFromUrl]);

  const ingestFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const { verdicts, errors: bundleErrors } =
            await readVerdictBundle(file);
          if (verdicts.branch) setBranch(verdicts.branch);
          if (verdicts.original) setOriginal(verdicts.original);
          if (
            !verdicts.branch &&
            !verdicts.original &&
            bundleErrors.length === 0
          ) {
            bundleErrors.push({
              side: 'branch',
              path: '/',
              message: s.zipMissingFiles,
            });
          }
          addErrors(bundleErrors);
        } else {
          const side: Side = file.name.includes('original')
            ? 'original'
            : 'branch';
          const v = parseVerdict(await file.text());
          if (v.ok) setSide(side, v.data);
          else addErrors([{ side, ...v.error }]);
        }
      } catch (err) {
        addErrors([
          {
            side: 'branch',
            path: '/',
            message: err instanceof Error ? err.message : String(err),
          },
        ]);
      }
      setBusy(false);
    },
    [s.zipMissingFiles, setSide, addErrors],
  );

  const onDrop = useCallback(
    async (ev: React.DragEvent<HTMLDivElement>) => {
      ev.preventDefault();
      const files = Array.from(ev.dataTransfer.files);
      for (const file of files) {
        await ingestFile(file);
      }
    },
    [ingestFile],
  );

  const onDragOver = useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
  }, []);

  const onPickFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(ev.target.files ?? []);
      for (const file of files) {
        await ingestFile(file);
      }
      ev.target.value = '';
    },
    [ingestFile],
  );

  const applyPasted = useCallback(() => {
    const newErrors: SideError[] = [];
    const pasted: [Side, string][] = [
      ['branch', pasteBranch],
      ['original', pasteOriginal],
    ];
    for (const [side, text] of pasted) {
      const trimmed = text.trim();
      if (!trimmed) continue;
      const v = parseVerdict(trimmed);
      if (v.ok) setSide(side, v.data);
      else newErrors.push({ side, ...v.error });
    }
    addErrors(newErrors);
  }, [pasteBranch, pasteOriginal, setSide, addErrors]);

  const fetchOriginalFromSlug = useCallback(async () => {
    if (!slug) return;
    await loadFromUrl(
      'original',
      snapshotUrl(slug, PAGES_BASE, recipesIndex.recipes),
    );
  }, [slug, loadFromUrl]);

  const clear = useCallback(() => {
    setBranch(null);
    setOriginal(null);
    setErrors([]);
  }, []);

  const showComparison = branch != null || original != null;

  return (
    <div className="v-rc">
      <section className="v-rc__section">
        <p className="v-rc__eyebrow">{s.inputSection}</p>
        <div className="v-rc__inputs">
          <label className="v-rc__field">
            <span className="v-rc__field-label">{s.slugLabel}</span>
            <input
              type="text"
              className="v-rc__field-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={s.slugPlaceholder}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <span className="v-rc__field-help">{s.slugHelp}</span>
          </label>
          <label className="v-rc__field">
            <span className="v-rc__field-label">{s.expectedLabel}</span>
            <select
              className="v-rc__field-input"
              value={expected}
              onChange={(e) =>
                setExpected(
                  e.target.value === 'reproduced'
                    ? 'reproduced'
                    : 'unreproduced',
                )
              }
            >
              <option value="unreproduced">{s.expectedFailDesc}</option>
              <option value="reproduced">{s.expectedPassDesc}</option>
            </select>
          </label>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: drop targets need to
            be <div> to receive ondrop/ondragover; the role="button" + keyboard
            handler keeps the click-to-pick interaction accessible. */}
        <div
          className="v-rc__drop"
          onDrop={onDrop}
          onDragOver={onDragOver}
          role="button"
          tabIndex={0}
          aria-label={s.dropPrompt}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <p className="v-rc__drop-prompt">{s.dropPrompt}</p>
          <p className="v-rc__drop-hint">{s.dropHint}</p>
          <p className="v-rc__drop-pick">
            <span className="v-rc__drop-pick-link">{s.orPickFile}</span>
            <span className="v-rc__drop-accept">{s.acceptHint}</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            multiple
            onChange={onPickFile}
            style={{ display: 'none' }}
          />
        </div>

        <div className="v-rc__actions">
          <button
            type="button"
            className="v-rc__btn v-rc__btn--primary"
            onClick={fetchOriginalFromSlug}
            disabled={!slug || busy}
          >
            {busy ? s.loading : original ? s.refetchOriginal : s.fetchOriginal}
          </button>
          <button
            type="button"
            className="v-rc__btn v-rc__btn--ghost"
            onClick={clear}
            disabled={!showComparison && errors.length === 0}
          >
            {s.clear}
          </button>
        </div>
      </section>

      {errors.length > 0 ? (
        <section className="v-rc__errors">
          <header className="v-rc__errors-header">{s.errorTitle}</header>
          <ul className="v-rc__errors-list">
            {errors.map((e, i) => (
              <li key={i} className={`v-rc__error v-rc__error--${e.side}`}>
                <span className="v-rc__error-side">[{e.side}]</span>{' '}
                <span className="v-rc__error-path">{s.errorAt(e.path)}</span>{' '}
                <span className="v-rc__error-msg">— {e.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="v-rc__paste">
        <summary className="v-rc__eyebrow">{s.pasteSection}</summary>
        <div className="v-rc__paste-grid">
          <label>
            <span className="v-rc__field-label">{s.pasteOriginal}</span>
            <textarea
              className="v-rc__paste-area"
              rows={6}
              spellCheck={false}
              value={pasteOriginal}
              onChange={(e) => setPasteOriginal(e.target.value)}
              placeholder='{"contract":"v1","verdict":"reproduced",...}'
            />
          </label>
          <label>
            <span className="v-rc__field-label">{s.pasteBranch}</span>
            <textarea
              className="v-rc__paste-area"
              rows={6}
              spellCheck={false}
              value={pasteBranch}
              onChange={(e) => setPasteBranch(e.target.value)}
              placeholder='{"contract":"v1","verdict":"unreproduced",...}'
            />
          </label>
        </div>
        <button
          type="button"
          className="v-rc__btn v-rc__btn--ghost"
          onClick={applyPasted}
          disabled={!pasteBranch.trim() && !pasteOriginal.trim()}
        >
          {s.pasteApply}
        </button>
      </details>

      {showComparison ? (
        <section className="v-rc__section">
          <p className="v-rc__eyebrow">{s.comparisonHeader}</p>
          <VerdictCompareLayout
            lang={lang}
            slug={slug}
            expected={expected}
            original={original}
            branch={branch}
          />
        </section>
      ) : null}

      <section className="v-rc__section v-rc__help">
        <p className="v-rc__eyebrow">{s.helpHeader}</p>
        <ol className="v-rc__steps">
          <li>{s.helpStep1}</li>
          <li>{s.helpStep2}</li>
          <li>{s.helpStep3}</li>
          <li>{s.helpStep4}</li>
        </ol>
        <p className="v-rc__help-link">
          <a
            href={
              lang === 'ja'
                ? '/vivarium/ja/spec/branch-fix-pipeline'
                : '/vivarium/spec/branch-fix-pipeline'
            }
          >
            {s.workflowDocs}
          </a>
        </p>
      </section>

      <section className="v-rc__section v-rc__semantics">
        <p className="v-rc__eyebrow">{s.semanticsHeader}</p>
        <p>{s.semanticsBody}</p>
      </section>
    </div>
  );
}

export default ReproCompareApp;
