from __future__ import annotations

import re
from typing import Any

from .model import Connection, Design, Diagnostic, Instance, Net


SPECIAL_INPUTS = {"input", "in", "source"}
SPECIAL_OUTPUTS = {"output", "out", "sink"}


def merge_designs(*designs: Design) -> Design:
    out = Design()
    for design in designs:
        out.modules.extend(design.modules)
        out.algorithm_blocks.extend(design.algorithm_blocks)
        out.algorithm_connections.extend(design.algorithm_connections)
        out.signal_attributes.extend(design.signal_attributes)
        out.block_mappings.extend(design.block_mappings)
        out.port_mappings.extend(design.port_mappings)
        out.instances.extend(design.instances)
        out.nets.extend(design.nets)
        out.connections.extend(design.connections)
        out.diagnostics.extend(design.diagnostics)

    _derive_instances(out)
    _derive_nets_and_connections(out)
    return out


def _derive_instances(design: Design) -> None:
    existing = {(i.hierarchy, i.name) for i in design.instances}
    mappings = {m.block_type: m for m in design.block_mappings}
    if not mappings:
        return
    for block in design.algorithm_blocks:
        mapping = mappings.get(block.block_type)
        if not mapping:
            design.diagnostics.append(Diagnostic(level="ERROR", message=f"missing block mapping for {block.block_type}", context={"block": block.name}))
            continue
        name = _instance_name(mapping.instance_prefix, block.name)
        if (block.hierarchy, name) in existing:
            continue
        params = _resolve_parameter_overrides(design, block.name, mapping.parameter_overrides)
        design.instances.append(Instance(name=name, module=mapping.module, hierarchy=block.hierarchy, block=block.name, block_type=block.block_type, parameters=params))
        existing.add((block.hierarchy, name))


def _derive_nets_and_connections(design: Design) -> None:
    attrs = {a.signal: a for a in design.signal_attributes}
    blocks = {b.name: b for b in design.algorithm_blocks}
    instances_by_block = {i.block: i for i in design.instances if i.block}
    if design.algorithm_blocks and not instances_by_block:
        return
    nets = {(n.hierarchy, n.name): n for n in design.nets}
    connections = {(c.hierarchy, c.instance, c.port, c.net) for c in design.connections}

    for conn in design.algorithm_connections:
        hierarchy = conn.hierarchy or _conn_hierarchy(conn, blocks)
        attr = attrs.get(conn.signal)
        if not attr:
            design.diagnostics.append(Diagnostic(level="ERROR", message=f"missing fixed signal attribute for {conn.signal}", context={"signal": conn.signal}))
            continue
        key = (hierarchy, conn.signal)
        if key not in nets:
            nets[key] = Net(
                name=conn.signal,
                hierarchy=hierarchy,
                width=attr.width,
                signed=attr.signed,
                frac_width=attr.frac_width,
                fixed_format=attr.fixed_format,
            )
        net = nets[key]
        if conn.source_block.lower() in SPECIAL_INPUTS:
            net.port_direction = "input"
        if conn.target_block.lower() in SPECIAL_OUTPUTS:
            net.port_direction = "output"

        for block_name, port_name, endpoint_kind in [
            (conn.source_block, conn.source_port, "source"),
            (conn.target_block, conn.target_port, "target"),
        ]:
            if block_name.lower() in SPECIAL_INPUTS | SPECIAL_OUTPUTS:
                continue
            inst = instances_by_block.get(block_name)
            block = blocks.get(block_name)
            if not inst or not block:
                design.diagnostics.append(Diagnostic(level="ERROR", message=f"missing instance for diagram block {block_name}", context={"signal": conn.signal}))
                continue
            mapped_port = _map_port(design, block.block_type, inst.module, port_name)
            ckey = (inst.hierarchy, inst.name, mapped_port, conn.signal)
            if ckey not in connections:
                design.connections.append(Connection(instance=inst.name, port=mapped_port, net=conn.signal, hierarchy=inst.hierarchy))
                connections.add(ckey)

    design.nets = list(nets.values())


def _conn_hierarchy(conn: Any, blocks: dict[str, Any]) -> str:
    for name in [conn.target_block, conn.source_block]:
        block = blocks.get(name)
        if block:
            return block.hierarchy
    return "top"


def _instance_name(prefix: str, block_name: str) -> str:
    if block_name.startswith(prefix):
        return _sanitize(block_name)
    return _sanitize(f"{prefix}{block_name}")


def _sanitize(text: str) -> str:
    text = re.sub(r"\W+", "_", text.strip())
    if re.match(r"^\d", text):
        text = f"_{text}"
    return text


def _map_port(design: Design, block_type: str, module: str, port: str) -> str:
    for mapping in design.port_mappings:
        if mapping.block_type == block_type and (mapping.module is None or mapping.module == module):
            return mapping.ports.get(port, port)
    return port


def _resolve_parameter_overrides(design: Design, block_name: str, overrides: dict[str, Any]) -> dict[str, Any]:
    resolved = {}
    for name, value in overrides.items():
        if isinstance(value, str):
            resolved[name] = _resolve_placeholder(design, block_name, value)
        else:
            resolved[name] = value
    return resolved


def _resolve_placeholder(design: Design, block_name: str, value: str) -> Any:
    match = re.fullmatch(r"\{signal_(width|frac_width):([^}]+)\}", value.strip())
    if not match:
        return value
    kind, port = match.groups()
    signal = _find_signal_for_block_port(design, block_name, port)
    if not signal:
        return value
    attr = next((a for a in design.signal_attributes if a.signal == signal), None)
    if not attr:
        return value
    return attr.width if kind == "width" else attr.frac_width


def _find_signal_for_block_port(design: Design, block_name: str, port: str) -> str | None:
    for conn in design.algorithm_connections:
        if conn.target_block == block_name and conn.target_port == port:
            return conn.signal
        if conn.source_block == block_name and conn.source_port == port:
            return conn.signal
    return None
