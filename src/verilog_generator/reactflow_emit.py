from __future__ import annotations

import json
from pathlib import Path

from .model import Design


def emit_reactflow(design: Design, path: str | Path) -> None:
    nodes = []
    edges = []
    for idx, inst in enumerate(sorted(design.instances, key=lambda i: (i.hierarchy, i.name))):
        nodes.append(
            {
                "id": f"{inst.hierarchy}.{inst.name}",
                "type": "moduleInstance",
                "position": {"x": 180 * (idx % 5), "y": 140 * (idx // 5)},
                "data": {"label": inst.name, "module": inst.module, "hierarchy": inst.hierarchy},
            }
        )
    for conn in design.connections:
        edges.append(
            {
                "id": f"{conn.hierarchy}.{conn.instance}.{conn.port}.{conn.net}",
                "source": conn.net,
                "target": f"{conn.hierarchy}.{conn.instance}",
                "targetHandle": conn.port,
                "data": {"signal": conn.net, "hierarchy": conn.hierarchy},
            }
        )
    payload = {"nodes": nodes, "edges": edges}
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

