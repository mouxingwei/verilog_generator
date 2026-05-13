import pytest

from verilog_generator.fixed_point import parse_fixed_format


def test_parse_fixed_format():
    attr = parse_fixed_format("sig", "s(11,1)")
    assert attr.signed is True
    assert attr.width == 11
    assert attr.frac_width == 1


def test_parse_fixed_format_rejects_bad_value():
    with pytest.raises(ValueError):
        parse_fixed_format("sig", "q(11,1)")

