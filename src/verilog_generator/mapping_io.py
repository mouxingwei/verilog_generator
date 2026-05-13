from __future__ import annotations

from pathlib import Path

from .model import BlockMapping, Design, PortMapping
from .yaml_io import read_yaml


def import_mappings(block_mapping: str | Path, port_mapping: str | Path | None = None) -> Design:
    block_data = read_yaml(block_mapping)
    blocks = [BlockMapping(**item) for item in block_data.get("block_mappings", [])]
    ports: list[PortMapping] = []
    if port_mapping:
        port_data = read_yaml(port_mapping)
        ports = [PortMapping(**item) for item in port_data.get("port_mappings", [])]
    return Design(block_mappings=blocks, port_mappings=ports)

