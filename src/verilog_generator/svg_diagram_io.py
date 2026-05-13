from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from .model import AlgorithmBlock, AlgorithmConnection, Design


def import_svg(path: str | Path) -> Design:
    root = ET.parse(path).getroot()
    blocks: list[AlgorithmBlock] = []
    connections: list[AlgorithmConnection] = []

    for elem in root.iter():
        kind = _attr(elem, "data-kind")
        if kind == "block":
            blocks.append(
                AlgorithmBlock(
                    id=_attr(elem, "id") or _attr(elem, "data-name"),
                    name=_attr(elem, "data-name") or _attr(elem, "id"),
                    block_type=_attr(elem, "data-block-type") or _attr(elem, "data-type") or _attr(elem, "data-name"),
                    hierarchy=_attr(elem, "data-hierarchy") or "top",
                )
            )
        elif kind == "connection":
            connections.append(
                AlgorithmConnection(
                    signal=_attr(elem, "data-signal"),
                    source_block=_attr(elem, "data-source-block"),
                    source_port=_attr(elem, "data-source-port"),
                    target_block=_attr(elem, "data-target-block"),
                    target_port=_attr(elem, "data-target-port"),
                    hierarchy=_attr(elem, "data-hierarchy") or None,
                )
            )

    # Text fallback for simple exported/custom SVGs:
    # block:FIR:fir0:top.u_dsp
    # conn:sample_in:input.sample->fir0.din:top.u_dsp
    text_items = ["".join(elem.itertext()).strip() for elem in root.iter() if _strip_ns(elem.tag) == "text"]
    for text in text_items:
        block = _parse_block_text(text)
        if block and block.name not in {b.name for b in blocks}:
            blocks.append(block)
        conn = _parse_conn_text(text)
        if conn and conn.signal not in {c.signal for c in connections}:
            connections.append(conn)

    return Design(algorithm_blocks=blocks, algorithm_connections=connections)


def _attr(elem: ET.Element, name: str) -> str:
    return (elem.attrib.get(name) or "").strip()


def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _parse_block_text(text: str) -> AlgorithmBlock | None:
    match = re.match(r"^block:(?P<type>[^:]+):(?P<name>[^:]+)(:(?P<hier>.+))?$", text)
    if not match:
        return None
    name = match.group("name").strip()
    return AlgorithmBlock(
        id=name,
        name=name,
        block_type=match.group("type").strip(),
        hierarchy=(match.group("hier") or "top").strip(),
    )


def _parse_conn_text(text: str) -> AlgorithmConnection | None:
    match = re.match(r"^conn:(?P<sig>[^:]+):(?P<src>[^.]+)\.(?P<srcp>[^-]+)->(?P<tgt>[^.]+)\.(?P<tgtp>[^:]+)(:(?P<hier>.+))?$", text)
    if not match:
        return None
    return AlgorithmConnection(
        signal=match.group("sig").strip(),
        source_block=match.group("src").strip(),
        source_port=match.group("srcp").strip(),
        target_block=match.group("tgt").strip(),
        target_port=match.group("tgtp").strip(),
        hierarchy=(match.group("hier") or "").strip() or None,
    )

