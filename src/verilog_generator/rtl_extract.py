from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .model import Design, Module, Parameter, Port


def import_verilog(paths: list[str | Path]) -> Design:
    files = [Path(p) for p in paths]
    try:
        modules = _extract_with_pyverilog(files)
        if modules:
            return Design(modules=modules)
    except Exception:
        # Regex fallback keeps the CLI usable for simple Verilog-2005 modules
        # even when pyverilog cannot preprocess a project yet.
        pass
    return Design(modules=_extract_with_regex(files))


def _extract_with_pyverilog(files: list[Path]) -> list[Module]:
    from pyverilog.vparser.ast import Decl, Input, Ioport, Inout, IntConst, ModuleDef, Output, Parameter as AstParameter
    from pyverilog.vparser.parser import parse

    ast, _ = parse([str(p) for p in files])
    modules: list[Module] = []
    for desc in getattr(ast, "description", ast).children():
        if not isinstance(desc, ModuleDef):
            continue
        parameters: list[Parameter] = []
        paramlist = getattr(desc, "paramlist", None)
        if paramlist is not None:
            for child in paramlist.children():
                for node in _flatten_decls(child):
                    if isinstance(node, AstParameter):
                        parameters.append(Parameter(name=node.name, default=_expr_to_str(node.value)))

        ports_by_name: dict[str, Port] = {}
        portlist = getattr(desc, "portlist", None)
        if portlist is not None:
            for port in portlist.ports:
                if isinstance(port, Ioport):
                    decl = port.first
                    if isinstance(decl, (Input, Output, Inout)):
                        ports_by_name[decl.name] = _port_from_decl(decl)

        for item in desc.items:
            for node in _flatten_decls(item):
                if isinstance(node, (Input, Output, Inout)):
                    ports_by_name[node.name] = _port_from_decl(node)

        source = str(files[0]) if len(files) == 1 else None
        modules.append(Module(name=desc.name, source=source, parameters=parameters, ports=list(ports_by_name.values())))
    return modules


def _flatten_decls(node: Any) -> list[Any]:
    try:
        from pyverilog.vparser.ast import Decl
    except Exception:
        Decl = ()  # type: ignore
    if isinstance(node, Decl):
        return list(node.list)
    return [node]


def _port_from_decl(decl: Any) -> Port:
    direction = decl.__class__.__name__.lower()
    width, width_expr = _width_info(getattr(decl, "width", None))
    signed = bool(getattr(decl, "signed", False))
    return Port(name=decl.name, direction=direction, width=width, width_expr=width_expr, signed=signed)


def _width_info(width_node: Any) -> tuple[int | None, str | None]:
    if width_node is None:
        return 1, None
    msb = _expr_to_str(width_node.msb)
    lsb = _expr_to_str(width_node.lsb)
    try:
        return abs(int(msb) - int(lsb)) + 1, None
    except Exception:
        return None, f"{msb}:{lsb}"


def _expr_to_str(node: Any) -> str:
    if node is None:
        return ""
    cls = node.__class__.__name__
    if hasattr(node, "value"):
        return str(node.value)
    if hasattr(node, "name"):
        return str(node.name)
    children = list(node.children()) if hasattr(node, "children") else []
    if len(children) == 1:
        return _expr_to_str(children[0])
    if cls in {"Plus", "Minus", "Times", "Divide"}:
        op = {"Plus": "+", "Minus": "-", "Times": "*", "Divide": "/"}[cls]
        return f"{_expr_to_str(node.left)}{op}{_expr_to_str(node.right)}"
    return str(node)


MODULE_RE = re.compile(r"\bmodule\s+(\w+)\s*(#\s*\((?P<params>.*?)\))?\s*\((?P<ports>.*?)\)\s*;(?P<body>.*?)\bendmodule\b", re.S)
PARAM_RE = re.compile(r"\bparameter\s+(\w+)\s*=\s*([^,\)\n;]+)")
PORT_DECL_RE = re.compile(r"\b(input|output|inout)\b\s*(wire|reg)?\s*(signed)?\s*(\[[^\]]+\])?\s*([^;,\)]+)")


def _extract_with_regex(files: list[Path]) -> list[Module]:
    modules: list[Module] = []
    for path in files:
        text = path.read_text(encoding="utf-8")
        text = re.sub(r"//.*", "", text)
        for match in MODULE_RE.finditer(text):
            name = match.group(1)
            params_text = match.group("params") or ""
            port_text = match.group("ports") or ""
            body = match.group("body") or ""
            parameters = [Parameter(name=p.group(1), default=p.group(2).strip()) for p in PARAM_RE.finditer(params_text)]
            ports: dict[str, Port] = {}
            for decl_text in [port_text, body]:
                for port in _parse_port_decls(decl_text):
                    ports[port.name] = port
            modules.append(Module(name=name, source=str(path), parameters=parameters, ports=list(ports.values())))
    return modules


def _parse_port_decls(text: str) -> list[Port]:
    ports = []
    for match in PORT_DECL_RE.finditer(text):
        direction, _, signed_text, width_text, names_text = match.groups()
        signed = bool(signed_text)
        width, width_expr = _parse_width(width_text)
        for raw_name in names_text.split(","):
            name = raw_name.strip().split("=")[0].strip()
            if name:
                ports.append(Port(name=name, direction=direction, width=width, width_expr=width_expr, signed=signed))
    return ports


def _parse_width(width_text: str | None) -> tuple[int | None, str | None]:
    if not width_text:
        return 1, None
    inner = width_text.strip()[1:-1]
    parts = [p.strip() for p in inner.split(":", 1)]
    if len(parts) != 2:
        return None, inner
    try:
        return abs(int(parts[0]) - int(parts[1])) + 1, None
    except Exception:
        return None, inner
