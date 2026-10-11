import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { configSchema, type GitHub, Manifest } from 'release-please';
import { parseConventionalCommits } from 'release-please/build/src/commit';
import { buildStrategy } from 'release-please/build/src/factory';
import { CommitSplit } from 'release-please/build/src/util/commit-split';
import { TagName } from 'release-please/build/src/util/tag-name';
import { Version } from 'release-please/build/src/version';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const baseline = '0'.repeat(40);
const merge = 'b'.repeat(40);
const manifestPath = '.github/release-please-manifest.json';
const versions = { '.': '0.1.3', 'packages/mcp-server': '0.2.1' };
const commits = [
  {
    message: 'fix(mcp): correct a response',
    sha: 'a'.repeat(40),
    files: ['packages/mcp-server/src/server.ts'],
  },
  { message: 'chore: historical release', sha: baseline, files: [] },
];

function client() {
  return {
    repository: { owner: 'aletheia-works', repo: 'vivarium' },
    getFileJson: async (path: string) =>
      path === manifestPath ? versions : JSON.parse(read(path)),
    getFileContentsOnBranch: async (path: string) => ({
      parsedContent: read(path),
    }),
    findFilesByGlobAndRef: async (path: string) => [path],
    releaseIterator: async function* () {
      yield { tagName: 'v0.1.3', sha: baseline, notes: '' };
      yield { tagName: 'mcp-server-v0.2.1', sha: baseline, notes: '' };
    },
    mergeCommitIterator: async function* () {
      yield* commits;
    },
  };
}

const load = (github: GitHub) =>
  Manifest.fromManifest(
    github,
    'main',
    '.github/release-please-config.json',
    manifestPath,
  );

describe('release automation', () => {
  test('configuration conforms to the action engine schema', () => {
    const validate = new Ajv({
      strict: false,
      validateFormats: false,
    }).compile(configSchema);
    expect(
      validate(JSON.parse(read('.github/release-please-config.json'))),
    ).toBe(true);
    expect(validate.errors).toBeNull();
  });

  for (const [message, expected] of [
    ['fix(mcp): correct a response', '0.2.2'],
    ['feat(mcp): add a tool', '0.3.0'],
    ['feat(mcp)!: change the protocol', '0.3.0'],
    ['docs(mcp): document a tool', undefined],
  ] as const) {
    test(message, async () => {
      const github = client() as unknown as GitHub;
      const manifest = await load(github);
      const strategy = await buildStrategy({
        ...manifest.repositoryConfig['packages/mcp-server'],
        github,
        path: 'packages/mcp-server',
        targetBranch: 'main',
      });
      const pr = await strategy.buildReleasePullRequest(
        parseConventionalCommits([{ ...commits[0], message }]),
        {
          tag: new TagName(Version.parse('0.2.1'), 'mcp-server', '-'),
          sha: baseline,
          notes: '',
        },
      );
      expect(pr?.version?.toString()).toBe(expected);
      if (!pr) return;
      for (const path of [
        'packages/mcp-server/package.json',
        'packages/mcp-server/jsr.json',
      ]) {
        const update = pr.updates.find((entry) => entry.path === path);
        expect(update).toBeDefined();
        expect(
          JSON.parse(update!.updater.updateContent(read(path))).version,
        ).toBe(expected);
      }
    });
  }

  test('grouped release PR produces both tags on its merge commit', async () => {
    const mock = client();
    const github = mock as unknown as GitHub;
    const manifest = await load(github);
    const prs = await manifest.buildPullRequests();
    expect(prs).toHaveLength(1);
    const pr = prs[0];
    const rootVersion = pr.updates.find(
      (update) => update.path === '.github/vivarium-version.txt',
    );
    expect(rootVersion?.updater.updateContent('0.1.3\n')).toBe('0.1.4\n');
    let content = JSON.stringify(versions);
    for (const update of pr.updates) {
      if (update.path === manifestPath) {
        content = update.updater.updateContent(content);
      }
    }
    expect(JSON.parse(content)).toEqual({
      '.': '0.1.4',
      'packages/mcp-server': '0.2.2',
    });
    Object.assign(mock, {
      pullRequestIterator: async function* () {
        yield {
          number: 1,
          title: pr.title.toString(),
          body: pr.body.toString(),
          headBranchName: pr.headRefName,
          baseBranchName: 'main',
          labels: ['autorelease: pending'],
          files: [],
          sha: merge,
        };
      },
    });
    const releases = await manifest.buildReleases();
    expect(releases.map((release) => release.tag.toString()).sort()).toEqual([
      'mcp-server-v0.2.2',
      'v0.1.4',
    ]);
    expect(releases.every((release) => release.sha === merge)).toBe(true);
  });

  test('recipe changes do not enter the MCP release history', () => {
    const split = new CommitSplit({
      packagePaths: ['.', 'packages/mcp-server'],
    }).split([
      {
        ...commits[0],
        message: 'fix(wasm): correct a recipe',
        files: ['src/layer1_wasm/biome-12265/recipe.json'],
      },
    ]);
    expect(split['packages/mcp-server']).toBeUndefined();
  });

  test('already released commits do not create another release PR', async () => {
    const mock = client();
    mock.mergeCommitIterator = async function* () {
      yield commits[1];
    };
    const manifest = await load(mock as unknown as GitHub);
    expect(await manifest.buildPullRequests()).toEqual([]);
  });
});
