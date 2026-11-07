# Vivarium

Run a real bug instead of reading about it. Vivarium is a catalogue of
reproductions of real bugs in open-source projects. Open one and see for
yourself whether the bug still happens.

**[Website](https://aletheia-works.github.io/vivarium)** ·
**[Browse reproductions](https://aletheia-works.github.io/vivarium/repro/)** ·
**[Guide](https://aletheia-works.github.io/vivarium/guide/getting-started)**

## What you can do

- **Check a bug.** Open a reproduction and read its verdict: `reproduced` or
  `unreproduced`, with the output it is based on.
- **Find a bug from an error.** [Paste an error message](https://aletheia-works.github.io/vivarium/repro/match)
  to get matching reproductions.
- **Compare a fix.** [Line up two verdicts](https://aletheia-works.github.io/vivarium/repro/compare)
  to see whether a change made the bug go away.
- **Ask from an AI agent.** Search the catalogue and read verdicts through the
  [MCP server](packages/mcp-server/).
- **Use the data.** Read the catalogue as
  [JSON](https://aletheia-works.github.io/vivarium/api/recipes.json).

## Try it

### In your browser

Open the [pandas #56679 reproduction](https://aletheia-works.github.io/vivarium/repro/pandas/56679/).
It runs in the page, with nothing to install. The first load can take a few
tens of seconds while the runtime downloads.

### With Docker

Reproductions that need a real system ship as images:

```bash
docker run --rm ghcr.io/aletheia-works/vivarium-bash-local-shadows-exit:latest
```

The last line of the output states the verdict.

### From an AI agent

Add the server to your MCP client. For Claude Code:

```bash
claude mcp add vivarium -- npx -y @aletheia-works/vivarium-mcp@latest
```

[Other clients and the full tool list](https://aletheia-works.github.io/vivarium/guide/use-from-ai-agent)
are in the guide.

## How reproductions run

| Layer | Runs in | You need | Good for |
|---|---|---|---|
| 1 | Your browser, through WebAssembly | A browser | Parsers, data processing, command-line tools |
| 2 | A Docker container | Docker | Bugs that need real processes, files or services |
| 3 | A live preview of a whole application | An invitation and a GitHub sign-in | Changes a reviewer checks by using them |

## Documentation

- [Getting started](https://aletheia-works.github.io/vivarium/guide/getting-started)
- [Glossary](https://aletheia-works.github.io/vivarium/guide/glossary)
- [Verdict format (Contract v1)](https://aletheia-works.github.io/vivarium/spec/contract-v1)
- [Catalogue format (Recipes index v1)](https://aletheia-works.github.io/vivarium/spec/recipes-index-v1)

The website is available in English and Japanese.

## Contributing

Bug reports and new reproductions are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE)
