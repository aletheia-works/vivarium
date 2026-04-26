# PHP spike — runtime-bootstrap design memo

> **Status:** draft scaffold, no reproduction page yet. This directory
> exists to capture the design choices a real PHP reproduction page
> will need before it can be authored. There is **no** `index.html`,
> so the deploy workflow does not publish anything from this folder.

## Why this is a separate scaffold (not a feature PR)

Unlike Rust, PHP *does* have a single CDN-hosted runtime + stdlib
bundle that fits the Pyodide / Ruby.wasm shape closely:
[`seanmorris/php-wasm`](https://github.com/seanmorris/php-wasm)
publishes [`php-wasm`](https://www.npmjs.com/package/php-wasm) on
npm with an ESM browser entry, and it loads via:

```js
const { PhpWeb } = await import("https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs");
const php = new PhpWeb();
const out = await php.run("<?php echo PHP_VERSION;");
```

So a PHP page can in principle slot in next to the Pyodide and
Ruby.wasm pages with very similar plumbing. What's missing for a
reproduction PR is two pieces of *content*:

1. **Which PHP version does the bundled `php-wasm` actually ship?**
   The npm package's PHP version is not always pinned to its own
   semver — it depends on the upstream php-wasm build. Without
   confirming it in-browser, we can't tell which PHP-bug reports
   reproduce and which ones are already fixed.
2. **Which upstream bug?** Phase 1 picked candidates from a research
   pass against a *known* runtime version. The same selection
   criteria (3–10 line repro, boolean verdict, no FFI / no I/O) need
   to be applied against the confirmed php-wasm PHP version, not
   against PHP-in-general.

Both pieces are well-bounded but require a verification round that
has not been done yet.

## Candidate PHP reproductions to evaluate

These are pure-PHP standard-library bugs whose surface fits the WASM
cell shape (no Apache / no PDO drivers / no \\* extensions):

- **`http_build_query` deep-structure stack overflow** —
  [GH-20583](https://github.com/php/php-src/issues/20583). Tiny
  reproduction (one nested array literal). Status: fixed in 8.3.x;
  reproduces only on older bundled PHPs.
- **`SplFixedArray` reference deserialisation** —
  [GH-20614](https://github.com/php/php-src/issues/20614). Pure
  stdlib, deterministic.
- **`array_merge` null-deref / overflow** — recent
  [GHSA-h96m-rvf9-jgm2](https://github.com/php/php-src/security/advisories/GHSA-h96m-rvf9-jgm2)
  (CVE-2025-14178). Security-flavoured demo.

A real PR following this scaffold should pick exactly one and link
the upstream issue.

## Path forward

1. **Verify `PHP_VERSION` in the live bundle** — write a tiny
   smoke page that loads php-wasm and reports the version string
   to the verdict envelope. (One-page, can land independently.)
2. **Pick one candidate bug above** that reproduces on the
   confirmed bundled version.
3. **Replace this `php-spike/` folder** with the chosen
   `php-<issue>/` directory, following the loader pattern from
   `_shared/loader.ts` (Pyodide) and `_shared/ruby_loader.ts`
   (Ruby.wasm).

## Why land this scaffold at all

Same rationale as the [`rust-spike/`](../rust-spike/) sibling: until
the directory exists, the Phase 2 PHP work is invisible to the
project board, and design discussion has nowhere natural to live.
Landing the scaffold + memo creates a single anchor for the version
verification + bug selection rounds to follow.
