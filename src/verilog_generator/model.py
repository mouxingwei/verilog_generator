from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Direction = Literal["input", "output", "inout"]


class Parameter(BaseModel):
    name: str
    default: Any | None = None


class Port(BaseModel):
    name: str
    direction: Direction
    width: int | None = None
    width_expr: str | None = None
    signed: bool = False
    required: bool = True


class Module(BaseModel):
    name: str
    source: str | None = None
    parameters: list[Parameter] = Field(default_factory=list)
    ports: list[Port] = Field(default_factory=list)


class AlgorithmBlock(BaseModel):
    id: str
    name: str
    block_type: str
    hierarchy: str = "top"


class AlgorithmConnection(BaseModel):
    signal: str
    source_block: str
    source_port: str
    target_block: str
    target_port: str
    hierarchy: str | None = None


class SignalAttribute(BaseModel):
    signal: str
    fixed_format: str
    signed: bool
    width: int
    frac_width: int
    description: str | None = None


class BlockMapping(BaseModel):
    block_type: str
    module: str
    instance_prefix: str = "u_"
    parameter_overrides: dict[str, Any] = Field(default_factory=dict)


class PortMapping(BaseModel):
    block_type: str
    module: str | None = None
    ports: dict[str, str] = Field(default_factory=dict)


class Instance(BaseModel):
    name: str
    module: str
    hierarchy: str = "top"
    block: str | None = None
    block_type: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)


class Net(BaseModel):
    name: str
    hierarchy: str = "top"
    width: int = 1
    signed: bool = False
    frac_width: int = 0
    fixed_format: str | None = None
    port_direction: Direction | None = None


class Connection(BaseModel):
    instance: str
    port: str
    net: str
    hierarchy: str = "top"


class Diagnostic(BaseModel):
    level: Literal["ERROR", "WARNING", "INFO"]
    message: str
    context: dict[str, Any] = Field(default_factory=dict)


class Design(BaseModel):
    modules: list[Module] = Field(default_factory=list)
    algorithm_blocks: list[AlgorithmBlock] = Field(default_factory=list)
    algorithm_connections: list[AlgorithmConnection] = Field(default_factory=list)
    signal_attributes: list[SignalAttribute] = Field(default_factory=list)
    block_mappings: list[BlockMapping] = Field(default_factory=list)
    port_mappings: list[PortMapping] = Field(default_factory=list)
    instances: list[Instance] = Field(default_factory=list)
    nets: list[Net] = Field(default_factory=list)
    connections: list[Connection] = Field(default_factory=list)
    diagnostics: list[Diagnostic] = Field(default_factory=list)


def model_to_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_none=True)
    return model.dict(exclude_none=True)


def design_from_dict(data: dict[str, Any] | None) -> Design:
    data = data or {}
    if hasattr(Design, "model_validate"):
        return Design.model_validate(data)
    return Design.parse_obj(data)

