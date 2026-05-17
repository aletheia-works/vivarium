# Reproduction — sympy/sympy#29413

> **Status**: Layer 1 reproduction page. Uses the shared
> [`_shared/`](../_shared/) helpers and TypeScript toolchain, and emits
> the canonical `vivarium-contract: v1` surface.

## The bug

[sympy/sympy#29413](https://github.com/sympy/sympy/issues/29413) —
`ask(a + 1 > a, Q.extended_real(a))` returns `True`. The correct
answer is `None`: `Q.extended_real(a)` admits `a = ±∞`, and at
either infinity the predicate `a + 1 > a` is undefined (the
left-hand side equals the right-hand side as both reduce to the
same `∞`). The assumption system's blind spot lives in
`core.relational`.

Labels on the upstream issue: `Wrong Result`, `assumptions`,
`core.relational`.

## Why this bug

- Five-line reproduction, zero non-sympy dependencies beyond the
  Python stdlib.
- Verdict is a strict identity check (`result is True`) — a single
  boolean — so the page emits a mechanically-distinguishable
  `reproduced` / `unreproduced` value.
- Reported against sympy 1.14.0 (latest at issue filing time).
  This page pins `sympy==1.14.0` via micropip so the verdict flips
  from `reproduced` to `unreproduced` only when the wheel Pyodide
  installs reflects an upstream fix.
- Pure sympy core — no plotting, no codegen, no external solvers.
  Nothing in the repro path touches a browser-restricted surface.

## Files

| File         | Role                                                              |
| ------------ | ----------------------------------------------------------------- |
| `index.html` | Static page; declares `<meta name="vivarium-contract" content="v1">`. Renders baseline + fix-candidate output panes side-by-side. |
| `repro.ts`   | TypeScript source. Imports `loadVivariumPyodide` and the verdict helpers from `../_shared/`. Compiled to `repro.js` by `bun run build` from `src/layer1_wasm/`. Drives the two-variant run. |
| `repro.js`   | Generated; gitignored. Loaded by `index.html` at runtime.         |
| `repro.py`   | **Native CLI variant.** Same reproduction logic, runnable directly under a real CPython interpreter via `uv run`. See "Native verification" below. |
| `fix-candidate.json` | **Tracked.** Single source of truth for the fix branch the page renders alongside the baseline (fork repo URL + branch ref). Read by `scripts/build-layer1-wheels.sh`. |
| `verify_fix.py` | **Maintainer convenience.** PEP 723 native orchestrator that runs the reproduction against **both** the baseline pin and the fix-candidate spec in side-by-side `uv run --no-project --with <spec>` venvs, so a reviewer can see the before/after verdict in one command. Exits 0 iff baseline reproduces AND fix-candidate does not. Deleted once the fix is merged upstream and released on PyPI. |
| `wheels/`    | Generated; gitignored. `mise run repro:build:wheels` (`scripts/build-layer1-wheels.sh`) builds `sympy-<version>-py3-none-any.whl` from `fix-candidate.json` plus a `manifest.json` (filename + version + resolved commit + spec). `repro.ts` fetches the manifest at page load to install the fix candidate in the same Pyodide tab. |
| `roundtrip.json` | Tracked workflow state (round-trip schema_version 1). Updated as the recipe moves through verify → Vivarium PR → fork+fix → upstream PR. |

Shared visual presentation lives in [`../_shared/style.css`](../_shared/style.css);
this directory does not carry its own copy.

## Verdict contract — `vivarium-contract: v1`

The page conforms to the contract canonicalised in
[`../_shared/verdict.ts`](../_shared/verdict.ts):

- `<meta name="vivarium-contract" content="v1">` declared in `<head>`.
- `document.querySelector('#verdict').dataset.verdict` ∈
  `{"pending", "reproduced", "unreproduced"}`.
- `globalThis.__VIVARIUM_VERDICT__` — mirror of the DOM verdict.
- `globalThis.__VIVARIUM_RESULT__` — a `VivariumResultV1` envelope:
  `{ contract: "v1", bug: { project: "sympy", issue: 29413, upstream_url },
  runtime: { name: "pyodide", version, extras: { python, sympy } },
  result: { ask_result, reproduced }, timing }`.
- Visible verdict text starts with `bug reproduced` or
  `bug not reproduced`.

A `reproduced` verdict means **the bug reproduced** (sympy's
assumption system still claims `True` for `a + 1 > a` under
`Q.extended_real(a)`). An `unreproduced` verdict means either the
bug was fixed in the sympy wheel micropip currently resolves, or
the runtime itself errored before producing a result.

## Running locally — in-browser

```bash
# 1. From src/layer1_wasm/, build the TypeScript sources once.
cd src/layer1_wasm
bun install        # one-time per machine / lockfile change
bun run build      # emits repro.js next to repro.ts (gitignored)

# 2. Serve this directory.
python -m http.server -d sympy-29413 8765
# then open http://localhost:8765/
```

Pyodide does **not** require COOP/COEP headers for this page (no
`SharedArrayBuffer`, no threading), so a plain server is enough.

## Native verification — same reproduction under a real CPython + sympy

The companion `repro.py` script reproduces the bug without any
WASM layer, so a contributor can confirm the gallery page is
catching a *real* upstream behaviour rather than a Pyodide /
micropip quirk. PEP 723 inline metadata pins
**`sympy==1.14.0`** and the `mise.toml` at the repo root pins
Python to 3.13:

```bash
# One-time per machine / mise.toml change.
mise install

# Reproduces the bug; exits 0 on `reproduced`. uv reads the inline
# metadata, builds an ephemeral venv, and runs the script.
mise exec uv -- uv run src/layer1_wasm/sympy-29413/repro.py

# Expected output (sympy 1.14.0):
# {
#   "sympy_version": "1.14.0",
#   "python_version": "3.13.x",
#   "ask_result": "True",
#   "expected": "None (undefined when a = ±oo)",
#   "reproduced": true
# }
# verdict=reproduced — ask(a+1>a, Q.extended_real(a)) returned True, but a=±oo would make this undefined.
```

## Fix-candidate verification

A fork+branch carrying a proposed fix is rendered **side-by-side**
with the baseline on the same page, so a reviewer can see the
before/after verdict in one page load.

- **Fix branch:**
  <https://github.com/JamBalaya56562/sympy/tree/claude/fix-sympy-29413-8Lyc6>
  (sympy ships its installable package at the repo root, so no
  `source.subdirectory` is needed in `fix-candidate.json`).
- **What the page shows:**
  - top right pane (`#output`) — baseline run against PyPI
    `sympy==1.14.0`. Expected `reproduced: true` (ask returns
    `True`).
  - bottom right pane (`#output-fix`) — fix-candidate run against
    the wheel built from the branch. Expected `reproduced: false`
    (ask returns `None`).
  - top-level `#verdict` pill mirrors the baseline so the existing
    single-verdict Contract v1 surface keeps its prior meaning.

### Local in-browser

```bash
# Build the fix-candidate wheel into ./wheels/ (gitignored).
mise install
mise run repro:build:wheels

# Then build + serve the recipe directory as usual.
cd src/layer1_wasm
bun install
bun run build
python -m http.server -d sympy-29413 8765
# Open http://localhost:8765/ — the page loads sympy==1.14.0,
# captures the baseline verdict, then fetches ./wheels/manifest.json,
# installs the wheel into the same Pyodide tab, and re-runs the
# probe to populate the fix-candidate pane.
```

### Native (uv venvs)

```bash
mise install                                                          # one-time
mise exec uv -- uv run src/layer1_wasm/sympy-29413/verify_fix.py
# Exits 0 iff baseline reproduces AND fix-candidate does not. Prints
# a single JSON envelope to stdout with both per-variant verdicts.
```

### Cleanup once the fix lands upstream

When sympy releases a wheel that includes this fix on PyPI:

1. Bump the pin in `repro.ts`, `repro.py`, and `index.html` to the
   first fixed release (e.g. `sympy==1.14.1`).
2. Delete `fix-candidate.json`, `verify_fix.py`, and the
   `wheels/` directory if any local artefacts remain.
3. Revert `index.html` and `repro.ts` to the single-variant layout
   (one `#output` pane, no `vh-output-multi` / `#output-fix`).
4. The recipe page then reports a single `unreproduced` verdict
   against the fixed release — same shape as a freshly-merged
   bug-fix recipe.

## Round-trip state

`roundtrip.json` tracks the recipe's progress through the round-
trip loop (see
[the round-trip guide](https://aletheia-works.github.io/vivarium/guide/round-trip)
for the stage breakdown). Stages reflect:

- `status: "draft"` — recipe just scaffolded.
- `status: "verifying"` — `verdicts.unfixed` captured.
- `status: "verified"` — both verdicts captured, the fix actually
  flips the page.
- `status: "upstream_open"` — upstream draft PR opened.
- `status: "merged"` — upstream merged. (Terminal.)
- `status: "blocked"` — any stage failure; reason in `notes[]`.

## Deployment

Published to GitHub Pages at
`https://aletheia-works.github.io/vivarium/repro/sympy/29413/` by
the `deploy-docs` workflow. The workflow runs `bun install` +
`bun run build` in `src/layer1_wasm/` first so the compiled
`repro.js` exists when the bundling step copies the directory
into the Pages artefact.
