import { describe, expect, test } from 'bun:test';
import {
  recipeSourceUrl,
  snapshotUrl,
} from '../../site/_components/recipe-url';

const source_url =
  'https://github.com/aletheia-works/vivarium/tree/main/src/layer3_previews/x';
const pull_url = 'https://github.com/o/r/pull/1';
const commit_url = 'https://github.com/o/r/commit/abc';
const preview_url = 'https://sign-in.example.com/x/';

describe('snapshotUrl', () => {
  const base = 'https://you.github.io/vivarium/repro';
  const recipes = [
    {
      slug: 'bash-local-shadows-exit',
      verdict_url:
        'https://aletheia-works.github.io/vivarium/repro/bash/local-shadows-exit/verdict.json',
    },
    { slug: 'pandas-56679' },
  ];

  test('a slug resolves to where its snapshot is deployed, on this site', () => {
    expect(snapshotUrl('bash-local-shadows-exit', base, recipes)).toBe(
      `${base}/bash/local-shadows-exit/verdict.json`,
    );
  });

  test('a path is used as given', () => {
    expect(snapshotUrl('bash/local-shadows-exit', base, recipes)).toBe(
      `${base}/bash/local-shadows-exit/verdict.json`,
    );
  });

  test('a recipe with no snapshot falls through to a path that will not be found', () => {
    expect(snapshotUrl('pandas-56679', base, recipes)).toBe(
      `${base}/pandas-56679/verdict.json`,
    );
  });
});

describe('recipeSourceUrl', () => {
  test('a recipe with its own page links to its directory', () => {
    expect(recipeSourceUrl({ source_url })).toBe(source_url);
  });

  test('a preview links to its pull request', () => {
    expect(
      recipeSourceUrl({ preview_url, pull_url, commit_url, source_url }),
    ).toBe(pull_url);
  });

  test('a preview without a pull request links to its commit', () => {
    expect(recipeSourceUrl({ preview_url, commit_url, source_url })).toBe(
      commit_url,
    );
  });
});
