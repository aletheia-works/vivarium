# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
"""Vivarium Layer 1 — sympy#29413 fix-candidate verification (native).

Sibling of ``repro.py``. Where ``repro.py`` runs the reproduction
against **one** sympy build (the canonical bug-still-present pin),
this orchestrator runs it against **two** builds in side-by-side
ephemeral venvs:

1. ``baseline`` — ``sympy==1.14.0`` from PyPI (the build under which
   the bug was confirmed; should still ``reproduced``).
2. ``fix-candidate`` — the fork+branch carrying the proposed fix
   (currently ``JamBalaya56562/sympy@claude/fix-sympy-29413-8Lyc6``);
   should flip to ``unreproduced`` by returning ``None`` for
   ``ask(a + 1 > a, Q.extended_real(a))``.

The output is a single JSON envelope on stdout listing both verdicts,
so a maintainer can see the **before / after** of the candidate fix
in one invocation. The exit code is ``0`` iff every variant matches
its expected verdict (baseline reproduces AND fix-candidate does not);
anything else is treated as a regression.

This script does **not** ship a Vivarium Contract v1 surface — it is a
maintainer convenience tool. The canonical Contract v1 verdict for
this recipe is the live one published by ``index.html`` (and mirrored
by ``repro.py`` for native runs against a single build). Once an
upstream-merged release lands on PyPI, bump the pin in ``repro.py`` /
``repro.ts`` and delete this script.

Run:

    mise install                                                          # one-time
    mise exec uv -- uv run src/layer1_wasm/sympy-29413/verify_fix.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from datetime import datetime, timezone

VARIANTS: list[dict[str, str]] = [
    {
        "name": "baseline",
        "label": "PyPI sympy==1.14.0 (pre-fix)",
        "spec": "sympy==1.14.0",
        "expected": "reproduced",
    },
    {
        "name": "fix-candidate",
        "label": "JamBalaya56562/sympy@claude/fix-sympy-29413-8Lyc6",
        "spec": (
            "sympy @ git+https://github.com/JamBalaya56562/sympy"
            "@claude/fix-sympy-29413-8Lyc6"
        ),
        "expected": "unreproduced",
    },
]

# Per-variant probe; runs in a uv-managed ephemeral venv that has the
# variant's sympy spec installed. Mirrors repro.py's ask() call so
# the per-variant verdicts are directly comparable.
PROBE = textwrap.dedent(
    """
    import json, sys
    import sympy
    from sympy import Q, Symbol, ask

    a = Symbol("a")
    result_value = ask(a + 1 > a, Q.extended_real(a))

    print(json.dumps({
        "sympy_version": sympy.__version__,
        "python_version": sys.version.split()[0],
        "ask_result": repr(result_value),
        "reproduced": result_value is True,
    }))
    """
).strip()


def run_variant(variant: dict[str, str]) -> dict[str, object]:
    """Run the probe inside an ephemeral uv venv that has *spec* installed."""
    proc = subprocess.run(
        [
            "uv",
            "run",
            "--no-project",
            "--python",
            "3.13",
            "--with",
            variant["spec"],
            "--",
            "python",
            "-c",
            PROBE,
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    record: dict[str, object] = {
        "name": variant["name"],
        "label": variant["label"],
        "spec": variant["spec"],
        "expected": variant["expected"],
        "returncode": proc.returncode,
        "stderr_tail": proc.stderr[-400:] if proc.stderr else "",
    }

    if proc.returncode != 0:
        record["verdict"] = "unreproduced"
        record["crashed"] = True
        record["probe_output"] = None
        record["message"] = (
            f"uv run failed (exit {proc.returncode}); see stderr_tail."
        )
        return record

    try:
        probe = json.loads(proc.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError) as e:
        record["verdict"] = "unreproduced"
        record["crashed"] = True
        record["probe_output"] = None
        record["message"] = f"probe stdout was not JSON: {e}"
        return record

    reproduced = bool(probe.get("reproduced"))
    record["probe_output"] = probe
    record["crashed"] = False
    record["verdict"] = "reproduced" if reproduced else "unreproduced"
    record["message"] = (
        f"ask returned {probe.get('ask_result')!s} under sympy "
        f"{probe.get('sympy_version')!s}"
    )
    return record


def main() -> int:
    started_at = datetime.now(timezone.utc)
    runs = [run_variant(v) for v in VARIANTS]
    finished_at = datetime.now(timezone.utc)

    baseline = next(r for r in runs if r["name"] == "baseline")
    fix = next(r for r in runs if r["name"] == "fix-candidate")

    ok = (
        baseline["verdict"] == baseline["expected"]
        and fix["verdict"] == fix["expected"]
    )

    envelope = {
        "tool": "sympy-29413/verify_fix.py",
        "schema_version": 1,
        "started_at": started_at.isoformat().replace("+00:00", "Z"),
        "finished_at": finished_at.isoformat().replace("+00:00", "Z"),
        "ok": ok,
        "verdict": (
            "fix-candidate-confirmed"
            if ok
            else "fix-candidate-rejected"
        ),
        "summary": (
            f"baseline {baseline['verdict']} (expected {baseline['expected']}), "
            f"fix-candidate {fix['verdict']} (expected {fix['expected']})"
        ),
        "runs": runs,
    }

    print(json.dumps(envelope, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
