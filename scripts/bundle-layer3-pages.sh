#!/usr/bin/env bash
set -euo pipefail

dest="docs/doc_build/repro"
index="docs/site/public/api/recipes.json"
pages_prefix="https://${GITHUB_REPOSITORY_OWNER}.github.io/${GITHUB_REPOSITORY##*/}/repro/"
for project in $(jq -r '.recipes[] | select(.layer == 3) | .project' "$index" | sort -u); do
  mkdir -p "$dest/$project"
  for shared in _shared _assets; do
    if [ -d "src/layer1_wasm/$shared" ]; then
      echo "Staging Layer 1 ${shared}/ for Layer 3 project: ${dest}/${project}/${shared}"
      cp -R "src/layer1_wasm/$shared" "$dest/$project/$shared"
    fi
  done
done
jq -r '.recipes[] | select(.layer == 3) | "\(.slug) \(.page_url)"' "$index" |
  while read -r slug page_url; do
    page="src/layer3_previews/${slug}/index.html"
    if [ ! -f "$page" ]; then
      echo "ERROR: ${page} is missing; run the docs build first"
      exit 1
    fi
    rel="${page_url#"${pages_prefix}"}"
    rel="${rel%/}"
    echo "Bundling Layer 3 preview page: ${slug} → ${dest}/${rel}/"
    mkdir -p "$dest/$rel"
    cp "$page" "$dest/$rel/index.html"
  done
