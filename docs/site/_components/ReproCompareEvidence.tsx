import { type Lang, STRINGS } from './repro-compare-strings';
import type { VerdictLiteral, VerdictV1 } from './repro-compare-verdict';

type BadgeVerdict = 'reproduced' | 'unreproduced' | 'pending' | 'unavailable';

export function VerdictBadge({
  verdict,
  size = 'md',
}: {
  verdict: BadgeVerdict;
  size?: 'sm' | 'md' | 'lg';
}) {
  const symbol =
    verdict === 'reproduced'
      ? '✓'
      : verdict === 'unreproduced'
        ? '✕'
        : verdict === 'pending'
          ? '◌'
          : '–';
  return (
    <span
      className={`v-vbadge v-vbadge--${verdict} v-vbadge--${size}`}
      data-verdict={verdict}
    >
      <span className="v-vbadge__symbol" aria-hidden="true">
        {symbol}
      </span>
      <span className="v-vbadge__label">{verdict}</span>
    </span>
  );
}

interface EvidenceExtras {
  duration_ms?: number | null;
}

export function EvidencePanel({
  lang,
  label,
  verdict,
  extras,
  highlight = {},
}: {
  lang: Lang;
  label: string;
  verdict: VerdictV1 | null;
  extras?: EvidenceExtras;
  highlight?: { verdict?: boolean; exit_code?: boolean; duration_ms?: boolean };
}) {
  const s = STRINGS[lang];
  if (!verdict) {
    return (
      <article className="v-evidence v-evidence--empty">
        <header className="v-evidence__header">
          <span className="v-evidence__side-label">{label}</span>
        </header>
        <p className="v-evidence__missing">{s.evidenceMissing}</p>
      </article>
    );
  }
  return (
    <article className="v-evidence">
      <header className="v-evidence__header">
        <span className="v-evidence__side-label">{label}</span>
        <span
          className={
            'v-evidence__verdict' +
            (highlight.verdict ? ' v-evidence__verdict--diverges' : '')
          }
        >
          <VerdictBadge verdict={verdict.verdict} size="lg" />
        </span>
      </header>
      <dl className="v-evidence__facts">
        <div
          className={
            'v-evidence__row' +
            (highlight.exit_code ? ' v-evidence__row--diverges' : '')
          }
        >
          <dt>{s.evidenceExit}</dt>
          <dd>
            <code>{verdict.exit_code}</code>
          </dd>
        </div>
        {extras?.duration_ms != null ? (
          <div
            className={
              'v-evidence__row' +
              (highlight.duration_ms ? ' v-evidence__row--diverges' : '')
            }
          >
            <dt>{s.evidenceDuration}</dt>
            <dd>
              <code>
                {extras.duration_ms}
                {s.durationMsSuffix}
              </code>
            </dd>
          </div>
        ) : null}
        <div className="v-evidence__row">
          <dt>{s.evidenceImageTag}</dt>
          <dd>
            <code className="v-evidence__wrap">{verdict.image_tag}</code>
          </dd>
        </div>
        <div className="v-evidence__row">
          <dt>{s.evidenceImageDigest}</dt>
          <dd>
            <code className="v-evidence__wrap">
              {verdict.image_digest || '(empty)'}
            </code>
          </dd>
        </div>
        <div className="v-evidence__row">
          <dt>{s.evidenceCapturedAt}</dt>
          <dd>
            <code>{verdict.captured_at}</code>
          </dd>
        </div>
      </dl>
      <details className="v-evidence__stream" open>
        <summary>{s.evidenceStdout}</summary>
        <pre className="v-evidence__stream-body">
          {verdict.stdout || s.evidenceEmpty}
        </pre>
      </details>
      <details className="v-evidence__stream">
        <summary>{s.evidenceStderr}</summary>
        <pre className="v-evidence__stream-body">
          {verdict.stderr_tail || s.evidenceEmpty}
        </pre>
      </details>
    </article>
  );
}

export function VerdictCompareLayout({
  lang,
  slug,
  expected,
  original,
  branch,
}: {
  lang: Lang;
  slug: string;
  expected: VerdictLiteral;
  original: VerdictV1 | null;
  branch: VerdictV1 | null;
}) {
  const s = STRINGS[lang];
  const branchMatchesExpected = branch ? branch.verdict === expected : null;
  const verdictsDiverge =
    original != null && branch != null && original.verdict !== branch.verdict;
  const exitsDiverge =
    original != null &&
    branch != null &&
    original.exit_code !== branch.exit_code;

  const matchClassName =
    branchMatchesExpected == null
      ? ''
      : branchMatchesExpected
        ? ' v-compare-strip__match--ok'
        : ' v-compare-strip__match--bad';

  return (
    <div className="v-compare-strip">
      <header className="v-compare-strip__header">
        <div className="v-compare-strip__slug">
          {slug ? <code>{slug}</code> : null}
        </div>
        <div className={`v-compare-strip__match${matchClassName}`}>
          {branchMatchesExpected == null
            ? null
            : branchMatchesExpected
              ? `branch ${branch?.verdict} = expected ${expected} · ${s.expectedMatchYes}`
              : `branch ${branch?.verdict} ≠ expected ${expected} · ${s.expectedMatchNo}`}
        </div>
      </header>
      {original == null && branch != null ? (
        <p className="v-compare-strip__note">{s.noOriginalDeployed}</p>
      ) : null}
      <div className="v-compare-strip__cols">
        <EvidencePanel
          lang={lang}
          label={s.originalLabel}
          verdict={original}
          highlight={{}}
        />
        <EvidencePanel
          lang={lang}
          label={s.branchLabel}
          verdict={branch}
          highlight={{
            verdict: verdictsDiverge,
            exit_code: exitsDiverge,
          }}
        />
      </div>
    </div>
  );
}
