from __future__ import annotations

import subprocess
from pathlib import Path


def syntax_check(paths: list[str | Path]) -> subprocess.CompletedProcess[str]:
    cmd = ["iverilog", "-g2005", "-t", "null", "-o", "build/syntax_check.out", *[str(p) for p in paths]]
    Path("build").mkdir(exist_ok=True)
    return subprocess.run(cmd, text=True, capture_output=True)

