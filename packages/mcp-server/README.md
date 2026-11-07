# `@aletheia-works/vivarium-mcp`

[Model Context Protocol](https://modelcontextprotocol.io) server for
[Vivarium](https://aletheia-works.github.io/vivarium), a catalogue of
reproductions of real bugs. It lets an AI agent search the catalogue, match an
error to a reproduction, and read verdicts without scraping the website.

## Install

You need Node.js 26 or later. The server is also published on
[JSR](https://jsr.io/@aletheia-works/vivarium-mcp).

For Claude Code:

```bash
claude mcp add vivarium -- npx -y @aletheia-works/vivarium-mcp@latest
```

For other clients, add this to their MCP configuration, such as
`~/.cursor/mcp.json` for Cursor:

```json
{
  "mcpServers": {
    "vivarium": {
      "command": "npx",
      "args": ["-y", "@aletheia-works/vivarium-mcp@latest"]
    }
  }
}
```

## Tools

### Find and read reproductions

| Tool | What it does |
|---|---|
| `list_recipes(layer?, project?, q?)` | Lists reproductions, optionally filtered. |
| `get_recipe(slug)` | Returns one reproduction's details and links. |
| `lookup_verdict(slug)` | Returns the saved verdict for Layer 2, the page to open for Layer 1 (its verdict is computed in the browser), or the preview link for Layer 3. |
| `match_error(text, limit?)` | Ranks reproductions against an error message or stack trace, using token overlap, synonyms and small typo tolerance. No LLM is involved. |
| `search_upstream_issues(project?, repo?, query?, ...)` | Searches a project's GitHub issues for bugs worth reproducing. Needs an authenticated [`gh`](https://cli.github.com). |

### Verify a fix

| Tool | What it does |
|---|---|
| `verify_branch_fix(slug, fix_url?, fix_source?)` | For Layer 2, returns the workflow command and comparison link. Dispatching the workflow needs write access to the Vivarium repository. Other layers currently return an error. |
| `verify_and_report_fix(slug, ...)` | Works out the next verification step and, unless `auto_execute` is `false`, runs it. Needs a Vivarium checkout and `gh`. |
| `create_fork_pr(slug, current_state, pr_title, ...)` | Opens a draft pull request from your pushed fork branch. By default, `dry_run` only returns the command. Needs `gh` for a real run. |

### Add to the catalogue

| Tool | What it does |
|---|---|
| `prepare_new_recipe(project, issue, title, ...)` | Returns the commands and files for a new reproduction. |
| `prepare_fix_candidate(slug, fork_url, branch, ...)` | Returns the files and commands to run a fork's fix beside the released build on a Layer 1 page. |

## Catalogue data

The server needs no configuration. It reads the
[catalogue](https://aletheia-works.github.io/vivarium/api/recipes.json) and
caches it for five minutes. Offline, it uses a copy bundled with the package.

## Versioning

The tools and their arguments may change before version 1.0. Pin a version in
your client's configuration if you need them to stay fixed.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
