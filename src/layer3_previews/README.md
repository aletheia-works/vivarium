# Layer 3 — Live previews

> A pull request's whole application, backend included, running in the
> cloud at that pull request's commit, for a reviewer to use in a browser.

---

## What routes here

A change whose effect only shows in the running application: a backend
behaviour a reviewer checks by using the UI, or a UI change that needs a
live backend behind it. Screenshots and test output describe such a change;
a preview lets the reviewer try it.

## What does **not** route here

- A change the reviewer can judge from the diff and the tests alone, such
  as documentation or a refactor.
- A change whose effect does not show through the application, such as how
  files are laid out on a network share.
- A bug that reproduces in the browser or in a container on the reader's
  own machine → Layer 1 or Layer 2.

## How a preview runs

Each preview is a [Lambda MicroVM](https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html)
image built from the pull request's commit, behind a public function URL.
The link carries a key; without it the URL answers 403. The MicroVM starts
on the first request, suspends after five minutes without traffic, and
resumes on the next one. [`infra/aws/`](../../infra/aws/README.md) has the
details, the cost, and how to read a preview's link.

A reader needs only a browser, so a preview clears the bar this layer has
always had: a reader on an ordinary machine can reproduce and check the
result. That bar is why `rr` record-replay, which needs Linux on x86_64
with an exposed PMU, was removed from this layer.

## Recipes

One directory per pull request, named `<project>-<pull>`:

```text
src/layer3_previews/
└── motioneye-3506/
    ├── preview.json   # repository, pull, commit
    └── README.md      # what the pull request changes and how to check it
```

`preview.json`:

```json
{
  "repository": "motioneye-project/motioneye",
  "pull": 3506,
  "commit": "b1a4692397339c75a5d1ce93fa017612c0e80214"
}
```

`commit` is a full SHA, so a preview shows exactly one state of the pull
request. A new push to the pull request is a new commit here.

Adding a directory adds a preview, and removing it removes the preview: a
pull request to Vivarium that changes a recipe gets an OpenTofu plan, and
merging it applies the plan. Only motionEye has an image template today
([`infra/aws/motioneye/`](../../infra/aws/motioneye/)).

Preview recipes are not in the recipes index (`recipes.json`) or the
gallery yet.
