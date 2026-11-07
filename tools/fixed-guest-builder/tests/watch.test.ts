import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAllowlist } from '../src/declaration.ts';
import { BuildError } from '../src/errors.ts';
import { runProcess } from '../src/process.ts';
import { planWatch } from '../src/watch.ts';
import { FakeGitHub } from './helpers/fake-github.ts';
import { createUpstream, tempDir } from './helpers/git.ts';

const REPOSITORY = 'https://github.com/jj-vcs/jj';
const WORKFLOW = 'fixed-guest-build.yml';
const allowlist = parseAllowlist({
  schemaVersion: 1,
  repositories: [REPOSITORY],
});

function guest(
  role: string,
  commit: string,
  reference: unknown,
  accepted?: string,
) {
  return {
    role,
    tool: 'jj',
    repository: REPOSITORY,
    commit,
    fixture: 'jj-10189',
    reference,
    ...(accepted === undefined ? {} : { accepted: { commit: accepted } }),
  };
}

async function layer1(recipes: Record<string, unknown>): Promise<string> {
  const directory = await tempDir();
  for (const [slug, content] of Object.entries(recipes)) {
    await mkdir(join(directory, slug));
    await writeFile(
      join(directory, slug, 'recipe.json'),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }
  return directory;
}

async function plan(
  url: string,
  layer1Directory: string,
  api = new FakeGitHub(),
) {
  return planWatch({
    api,
    layer1Directory,
    buildWorkflow: WORKFLOW,
    allowlist,
    run: runProcess,
    fetcher: async () => Response.json({ tag_name: 'v1' }),
    cloneUrl: () => url,
  });
}

describe('planWatch', () => {
  test('bumps every guest behind what it follows and builds nothing for it', async () => {
    const upstream = await createUpstream();
    const directory = await layer1({
      'jj-10189': {
        guests: [
          guest(
            'baseline',
            upstream.main,
            { release: 'latest' },
            upstream.main,
          ),
          guest('fix', upstream.tagged, { branch: 'main' }, upstream.tagged),
        ],
      },
    });
    expect(await plan(upstream.url, directory)).toEqual({
      bumps: [
        { recipe: 'src/layer1_wasm/jj-10189/recipe.json', role: 'baseline' },
        { recipe: 'src/layer1_wasm/jj-10189/recipe.json', role: 'fix' },
      ],
      build: null,
    });
  });

  test('builds one guest whose commit has no accepted build', async () => {
    const upstream = await createUpstream();
    const directory = await layer1({
      'jj-10189': {
        guests: [
          guest(
            'baseline',
            upstream.tagged,
            { release: 'latest' },
            upstream.main,
          ),
          guest('fix', upstream.main, { branch: 'main' }),
        ],
      },
    });
    expect(await plan(upstream.url, directory)).toEqual({
      bumps: [],
      build: {
        tool: 'jj',
        repository: REPOSITORY,
        commit: upstream.tagged,
        fixture: 'jj-10189',
      },
    });
  });

  test('starts no build while a build run is active, but still bumps', async () => {
    const upstream = await createUpstream();
    const directory = await layer1({
      'jj-10189': {
        guests: [
          guest('baseline', upstream.tagged, { release: 'latest' }),
          guest('fix', upstream.tagged, { branch: 'main' }, upstream.tagged),
        ],
      },
    });
    const api = new FakeGitHub();
    api.runs = [{ id: 1, status: 'queued' }];
    expect(await plan(upstream.url, directory, api)).toEqual({
      bumps: [{ recipe: 'src/layer1_wasm/jj-10189/recipe.json', role: 'fix' }],
      build: null,
    });
  });

  test('has nothing to do for current guests, unfollowed guests and recipes without guests', async () => {
    const upstream = await createUpstream();
    const directory = await layer1({
      current: {
        guests: [
          guest(
            'baseline',
            upstream.tagged,
            { release: 'latest' },
            upstream.tagged,
          ),
        ],
      },
      unfollowed: {
        guests: [guest('baseline', upstream.tagged, { pr: 'jj-vcs/jj#1' })],
      },
      plain: { language: 'python' },
      _shared: { guests: 'ignored' },
    });
    await mkdir(join(directory, 'no-recipe'));
    expect(await plan(upstream.url, directory)).toEqual({
      bumps: [],
      build: null,
    });
  });

  test('refuses an unreadable recipe and a missing directory', async () => {
    const upstream = await createUpstream();
    const code = async (directory: string) => {
      try {
        await plan(upstream.url, directory);
      } catch (error) {
        return error instanceof BuildError ? error.code : 'other';
      }
      return 'none';
    };
    expect(await code(await layer1({ broken: '{' }))).toBe('INVALID_INPUT');
    expect(await code(join(await tempDir(), 'missing'))).toBe('INVALID_INPUT');
  });
});
