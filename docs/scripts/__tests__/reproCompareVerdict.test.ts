import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import {
  parseVerdict,
  readVerdictBundle,
} from '../../site/_components/repro-compare-verdict';

const verdict = {
  contract: 'v1',
  verdict: 'reproduced',
  exit_code: 0,
  image_tag: 'ghcr.io/aletheia-works/vivarium/x:latest',
  image_digest: 'sha256:abc',
  captured_at: '2026-11-07T00:00:00Z',
  stdout: 'out',
  stderr_tail: '',
};

async function bundle(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'blob' });
}

describe('parseVerdict', () => {
  test('accepts a valid verdict', () => {
    expect(parseVerdict(JSON.stringify(verdict))).toEqual({
      ok: true,
      data: verdict,
    } as never);
  });

  test('reports invalid JSON at the root', () => {
    const result = parseVerdict('{');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path).toBe('/');
  });

  test('names a missing required field', () => {
    const { stdout: _, ...missing } = verdict;
    expect(parseVerdict(JSON.stringify(missing))).toEqual({
      ok: false,
      error: { path: '/stdout', message: 'required field missing' },
    });
  });
});

describe('readVerdictBundle', () => {
  test('reads both sides from nested paths', async () => {
    const branch = { ...verdict, verdict: 'unreproduced', exit_code: 1 };
    const result = await readVerdictBundle(
      await bundle({
        'verdict-bundle/branch-fix-verdict.json': JSON.stringify(branch),
        'verdict-bundle/original-verdict.json': JSON.stringify(verdict),
        'verdict-bundle/notes.txt': 'ignored',
      }),
    );
    expect(result).toEqual({
      verdicts: { branch, original: verdict },
      errors: [],
    } as never);
  });

  test('reports a broken side without dropping the other', async () => {
    const result = await readVerdictBundle(
      await bundle({
        'branch-fix-verdict.json': 'not json',
        'original-verdict.json': JSON.stringify(verdict),
      }),
    );
    expect(result.verdicts).toEqual({ original: verdict } as never);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ side: 'branch', path: '/' });
  });

  test('returns nothing for a zip without verdict files', async () => {
    expect(
      await readVerdictBundle(await bundle({ 'README.md': '# x' })),
    ).toEqual({ verdicts: {}, errors: [] });
  });
});
