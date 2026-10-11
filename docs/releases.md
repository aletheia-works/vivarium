# Release automation

Every push to upstream `main` runs Release Please using the existing
`aletheia-works-bot` installation (`BOT_CLIENT_ID` and `BOT_PRIVATE_KEY`).
It needs Contents, Issues, and Pull requests write permissions. Installation
tokens let release PRs run the required CI checks and MCP tags trigger
`publish-mcp.yml`. Registry authentication continues to use OIDC; there are
no npm or JSR tokens to configure.

## Version calculation

Release Please groups the following independently calculated releases in
one PR. Merge that PR after reviewing its changelogs and required checks.
There is no scheduled merge in this stage.

| Component | Commits considered | Files updated | Tag |
| --- | --- | --- | --- |
| Vivarium | All repository changes | `.github/vivarium-version.txt`, root `CHANGELOG.md` | `v<version>` |
| MCP server | Changes under `packages/mcp-server/` | `package.json`, `jsr.json`, package `CHANGELOG.md` | `mcp-server-v<version>` |

Conventional Commits determine the bump: `fix` produces a patch, `feat`
produces a minor, and breaking changes produce a major after 1.0. Before
1.0, breaking changes produce a minor and features still produce a minor.
Commits such as `docs`, `chore`, and `ci` do not trigger a release alone.
An MCP change can contribute to both the repository and package releases;
a docs-only or recipe-only change never bumps the MCP package.

`.github/release-please-manifest.json` records the last released versions.
The bootstrap values are `v0.1.3` and `mcp-server-v0.2.1`, which share commit
`6dd66ec958e75e0986179ce221bdf2405d7e6923`. The checked-in MCP metadata already
says `0.2.2`, but no corresponding tag exists; the first release PR calculates
the next version from changes since the last actual release. The bootstrap
SHA limits initial history and does not replace later release boundaries.
After bootstrap, let Release Please update the manifest and version files.
Private docs and reproduction package versions are not release components.

The docs unit suite tests the release configuration with Release Please
`17.6.0`, matching the engine bundled in `release-please-action` v5.0.0.
When upgrading that action, update the test dependency to its bundled engine
version as well.

## Tags, releases, and publishing

Merging the release PR triggers another `main` run. Release Please creates
tags on that PR's merge commit and GitHub releases containing the changelogs.
The existing MCP tag workflow publishes the matching package to npm and JSR.
GitHub release creation and registry publication are separate steps: a
GitHub release can exist while registry publication has failed.

The pending and tagged labels are managed in `infra/github/main.tf`.
The release workflow requires them to exist rather than creating labels.
On initial rollout, a successful Terraform Apply run triggers reconciliation
again, so the release PR can be created after those labels have been applied.
This workflow only operates in `aletheia-works/vivarium` on `main`.

## Recovery

- If Release Please fails, fix the reported App permissions or configuration
  error, then run **Release** from Actions on `main`. Reconciliation can
  resume tag or GitHub release creation without changing released tags.
- If npm or JSR publication fails, run **publish-mcp** manually with the
  existing `mcp-server-v<version>` tag. The guard validates both manifests,
  checks both registries, and skips a registry that already has that version.
  Only HTTP 404 means unpublished; other HTTP and network errors stop the run.
- Do not edit a release PR's generated versions, manually bump the manifest,
  move released tags, or reuse a released version to fix package contents.
  Merge a Conventional Commit fix and release the next version instead.

The `publish-mcp.yml` filename remains the npm trusted publisher entry point.
The former workflow that created `v…` releases from manually entered versions
has been replaced by Release Please.
