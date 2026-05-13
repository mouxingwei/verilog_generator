from __future__ import annotations

import re
from typing import Any

from .model import Instance, Module, Port


def sanitize_identifier(name: str) -> str:
    cleaned = re.sub(r"\W+", "_", name.strip())
    if not cleaned:
        cleaned = "unnamed"
    if re.match(r"^\d", cleaned):
        cleaned = f"_{cleaned}"
    return cleaned


def module_name_for_hierarchy(hierarchy: str) -> str:
    return sanitize_identifier(hierarchy.replace(".", "_"))


def file_name_for_hierarchy(hierarchy: str) -> str:
    return f"{module_name_for_hierarchy(hierarchy)}.v"


def resolve_port_width(port: Port, instance: Instance, module: Module) -> int | None:
    if port.width:
        return port.width
    if not port.width_expr:
        return 1
    if ":" in port.width_expr:
        msb, lsb = [part.strip() for part in port.width_expr.split(":", 1)]
        try:
            return abs(_eval_int(msb, instance, module) - _eval_int(lsb, instance, module)) + 1
        except Exception:
            return None
    try:
        return _eval_int(port.width_expr, instance, module)
    except Exception:
        return None


def _eval_int(expr: str, instance: Instance, module: Module) -> int:
    params: dict[str, Any] = {p.name: p.default for p in module.parameters}
    params.update(instance.parameters)
    resolved = expr
    for name, value in params.items():
        resolved = re.sub(rf"\b{re.escape(name)}\b", str(value), resolved)
    if not re.fullmatch(r"[0-9+\-*/ ()]+", resolved):
        raise ValueError(f"cannot evaluate width expression: {expr}")
    return int(eval(resolved, {"__builtins__": {}}, {}))


def width_range(width: int) -> str:
    return "" if width == 1 else f" [{width - 1}:0]"

