import type { VivariumResultV1 } from '../_shared/verdict.js';

export type GuestRole = 'baseline' | 'fix';

export const COMMIT_TIMESTAMP = '2001-02-03T04:05:06+07:00';

export const COMMANDS = [
  'jj git init',
  `jj config set --repo debug.commit-timestamp ${COMMIT_TIMESTAMP}`,
  'jj new -m B',
  'jj describe @- -m NEW',
  'jj undo',
] as const;

export const RETRY_COMMAND = 'jj describe @- -m NEW';

export interface CommandResult {
  command: string;
  code: number;
  output: string;
}

export interface CommandRunner {
  run(command: string): Promise<CommandResult>;
}

export interface SessionResult {
  role: GuestRole;
  commands: CommandResult[];
  rewrittenParent: string;
  retryCode: number;
  existingCommit: string | null;
  reproduced: boolean;
  corrected: boolean;
}

export type Outcome =
  | { ok: true; session: SessionResult }
  | { ok: false; error: string };

export interface Decision {
  verdict: 'reproduced' | 'unreproduced';
  fixStatus: 'ok' | 'error';
  baselineError: string | null;
  fixError: string | null;
  baselineCorrected: boolean;
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');
const PARENT = /^Parent commit \(@-\)\s*: \S+ ([0-9a-f]+) /m;
const ALREADY_EXISTS = /Newly-created commit ([0-9a-f]{40}) already exists/;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

export function parentCommit(output: string): string | null {
  return PARENT.exec(stripAnsi(output))?.[1] ?? null;
}

export function existingCommit(output: string): string | null {
  return ALREADY_EXISTS.exec(stripAnsi(output))?.[1] ?? null;
}

export async function runSession(
  role: GuestRole,
  runner: CommandRunner,
): Promise<SessionResult> {
  const commands: CommandResult[] = [];
  const run = async (command: string): Promise<CommandResult> => {
    const result = await runner.run(command);
    commands.push(result);
    return result;
  };
  let rewrittenParent: string | null = null;
  for (const command of COMMANDS) {
    const result = await run(command);
    if (result.code !== 0)
      throw new SessionError(`${role}: ${command} exited ${result.code}`);
    if (command === RETRY_COMMAND)
      rewrittenParent = parentCommit(result.output);
  }
  if (rewrittenParent === null)
    throw new SessionError(
      `${role}: the first ${RETRY_COMMAND} printed no parent commit`,
    );
  const retry = await run(RETRY_COMMAND);
  if (retry.code === 0) {
    if (parentCommit(retry.output) !== rewrittenParent)
      throw new SessionError(
        `${role}: the retried ${RETRY_COMMAND} did not re-create ${rewrittenParent}`,
      );
    return {
      role,
      commands,
      rewrittenParent,
      retryCode: 0,
      existingCommit: null,
      reproduced: false,
      corrected: true,
    };
  }
  const existing = existingCommit(retry.output);
  if (existing === null || !existing.startsWith(rewrittenParent))
    throw new SessionError(
      `${role}: the retried ${RETRY_COMMAND} exited ${retry.code} without naming ${rewrittenParent} as already existing`,
    );
  return {
    role,
    commands,
    rewrittenParent,
    retryCode: retry.code,
    existingCommit: existing,
    reproduced: true,
    corrected: false,
  };
}

export async function settle(
  session: Promise<SessionResult>,
): Promise<Outcome> {
  try {
    return { ok: true, session: await session };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function decide(baseline: Outcome, fix: Outcome): Decision {
  const fixError = fix.ok
    ? fix.session.corrected
      ? null
      : `fix: ${RETRY_COMMAND} still fails after jj undo`
    : fix.error;
  return {
    verdict:
      baseline.ok && baseline.session.reproduced
        ? 'reproduced'
        : 'unreproduced',
    fixStatus: fixError === null ? 'ok' : 'error',
    baselineError: baseline.ok ? null : baseline.error,
    fixError,
    baselineCorrected: baseline.ok && baseline.session.corrected,
  };
}

export interface GuestIdentity {
  commit: string;
  buildKey: string;
}

export interface EnvelopeInput {
  decision: Decision;
  baseline: SessionResult | null;
  fix: SessionResult | null;
  upstreamUrl: string;
  packageVersion: string;
  packSha256: string;
  guests: Record<GuestRole, GuestIdentity>;
  startedAt: Date;
  finishedAt: Date;
}

export function buildEnvelope(input: EnvelopeInput): VivariumResultV1 {
  return {
    contract: 'v1',
    bug: { project: 'jj', issue: 10189, upstream_url: input.upstreamUrl },
    runtime: {
      name: 'formicarium',
      version: input.packageVersion,
      extras: {
        commit_timestamp: COMMIT_TIMESTAMP,
        baseline_commit: input.guests.baseline.commit,
        baseline_build_key: input.guests.baseline.buildKey,
        fix_commit: input.guests.fix.commit,
        fix_build_key: input.guests.fix.buildKey,
        pack_sha256: input.packSha256,
      },
    },
    result: {
      baseline: input.baseline,
      fix_candidate: input.fix,
      baseline_error: input.decision.baselineError,
      fix_error: input.decision.fixError,
      baseline_corrected: input.decision.baselineCorrected,
    },
    timing: {
      started_at: input.startedAt.toISOString(),
      finished_at: input.finishedAt.toISOString(),
      duration_ms: input.finishedAt.getTime() - input.startedAt.getTime(),
    },
  };
}
