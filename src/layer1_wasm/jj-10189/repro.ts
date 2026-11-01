import {
  type AcceptedGuest,
  DEFAULT_STRINGS,
  type LoadedFormicarium,
  loadFormicarium,
  type RecipeGuest,
  recordMark,
  type TerminalStrings,
  waitForIsolation,
} from '../_shared/formicarium_terminal.js';
import {
  createFormicariumTerminal,
  type FormicariumTerminalElement,
} from '../_shared/formicarium_terminal_element.js';
import { pick } from '../_shared/i18n.js';
import { setResult, setVerdict } from '../_shared/verdict.js';
import {
  buildEnvelope,
  decide,
  type GuestRole,
  type Outcome,
  runSession,
  settle,
} from './verdict.js';

const UPSTREAM_URL = 'https://github.com/jj-vcs/jj/issues/10189';
const ROLES: readonly GuestRole[] = ['baseline', 'fix'];

const S = pick(
  {
    loading: 'Loading formicarium…',
    running: 'Running the same commands in both terminals…',
    reproduced:
      'bug reproduced — after jj undo, the same jj describe fails with "Newly-created commit … already exists".',
    absent:
      'bug not reproduced — the baseline already re-creates the commit after jj undo.',
    error: 'Not judged: a check, a command or the output failed',
    notAccepted: 'this guest has no accepted build yet',
  },
  {
    loading: 'formicarium を読み込み中…',
    running: '同じコマンドを両方のターミナルで実行中…',
    reproduced:
      'bug reproduced — jj undo の後、同じ jj describe が "Newly-created commit … already exists" で失敗する。',
    absent:
      'bug not reproduced — baseline は jj undo の後もコミットを既に作り直せる。',
    error: '照合・実行に失敗したため判定していない',
    notAccepted: 'この guest には受入済みのビルドがまだ無い',
  },
);

const STRINGS: TerminalStrings = pick(DEFAULT_STRINGS, {
  connecting: '接続中…',
  booting: 'guest を起動中…',
  ready: '準備完了',
  running: '実行中…',
  failed: '失敗',
  disconnected: '停止',
  empty: '(出力なし)',
  dropped: '先頭の {0} bytes は表示していない',
  input: 'コマンド',
});

interface Recipe {
  guests: RecipeGuest[];
}

const panes: Record<GuestRole, HTMLElement> = {
  baseline: required('output-baseline'),
  fix: required('output-fix'),
};
const meta = required('meta');

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

async function readJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok)
    throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function acceptedFor(guest: RecipeGuest): Promise<AcceptedGuest> {
  if (guest.accepted) return guest.accepted;
  try {
    return await readJson<AcceptedGuest>(
      new URL(`./guests/${guest.role}/accepted.json`, document.baseURI),
    );
  } catch {
    throw new Error(`${guest.role}: ${S.notAccepted}`);
  }
}

const startedAt = new Date();
const outcomes: Record<GuestRole, Outcome> = {
  baseline: { ok: false, error: S.notAccepted },
  fix: { ok: false, error: S.notAccepted },
};
const identities: Record<GuestRole, { commit: string; buildKey: string }> = {
  baseline: { commit: '', buildKey: '' },
  fix: { commit: '', buildKey: '' },
};
let loaded: LoadedFormicarium | null = null;

function record(): void {
  const decision = decide(outcomes.baseline, outcomes.fix);
  setResult(
    buildEnvelope({
      decision,
      baseline: outcomes.baseline.ok ? outcomes.baseline.session : null,
      fix: outcomes.fix.ok ? outcomes.fix.session : null,
      upstreamUrl: UPSTREAM_URL,
      packageVersion: loaded?.version ?? 'unknown',
      packSha256: loaded?.packSha256 ?? '',
      guests: identities,
      startedAt,
      finishedAt: new Date(),
    }),
  );
  panes.fix.dataset['fixStatus'] = decision.fixStatus;
  const failure = decision.baselineError ?? decision.fixError;
  setVerdict(
    decision.verdict,
    decision.baselineError !== null
      ? `${S.error}: ${decision.baselineError}`
      : decision.verdict === 'reproduced'
        ? S.reproduced
        : S.absent,
  );
  meta.textContent = `formicarium ${loaded?.version ?? '—'} · baseline ${identities.baseline.commit.slice(0, 8) || '—'} · fix ${identities.fix.commit.slice(0, 8) || '—'}${failure ? ` · ${S.error}: ${failure}` : ''}`;
  recordMark('verdict');
}

try {
  setVerdict('pending', S.loading, 'loading');
  await waitForIsolation();
  recordMark('isolated');
  const recipe = await readJson<Recipe>(
    new URL('./recipe.json', document.baseURI),
  );
  loaded = await loadFormicarium({ pageURL: location.href });
  const terminals: Partial<Record<GuestRole, FormicariumTerminalElement>> = {};
  for (const role of ROLES) {
    const guest = recipe.guests.find((item) => item.role === role);
    if (!guest) {
      outcomes[role] = { ok: false, error: `${role}: no guest` };
      continue;
    }
    try {
      const accepted = await acceptedFor(guest);
      identities[role] = {
        commit: accepted.commit,
        buildKey: accepted.buildKey,
      };
      const terminal = createFormicariumTerminal({
        loaded,
        guest,
        accepted,
        guestURL: new URL(`./guests/${role}/`, document.baseURI).href,
        binary: guest.tool,
        fixture: [],
        strings: STRINGS,
      });
      panes[role].replaceChildren(terminal);
      terminals[role] = terminal;
      await terminal.ready.catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes[role] = { ok: false, error: message };
      panes[role].textContent = message;
    }
  }
  setVerdict('pending', S.running, 'running');
  for (const role of ROLES) {
    const terminal = terminals[role];
    if (terminal) outcomes[role] = await settle(runSession(role, terminal));
  }
  record();
  for (const terminal of Object.values(terminals)) terminal.enableInput();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  for (const role of ROLES) {
    outcomes[role] = { ok: false, error: message };
    panes[role].textContent = `${S.error}: ${message}`;
  }
  record();
}
