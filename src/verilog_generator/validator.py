from __future__ import annotations

from .model import Design, Diagnostic
from .verilog_util import resolve_port_width


def validate_design(design: Design) -> list[Diagnostic]:
    diagnostics = list(design.diagnostics)
    modules = {m.name: m for m in design.modules}
    instances = {(i.hierarchy, i.name): i for i in design.instances}
    nets = {(n.hierarchy, n.name): n for n in design.nets}

    for inst in design.instances:
        if inst.module not in modules:
            diagnostics.append(Diagnostic(level="ERROR", message=f"instance {inst.name} references missing module {inst.module}", context={"instance": inst.name}))
        else:
            module = modules[inst.module]
            module_params = {p.name for p in module.parameters}
            for pname in inst.parameters:
                if pname not in module_params:
                    diagnostics.append(Diagnostic(level="ERROR", message=f"unknown parameter {pname} on module {module.name}", context={"instance": inst.name}))

    drivers: dict[tuple[str, str], list[str]] = {}
    for conn in design.connections:
        inst = instances.get((conn.hierarchy, conn.instance))
        if not inst:
            diagnostics.append(Diagnostic(level="ERROR", message=f"connection references missing instance {conn.instance}", context=conn_context(conn)))
            continue
        module = modules.get(inst.module)
        if not module:
            continue
        port = next((p for p in module.ports if p.name == conn.port), None)
        if not port:
            diagnostics.append(Diagnostic(level="ERROR", message=f"connection references missing port {conn.port}", context=conn_context(conn)))
            continue
        net = nets.get((conn.hierarchy, conn.net))
        if not net:
            diagnostics.append(Diagnostic(level="ERROR", message=f"connection references missing net {conn.net}", context=conn_context(conn)))
            continue
        pwidth = resolve_port_width(port, inst, module)
        if pwidth and pwidth != net.width:
            diagnostics.append(
                Diagnostic(
                    level="WARNING",
                    message=f"auto width adaptation required for {conn.instance}.{conn.port}: net {net.width}, port {pwidth}",
                    context={**conn_context(conn), "net_width": net.width, "port_width": pwidth},
                )
            )
        if port.direction in {"output", "inout"}:
            drivers.setdefault((conn.hierarchy, conn.net), []).append(f"{conn.instance}.{conn.port}")

    connected = {(c.hierarchy, c.instance, c.port) for c in design.connections}
    for inst in design.instances:
        module = modules.get(inst.module)
        if not module:
            continue
        for port in module.ports:
            if port.required and port.direction in {"input", "inout"} and (inst.hierarchy, inst.name, port.name) not in connected:
                diagnostics.append(
                    Diagnostic(
                        level="ERROR",
                        message=f"required input port {inst.name}.{port.name} is unconnected",
                        context={"hierarchy": inst.hierarchy, "instance": inst.name, "port": port.name},
                    )
                )

    for (hierarchy, net), source_ports in drivers.items():
        if len(source_ports) > 1:
            diagnostics.append(Diagnostic(level="ERROR", message=f"net {net} has multiple drivers", context={"hierarchy": hierarchy, "drivers": source_ports}))

    for attr in design.signal_attributes:
        if attr.width <= 0 or attr.frac_width < 0 or attr.frac_width > attr.width:
            diagnostics.append(Diagnostic(level="ERROR", message=f"invalid fixed-point format for {attr.signal}", context={"fixed_format": attr.fixed_format}))

    return diagnostics


def has_errors(diagnostics: list[Diagnostic]) -> bool:
    return any(d.level == "ERROR" for d in diagnostics)


def conn_context(conn) -> dict[str, str]:
    return {"hierarchy": conn.hierarchy, "instance": conn.instance, "port": conn.port, "net": conn.net}
