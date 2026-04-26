# Rust spike — runtime-bootstrap design memo

> **Status:** draft scaffold, no reproduction page yet. This directory
> exists to capture the design choices a real Rust reproduction page
> will need before it can be authored. There is **no** `index.html`,
> so the deploy workflow does not publish anything from this folder.

## Why this is a separate scaffold (not a feature PR)

A Rust reproduction in the Phase 2 spirit needs *more* than just a
new subdirectory like `pandas-56679/` did. Two design choices block
the first concrete reproduction:

1. **How does the page load Rust?** Pyodide and Ruby.wasm both ship
   a single CDN-hosted runtime + stdlib bundle that the browser can
   instantiate without any per-bug compilation. Rust does not — every
   reproduction is its own crate compiled to its own
   `wasm32-unknown-unknown` (or `wasm32-wasi`) artefact.
2. **Where does the compilation happen?** Either (a) commit the
   prebuilt `.wasm` next to `repro.ts` (treating it as a generated
   artefact tracked through Sapling), or (b) extend the
   `deploy-docs` workflow to install a Rust toolchain and run
   `wasm-pack build` on push.

Picking one of these is a load-bearing scope decision — it changes
the contributor experience, the CI cost, and the size of the
deployed Pages artefact. It deserves its own ADR rather than
landing as a side effect of the first concrete bug-reproduction PR.

## Candidate Rust reproductions

These are pure-Rust upstream bugs whose reproduction surface fits
the WASM cell shape (no system calls, no native deps beyond
`std`). They are *candidates*, not commitments:

- **`regex` crate** — pathological-input pattern that triggers
  exponential blow-up on a specific build. Pure Rust, single-line
  call.
- **`serde_json` crate** — deserialisation edge case for f64 ±0.0
  / NaN. Pure Rust, deterministic.
- **`std::num::ParseFloatError`** — historical edge case in
  `f64::from_str` for subnormals. Stdlib only.

A real PR following this scaffold should pick exactly one and link
the upstream issue.

## Path forward

1. **Open an ADR** documenting the choice between (a) committed
   prebuilt `.wasm` artefacts and (b) Rust toolchain in
   `deploy-docs`. (This work is not in scope for the present PR.)
2. **Pick one of the candidate bugs above**, confirm it reproduces
   on the chosen toolchain version, and write `repro.rs` /
   `Cargo.toml` / `index.html` / `repro.ts` against the agreed
   loader pattern.
3. **Replace this `rust-spike/` folder** with the chosen
   `rust-<crate>-<issue>/` directory.

## Why land this scaffold at all

Until this directory exists in the tree the work is invisible — the
project board has nothing to point a future contributor at, and the
"Phase 2 multi-language" status is harder to reason about. Landing
the scaffold + memo creates a single anchor point that the ADR and
the eventual feature PR can both reference.
