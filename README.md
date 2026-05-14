# verilog_generator

Generate Verilog-2005 top-level structure code from existing RTL module interfaces, Edraw SVG diagrams, fixed-point signal spreadsheets, and YAML mapping files.

## First-phase flow

```text
Verilog-2005 RTL -> module/port/parameter IR
Edraw SVG        -> blocks and signal connections
Excel            -> fixed-point signal formats, such as s(11,1)
YAML mappings    -> block-to-module and port-name mappings
IR               -> multi-file Verilog .v output
Icarus Verilog   -> syntax check
React Flow JSON  -> read-only topology preview
```

## Example

```powershell
$env:PYTHONPATH='src'
python -m verilog_generator.cli build `
  --rtl examples/rtl `
  --diagram examples/algo/algo.svg `
  --signals examples/algo/fixed_signals.xlsx `
  --mapping examples/algo/block_mapping.yaml `
  --ports examples/algo/port_mapping.yaml `
  --top top
```

Generated files are written to `generated/`; intermediate IR and React Flow JSON are written to `build/`.

## Basic GUI

The first GUI is a read-only topology preview based on React Flow. It loads `web/public/graph.reactflow.json` by default and also supports importing a local React Flow JSON file from the toolbar.

The GUI can import Verilog files into a browser-side module library. Imported modules can be added to the canvas as new submodule instances. This first GUI parser targets common Verilog-2005 module headers and uses the backend Pyverilog path for authoritative generation.

```powershell
$env:PYTHONPATH='src'
python -m verilog_generator.cli build `
  --rtl examples/rtl `
  --diagram examples/algo/algo.svg `
  --signals examples/algo/fixed_signals.xlsx `
  --mapping examples/algo/block_mapping.yaml `
  --ports examples/algo/port_mapping.yaml `
  --top top

cd web
npm install
npm run sync:graph
npm run dev
```

## Individual commands

```powershell
$env:PYTHONPATH='src'
python -m verilog_generator.cli import-verilog examples/rtl/*.v -o build/modules.yaml
python -m verilog_generator.cli import-algo-svg examples/algo/algo.svg --signals examples/algo/fixed_signals.xlsx -o build/algo.yaml
python -m verilog_generator.cli import-mapping examples/algo/block_mapping.yaml --ports examples/algo/port_mapping.yaml -o build/mapping.yaml
python -m verilog_generator.cli merge build/modules.yaml build/algo.yaml build/mapping.yaml -o build/design.yaml
python -m verilog_generator.cli validate build/design.yaml
python -m verilog_generator.cli generate-verilog build/design.yaml -o generated/
python -m verilog_generator.cli syntax-check generated/*.v examples/rtl/*.v
python -m verilog_generator.cli generate-reactflow build/design.yaml -o build/graph.reactflow.json
```
