from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .model import Design, design_from_dict, model_to_dict


def read_yaml(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def write_yaml(data: dict[str, Any] | Design, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = model_to_dict(data) if isinstance(data, Design) else data
    with path.open("w", encoding="utf-8", newline="\n") as f:
        yaml.safe_dump(payload, f, sort_keys=False, allow_unicode=True)


def read_design(path: str | Path) -> Design:
    return design_from_dict(read_yaml(path))


def write_design(design: Design, path: str | Path) -> None:
    write_yaml(design, path)

