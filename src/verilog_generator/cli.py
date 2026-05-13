from __future__ import annotations

import glob
from pathlib import Path

import typer

from .excel_io import create_fixed_signal_template, import_fixed_signals
from .ir_merge import merge_designs
from .mapping_io import import_mappings
from .reactflow_emit import emit_reactflow
from .rtl_extract import import_verilog as import_verilog_files
from .svg_diagram_io import import_svg
from .syntax_check import syntax_check as run_syntax_check
from .validator import has_errors, validate_design
from .verilog_emit import emit_verilog
from .yaml_io import read_design, write_design

app = typer.Typer(no_args_is_help=True)


@app.command("import-verilog")
def import_verilog_cmd(paths: list[str], output: Path = typer.Option(..., "--output", "-o")) -> None:
    write_design(import_verilog_files(_expand(paths)), output)


@app.command("import-algo-svg")
def import_algo_svg_cmd(svg: Path, signals: Path = typer.Option(..., "--signals"), output: Path = typer.Option(..., "--output", "-o")) -> None:
    write_design(merge_designs(import_svg(svg), import_fixed_signals(signals)), output)


@app.command("import-mapping")
def import_mapping_cmd(block_mapping: Path, ports: Path | None = typer.Option(None, "--ports"), output: Path = typer.Option(..., "--output", "-o")) -> None:
    write_design(import_mappings(block_mapping, ports), output)


@app.command("merge")
def merge_cmd(inputs: list[Path], output: Path = typer.Option(..., "--output", "-o")) -> None:
    write_design(merge_designs(*[read_design(p) for p in inputs]), output)


@app.command("validate")
def validate_cmd(design: Path) -> None:
    diagnostics = validate_design(read_design(design))
    _print_diagnostics(diagnostics)
    if has_errors(diagnostics):
        raise typer.Exit(1)


@app.command("generate-verilog")
def generate_verilog_cmd(design: Path, output: Path = typer.Option(..., "--output", "-o"), top: str = "top") -> None:
    data = read_design(design)
    diagnostics = validate_design(data)
    _print_diagnostics(diagnostics)
    if has_errors(diagnostics):
        raise typer.Exit(1)
    emit_verilog(data, output, top)


@app.command("syntax-check")
def syntax_check_cmd(paths: list[str]) -> None:
    result = run_syntax_check(_expand(paths))
    if result.stdout:
        typer.echo(result.stdout)
    if result.stderr:
        typer.echo(result.stderr, err=True)
    if result.returncode != 0:
        raise typer.Exit(result.returncode)


@app.command("generate-reactflow")
def generate_reactflow_cmd(design: Path, output: Path = typer.Option(..., "--output", "-o")) -> None:
    emit_reactflow(read_design(design), output)


@app.command("create-fixed-template")
def create_fixed_template_cmd(output: Path = typer.Option(..., "--output", "-o")) -> None:
    create_fixed_signal_template(output)


@app.command("build")
def build_cmd(
    rtl: Path = typer.Option(..., "--rtl"),
    diagram: Path = typer.Option(..., "--diagram"),
    signals: Path = typer.Option(..., "--signals"),
    mapping: Path = typer.Option(..., "--mapping"),
    ports: Path | None = typer.Option(None, "--ports"),
    top: str = typer.Option("top", "--top"),
    build_dir: Path = typer.Option(Path("build"), "--build-dir"),
    generated_dir: Path = typer.Option(Path("generated"), "--generated-dir"),
) -> None:
    build_dir.mkdir(parents=True, exist_ok=True)
    modules = import_verilog_files(_expand([str(rtl / "*.v")]))
    algo = merge_designs(import_svg(diagram), import_fixed_signals(signals))
    mappings = import_mappings(mapping, ports)
    design = merge_designs(modules, algo, mappings)

    write_design(modules, build_dir / "modules.yaml")
    write_design(algo, build_dir / "algo.yaml")
    write_design(mappings, build_dir / "mapping.yaml")
    write_design(design, build_dir / "design.yaml")

    diagnostics = validate_design(design)
    _print_diagnostics(diagnostics)
    if has_errors(diagnostics):
        raise typer.Exit(1)

    generated = emit_verilog(design, generated_dir, top)
    result = run_syntax_check([*generated, *_expand([str(rtl / "*.v")])])
    if result.stdout:
        typer.echo(result.stdout)
    if result.stderr:
        typer.echo(result.stderr, err=True)
    if result.returncode != 0:
        raise typer.Exit(result.returncode)
    emit_reactflow(design, build_dir / "graph.reactflow.json")


def _print_diagnostics(diagnostics) -> None:
    for diag in diagnostics:
        typer.echo(f"{diag.level}: {diag.message}")


def _expand(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            paths.extend(Path(m) for m in matches)
        else:
            paths.append(Path(pattern))
    return paths


def main() -> None:
    app()


if __name__ == "__main__":
    main()

