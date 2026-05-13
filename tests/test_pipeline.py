from pathlib import Path

from openpyxl import Workbook

from verilog_generator.excel_io import import_fixed_signals
from verilog_generator.ir_merge import merge_designs
from verilog_generator.mapping_io import import_mappings
from verilog_generator.rtl_extract import import_verilog
from verilog_generator.svg_diagram_io import import_svg
from verilog_generator.syntax_check import syntax_check
from verilog_generator.validator import has_errors, validate_design
from verilog_generator.verilog_emit import emit_verilog


def make_fixed_signals(path: Path):
    wb = Workbook()
    ws = wb.active
    ws.title = "fixed_signals"
    ws.append(["signal", "fixed_format", "description"])
    ws.append(["sample_in", "s(11,1)", "input sample"])
    ws.append(["filtered_out", "s(11,1)", "output sample"])
    ws.append(["clk", "u(1,0)", "clock"])
    ws.append(["rst_n", "u(1,0)", "reset"])
    wb.save(path)


def test_end_to_end_generation(tmp_path):
    signals = tmp_path / "fixed_signals.xlsx"
    make_fixed_signals(signals)

    design = merge_designs(
        import_verilog([Path("examples/rtl/fir_filter.v")]),
        merge_designs(import_svg(Path("examples/algo/algo.svg")), import_fixed_signals(signals)),
        import_mappings(Path("examples/algo/block_mapping.yaml"), Path("examples/algo/port_mapping.yaml")),
    )

    diagnostics = validate_design(design)
    assert not has_errors(diagnostics), diagnostics

    generated = emit_verilog(design, tmp_path / "generated")
    generated_names = {p.name for p in generated}
    assert "top.v" in generated_names
    assert "top_u_dsp.v" in generated_names

    syntax = syntax_check([*generated, Path("examples/rtl/fir_filter.v")])
    assert syntax.returncode == 0, syntax.stderr
