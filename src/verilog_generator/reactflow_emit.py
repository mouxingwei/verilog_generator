from __future__ import annotations

import json
from pathlib import Path

from .model import Design, Instance, Net, Port, model_to_dict


def emit_reactflow(design: Design, path: str | Path) -> None:
    nodes: list[dict] = []
    edges: list[dict] = []
    module_ports = {
        (module.name, port.name): port
        for module in design.modules
        for port in module.ports
    }
    instances = sorted(design.instances, key=lambda i: (i.hierarchy, i.name))
    nets = sorted(design.nets, key=lambda n: (n.hierarchy, n.name))

    for idx, net in enumerate(nets):
        nodes.append(
            {
                "id": _net_id(net),
                "type": "signalNet",
                "position": _net_position(net, idx),
                "data": {
                    "label": net.name,
                    "signal": net.name,
                    "hierarchy": net.hierarchy,
                    "width": net.width,
                    "signed": net.signed,
                    "frac_width": net.frac_width,
                    "fixed_format": net.fixed_format,
                    "port_direction": net.port_direction,
                },
            }
        )

    for idx, inst in enumerate(instances):
        nodes.append(
            {
                "id": _instance_id(inst),
                "type": "moduleInstance",
                "position": _instance_position(idx),
                "data": {
                    "label": inst.name,
                    "module": inst.module,
                    "hierarchy": inst.hierarchy,
                    "block": inst.block,
                    "block_type": inst.block_type,
                    "parameters": inst.parameters,
                    "ports": [
                        model_to_dict(port)
                        for port in sorted(
                            (p for m in design.modules if m.name == inst.module for p in m.ports),
                            key=lambda p: (p.direction, p.name),
                        )
                    ],
                },
            }
        )

    for conn in design.connections:
        inst = _find_instance(instances, conn.hierarchy, conn.instance)
        port = module_ports.get((inst.module, conn.port)) if inst else None
        net = _find_net(nets, conn.hierarchy, conn.net)
        if not inst or not net:
            continue

        instance_id = _instance_id(inst)
        net_id = _net_id(net)
        direction = port.direction if port else "inout"
        source, target = (instance_id, net_id) if direction == "output" else (net_id, instance_id)
        source_handle = conn.port if direction == "output" else "net"
        target_handle = "net" if direction == "output" else conn.port
        edges.append(
            {
                "id": f"{conn.hierarchy}.{conn.instance}.{conn.port}.{conn.net}",
                "source": source,
                "target": target,
                "sourceHandle": source_handle,
                "targetHandle": target_handle,
                "animated": direction == "output",
                "data": {
                    "signal": conn.net,
                    "hierarchy": conn.hierarchy,
                    "instance": conn.instance,
                    "module": inst.module,
                    "port": conn.port,
                    "direction": direction,
                    "port_width": _port_width(port),
                    "net_width": net.width,
                    "fixed_format": net.fixed_format,
                },
            }
        )
    payload = {
        "schemaVersion": "verilog-generator.reactflow.v1",
        "summary": {
            "modules": len(design.modules),
            "instances": len(design.instances),
            "nets": len(design.nets),
            "connections": len(design.connections),
            "diagnostics": len(design.diagnostics),
        },
        "diagnostics": [model_to_dict(d) for d in design.diagnostics],
        "nodes": nodes,
        "edges": edges,
    }
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _instance_id(inst: Instance) -> str:
    return f"instance:{inst.hierarchy}.{inst.name}"


def _net_id(net: Net) -> str:
    return f"net:{net.hierarchy}.{net.name}"


def _instance_position(index: int) -> dict[str, int]:
    return {"x": 360 + 260 * (index % 4), "y": 120 + 180 * (index // 4)}


def _net_position(net: Net, index: int) -> dict[str, int]:
    if net.port_direction == "output":
        return {"x": 980, "y": 92 + index * 96}
    return {"x": 48, "y": 92 + index * 96}


def _find_instance(instances: list[Instance], hierarchy: str, name: str) -> Instance | None:
    return next((inst for inst in instances if inst.hierarchy == hierarchy and inst.name == name), None)


def _find_net(nets: list[Net], hierarchy: str, name: str) -> Net | None:
    return next((net for net in nets if net.hierarchy == hierarchy and net.name == name), None)


def _port_width(port: Port | None) -> int | str | None:
    if port is None:
        return None
    return port.width if port.width is not None else port.width_expr
