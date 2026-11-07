import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type GuestRole, resolveFollowed } from './bump.ts';
import { type Allowlist, validateDeclaration } from './declaration.ts';
import { fail } from './errors.ts';
import type { GitHubApi } from './github.ts';
import type { Fetcher } from './http.ts';
import type { Runner } from './process.ts';

export interface WatchBump {
  recipe: string;
  role: GuestRole;
}

export interface WatchBuild {
  tool: string;
  repository: string;
  commit: string;
  fixture: string;
}

export interface WatchPlan {
  bumps: WatchBump[];
  build: WatchBuild | null;
}

interface RecipeGuest {
  role: GuestRole;
  accepted?: { commit?: unknown };
}

async function recipeGuests(
  layer1Directory: string,
  slug: string,
): Promise<RecipeGuest[]> {
  let text: string;
  try {
    text = await readFile(join(layer1Directory, slug, 'recipe.json'), 'utf8');
  } catch {
    return [];
  }
  try {
    const { guests } = JSON.parse(text) as { guests?: RecipeGuest[] };
    return Array.isArray(guests) ? guests : [];
  } catch {
    fail('INVALID_INPUT', `${slug}/recipe.json is unreadable`);
  }
}

export async function planWatch(options: {
  api: GitHubApi;
  layer1Directory: string;
  buildWorkflow: string;
  allowlist: Allowlist;
  run: Runner;
  fetcher?: Fetcher;
  token?: string;
  cloneUrl?: (repository: string) => string;
}): Promise<WatchPlan> {
  let entries: Dirent[];
  try {
    entries = await readdir(options.layer1Directory, { withFileTypes: true });
  } catch {
    fail('INVALID_INPUT', `cannot list ${options.layer1Directory}`);
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const bumps: WatchBump[] = [];
  const builds: WatchBuild[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    for (const guest of await recipeGuests(
      options.layer1Directory,
      entry.name,
    )) {
      const declaration = validateDeclaration(guest, options.allowlist);
      const tip = await resolveFollowed(declaration, options);
      if (tip === null) continue;
      if (tip.commit !== declaration.commit) {
        bumps.push({
          recipe: `src/layer1_wasm/${entry.name}/recipe.json`,
          role: guest.role,
        });
      } else if (guest.accepted?.commit !== declaration.commit) {
        builds.push({
          tool: declaration.tool,
          repository: declaration.repository,
          commit: declaration.commit,
          fixture: declaration.fixture,
        });
      }
    }
  }
  // A build that starts while another builds stops as BUSY, so the next guest
  // waits for the merge of the accept pull request, which starts the watch.
  const build = builds[0] ?? null;
  if (
    build === null ||
    (await options.api.activeRuns(options.buildWorkflow)).length > 0
  )
    return { bumps, build: null };
  return { bumps, build };
}
