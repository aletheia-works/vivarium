#!/usr/bin/env bash
# Vivarium Layer 2 reproduction — {{TITLE}}.
#
# Upstream: {{ISSUE_URL}}
#
# Verdict semantics:
#   exit 0 -> reproduced — the bug is observed.
#   exit 1 -> unreproduced — the bug is not observed (fix has
#                            landed, or the environment differs).
#   exit 2 -> error — the reproduction could not run, so no verdict
#                     is recorded.
# Before exit 0 or 1, print a matching verdict=reproduced or
# verdict=unreproduced line on stderr; CI records no verdict without it.

set -uo pipefail

# TODO(replace this stub): write the actual reproduction. Probe the
# upstream behaviour, set `reproduced=true|false` based on the
# observation, and emit a JSON line summarising what was checked.
# Keep the script deterministic — no timing-dependent checks, no
# network unless absolutely required.

reproduced=false

cat <<JSON
{
  "reproduced": ${reproduced}
}
JSON

if [ "${reproduced}" = "true" ]; then
  echo "verdict=reproduced — TODO short description ({{ISSUE_URL}})" >&2
  exit 0
fi

echo "verdict=unreproduced — TODO short description" >&2
exit 1
