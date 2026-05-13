from __future__ import annotations

import re

from .model import SignalAttribute


FIXED_RE = re.compile(r"^\s*([suSU])\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*$")


def parse_fixed_format(signal: str, fixed_format: str, description: str | None = None) -> SignalAttribute:
    match = FIXED_RE.match(fixed_format)
    if not match:
        raise ValueError(f"invalid fixed-point format for {signal}: {fixed_format!r}")
    kind, width_text, frac_text = match.groups()
    width = int(width_text)
    frac_width = int(frac_text)
    if width <= 0:
        raise ValueError(f"width must be positive for {signal}: {fixed_format}")
    if frac_width < 0 or frac_width > width:
        raise ValueError(f"frac_width must be between 0 and width for {signal}: {fixed_format}")
    return SignalAttribute(
        signal=signal,
        fixed_format=f"{kind.lower()}({width},{frac_width})",
        signed=kind.lower() == "s",
        width=width,
        frac_width=frac_width,
        description=description or None,
    )

