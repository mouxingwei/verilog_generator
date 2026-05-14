import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeChange,
  NodeMouseHandler,
  Position,
  ReactFlow,
  applyNodeChanges,
  useReactFlow
} from "@xyflow/react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cpu,
  FileCode2,
  FileJson,
  GitBranch,
  Library,
  Maximize2,
  Plus,
  RefreshCw,
  Upload
} from "lucide-react";
import {
  ImportedVerilogModule,
  ImportedVerilogPort,
  parseVerilogModules
} from "./verilogModuleParser";

type GraphPayload = {
  schemaVersion?: string;
  summary?: Record<string, number>;
  diagnostics?: Diagnostic[];
  nodes: Node[];
  edges: Edge[];
};

type Diagnostic = {
  level: "ERROR" | "WARNING" | "INFO";
  message: string;
  context?: Record<string, unknown>;
};

type Selection =
  | { kind: "node"; item: Node }
  | { kind: "edge"; item: Edge }
  | null;

const emptyGraph: GraphPayload = { nodes: [], edges: [], diagnostics: [] };
const defaultGraphUrl = "/graph.reactflow.json";

const nodeTypes = {
  moduleInstance: ModuleInstanceNode,
  signalNet: SignalNetNode
};

export default function App() {
  const graphInputRef = useRef<HTMLInputElement>(null);
  const verilogInputRef = useRef<HTMLInputElement>(null);
  const [graph, setGraph] = useState<GraphPayload>(emptyGraph);
  const [sourceName, setSourceName] = useState("graph.reactflow.json");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [moduleLibrary, setModuleLibrary] = useState<ImportedVerilogModule[]>([]);
  const [moduleImportMessage, setModuleImportMessage] = useState("");

  const loadDefaultGraph = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(defaultGraphUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const nextGraph = await response.json();
      setGraph(normalizeGraph(nextGraph));
      setSourceName("graph.reactflow.json");
      setSelection(null);
      setStatus("ready");
    } catch (err) {
      setGraph(emptyGraph);
      setError(err instanceof Error ? err.message : "Graph load failed");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadDefaultGraph();
  }, [loadDefaultGraph]);

  const nodes = useMemo(() => graph.nodes.map(normalizeNode), [graph.nodes]);
  const edges = useMemo(() => graph.edges.map(normalizeEdge), [graph.edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setGraph((previous) => ({
      ...previous,
      nodes: applyNodeChanges(changes, previous.nodes)
    }));
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelection({ kind: "node", item: node });
  }, []);

  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setSelection({ kind: "edge", item: edge });
  }, []);

  const loadLocalGraphFile = useCallback(async (file: File) => {
    setStatus("loading");
    setError(null);
    try {
      const text = await file.text();
      const nextGraph = JSON.parse(text);
      setGraph(normalizeGraph(nextGraph));
      setSourceName(file.name);
      setSelection(null);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "JSON parse failed");
      setStatus("error");
    }
  }, []);

  const importVerilogFiles = useCallback(async (files: FileList | null) => {
    const fileList = Array.from(files ?? []);
    if (fileList.length === 0) {
      return;
    }

    const parsed: ImportedVerilogModule[] = [];
    for (const file of fileList) {
      const text = await file.text();
      parsed.push(...parseVerilogModules(text, file.name));
    }

    setModuleLibrary((previous) => mergeModuleLibrary(previous, parsed));
    setModuleImportMessage(`${parsed.length} module(s) imported from ${fileList.length} file(s)`);
  }, []);

  const addModuleInstance = useCallback((moduleDef: ImportedVerilogModule) => {
    let createdNode: Node | null = null;
    setGraph((previous) => {
      const instanceName = nextInstanceName(previous.nodes, moduleDef.name);
      const nextNode: Node = {
        id: `instance:gui.${instanceName}`,
        type: "moduleInstance",
        position: nextModulePosition(previous.nodes),
        data: {
          label: instanceName,
          module: moduleDef.name,
          hierarchy: "gui",
          block_type: "imported",
          source: moduleDef.source,
          imported: true,
          parameters: Object.fromEntries(moduleDef.parameters.map((param) => [param.name, param.default ?? ""])),
          ports: moduleDef.ports
        }
      };
      createdNode = nextNode;
      return {
        ...previous,
        nodes: [...previous.nodes, nextNode],
        summary: {
          ...(previous.summary ?? {}),
          instances: countType([...previous.nodes, nextNode], "moduleInstance")
        }
      };
    });
    if (createdNode) {
      setSelection({ kind: "node", item: createdNode });
    }
  }, []);

  return (
    <div className="appShell">
      <aside className="sidePanel leftPanel">
        <BrandBlock status={status} sourceName={sourceName} error={error} />
        <MetricGrid graph={graph} moduleLibrary={moduleLibrary} />
        <ModuleLibrary
          modules={moduleLibrary}
          importMessage={moduleImportMessage}
          onImport={() => verilogInputRef.current?.click()}
          onAdd={addModuleInstance}
        />
        <Diagnostics diagnostics={graph.diagnostics ?? []} />
      </aside>

      <main className="workspace">
        <Toolbar
          status={status}
          sourceName={sourceName}
          onUploadGraph={() => graphInputRef.current?.click()}
          onImportVerilog={() => verilogInputRef.current?.click()}
          onRefresh={loadDefaultGraph}
        />
        <input
          ref={graphInputRef}
          className="hiddenInput"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void loadLocalGraphFile(file);
            }
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={verilogInputRef}
          className="hiddenInput"
          type="file"
          accept=".v,.vh,.sv,.svh,text/plain"
          multiple
          onChange={(event) => {
            void importVerilogFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <section className="flowFrame" aria-label="Verilog topology">
          {status === "error" && <LoadError error={error} onRetry={loadDefaultGraph} />}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={1.6}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onNodesChange={onNodesChange}
            onPaneClick={() => setSelection(null)}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
            <Controls showInteractive={false} />
            <FlowActions />
          </ReactFlow>
        </section>
      </main>

      <aside className="sidePanel rightPanel">
        <SelectionDetails selection={selection} />
      </aside>
    </div>
  );
}

function BrandBlock({
  status,
  sourceName,
  error
}: {
  status: "loading" | "ready" | "error";
  sourceName: string;
  error: string | null;
}) {
  return (
    <section className="panelSection brandBlock">
      <div className="brandIcon">
        <Cpu size={22} />
      </div>
      <div>
        <h1>Verilog Generator</h1>
        <p>{sourceName}</p>
      </div>
      <StatusPill status={status} error={error} />
    </section>
  );
}

function StatusPill({
  status,
  error
}: {
  status: "loading" | "ready" | "error";
  error: string | null;
}) {
  if (status === "ready") {
    return (
      <span className="statusPill ready">
        <CheckCircle2 size={14} />
        Ready
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="statusPill error" title={error ?? ""}>
        <AlertTriangle size={14} />
        Error
      </span>
    );
  }
  return <span className="statusPill loading">Loading</span>;
}

function MetricGrid({ graph, moduleLibrary }: { graph: GraphPayload; moduleLibrary: ImportedVerilogModule[] }) {
  const summary = graph.summary ?? {};
  const metrics = [
    { label: "Modules", value: summary.modules ?? 0, icon: Boxes },
    { label: "Instances", value: summary.instances ?? countType(graph.nodes, "moduleInstance"), icon: Cpu },
    { label: "Nets", value: summary.nets ?? countType(graph.nodes, "signalNet"), icon: GitBranch },
    { label: "Library", value: moduleLibrary.length, icon: Library }
  ];

  return (
    <section className="panelSection">
      <div className="sectionTitle">Project</div>
      <div className="metricGrid">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div className="metricItem" key={label}>
            <Icon size={16} />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModuleLibrary({
  modules,
  importMessage,
  onImport,
  onAdd
}: {
  modules: ImportedVerilogModule[];
  importMessage: string;
  onImport: () => void;
  onAdd: (moduleDef: ImportedVerilogModule) => void;
}) {
  return (
    <section className="panelSection moduleLibraryPanel">
      <div className="moduleLibraryHeader">
        <div className="sectionTitle">Module Library</div>
        <button className="compactButton" onClick={onImport} title="Import Verilog">
          <FileCode2 size={15} />
          <span>RTL</span>
        </button>
      </div>
      {importMessage && <div className="libraryMessage">{importMessage}</div>}
      {modules.length === 0 ? (
        <div className="emptyState">No modules loaded</div>
      ) : (
        <div className="moduleCatalog">
          {modules.map((moduleDef) => (
            <div className="moduleCatalogItem" key={`${moduleDef.source}:${moduleDef.name}`}>
              <div className="moduleCatalogTitle">
                <strong>{moduleDef.name}</strong>
                <button className="moduleAddButton" onClick={() => onAdd(moduleDef)} title="Add submodule">
                  <Plus size={15} />
                </button>
              </div>
              <div className="moduleCatalogMeta">{moduleDef.source}</div>
              <div className="moduleStats">
                <span>{moduleDef.ports.length} ports</span>
                <span>{moduleDef.parameters.length} params</span>
              </div>
              <div className="modulePreview">
                {moduleDef.ports.slice(0, 6).map((port) => (
                  <span key={port.name}>{port.name}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const visible = diagnostics.slice(0, 8);
  return (
    <section className="panelSection diagnosticsPanel">
      <div className="sectionTitle">Diagnostics</div>
      {visible.length === 0 ? (
        <div className="emptyState">No diagnostics</div>
      ) : (
        <div className="diagList">
          {visible.map((diag, index) => (
            <div className={`diagItem ${diag.level.toLowerCase()}`} key={`${diag.level}-${index}`}>
              <span>{diag.level}</span>
              <p>{diag.message}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Toolbar({
  status,
  sourceName,
  onUploadGraph,
  onImportVerilog,
  onRefresh
}: {
  status: "loading" | "ready" | "error";
  sourceName: string;
  onUploadGraph: () => void;
  onImportVerilog: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="toolbar">
      <div className="toolbarTitle">
        <GitBranch size={18} />
        <span>Topology Editor</span>
        <small>{sourceName}</small>
      </div>
      <div className="toolbarActions">
        <button className="iconButton" onClick={onImportVerilog} title="Import Verilog">
          <FileCode2 size={17} />
          <span>RTL</span>
        </button>
        <button className="iconButton" onClick={onUploadGraph} title="Import graph JSON">
          <Upload size={17} />
          <span>Graph</span>
        </button>
        <button className="iconButton" onClick={onRefresh} title="Reload sample graph">
          <RefreshCw size={17} className={status === "loading" ? "spin" : ""} />
          <span>Reload</span>
        </button>
      </div>
    </header>
  );
}

function FlowActions() {
  const { fitView } = useReactFlow();
  return (
    <div className="flowActions">
      <button className="canvasButton" onClick={() => fitView({ padding: 0.18 })} title="Fit view">
        <Maximize2 size={16} />
      </button>
    </div>
  );
}

function LoadError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="loadError">
      <AlertTriangle size={18} />
      <strong>Graph not loaded</strong>
      <span>{error ?? "unknown error"}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}

function ModuleInstanceNode({ data, selected }: any) {
  const ports = Array.isArray(data.ports) ? data.ports : [];
  const inputPorts = ports.filter((port: ImportedVerilogPort) => port.direction !== "output");
  const outputPorts = ports.filter((port: ImportedVerilogPort) => port.direction === "output");
  return (
    <div className={`moduleNode ${selected ? "selected" : ""}`}>
      <div className="moduleHeader">
        <span>{data.label}</span>
        <strong>{data.module}</strong>
      </div>
      <div className="moduleMeta">{data.hierarchy}</div>
      <div className="portColumns">
        <div className="portStack">
          {inputPorts.map((port: ImportedVerilogPort) => (
            <PortRow port={port} key={`in-${port.name}`} side="left" />
          ))}
        </div>
        <div className="portStack right">
          {outputPorts.map((port: ImportedVerilogPort) => (
            <PortRow port={port} key={`out-${port.name}`} side="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PortRow({ port, side }: { port: ImportedVerilogPort; side: "left" | "right" }) {
  const isOutput = side === "right";
  return (
    <div className={`portRow ${side}`}>
      <Handle
        id={port.name}
        type={isOutput ? "source" : "target"}
        position={isOutput ? Position.Right : Position.Left}
        className="portHandle"
      />
      <span>{port.name}</span>
      <small>{formatWidth(port)}</small>
    </div>
  );
}

function SignalNetNode({ data, selected }: any) {
  return (
    <div className={`signalNode ${selected ? "selected" : ""}`}>
      <Handle id="net" type="target" position={Position.Left} className="netHandle" />
      <Handle id="net" type="source" position={Position.Right} className="netHandle" />
      <div className="signalName">{data.label}</div>
      <div className="signalMeta">
        <span>{data.fixed_format ?? `${data.width ?? 1}b`}</span>
        {data.port_direction && <strong>{data.port_direction}</strong>}
      </div>
    </div>
  );
}

function SelectionDetails({ selection }: { selection: Selection }) {
  if (!selection) {
    return (
      <section className="panelSection detailPanel">
        <div className="sectionTitle">Details</div>
        <div className="emptyState">Nothing selected</div>
      </section>
    );
  }

  const data = (selection.item.data ?? {}) as Record<string, unknown>;
  const fields =
    selection.kind === "node"
      ? detailRows(data, ["label", "module", "signal", "hierarchy", "block", "block_type", "source", "fixed_format", "width", "signed", "frac_width", "port_direction"])
      : detailRows(data, ["signal", "hierarchy", "instance", "module", "port", "direction", "port_width", "net_width", "fixed_format"]);

  return (
    <section className="panelSection detailPanel">
      <div className="sectionTitle">{selection.kind === "node" ? "Node" : "Edge"}</div>
      <div className="detailList">
        <DetailRow label="id" value={selection.item.id} />
        {fields.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
      </div>
      {selection.kind === "node" && Array.isArray(data.ports) && (
        <div className="portTable">
          <div className="sectionTitle small">Ports</div>
          {(data.ports as ImportedVerilogPort[]).map((port) => (
            <div className="portTableRow" key={port.name}>
              <span>{port.name}</span>
              <small>{port.direction}</small>
              <strong>{formatWidth(port)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="detailRow">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function normalizeGraph(payload: GraphPayload): GraphPayload {
  return {
    schemaVersion: payload.schemaVersion,
    summary: payload.summary ?? {},
    diagnostics: payload.diagnostics ?? [],
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    edges: Array.isArray(payload.edges) ? payload.edges : []
  };
}

function normalizeNode(node: Node): Node {
  return {
    ...node,
    draggable: true,
    selectable: true
  };
}

function normalizeEdge(edge: Edge): Edge {
  return {
    ...edge,
    type: edge.type ?? "smoothstep",
    markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: {
      strokeWidth: 1.8,
      ...(edge.style ?? {})
    }
  };
}

function detailRows(data: Record<string, unknown>, keys: string[]) {
  return keys
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map((key) => [key, data[key]] as [string, unknown]);
}

function countType(nodes: Node[], type: string) {
  return nodes.filter((node) => node.type === type).length;
}

function formatWidth(port: { width?: number; width_expr?: string }) {
  if (port.width !== undefined && port.width !== null) {
    return `${port.width}b`;
  }
  if (port.width_expr) {
    return port.width_expr;
  }
  return "1b";
}

function mergeModuleLibrary(previous: ImportedVerilogModule[], incoming: ImportedVerilogModule[]) {
  const byKey = new Map(previous.map((moduleDef) => [`${moduleDef.source}:${moduleDef.name}`, moduleDef]));
  for (const moduleDef of incoming) {
    byKey.set(`${moduleDef.source}:${moduleDef.name}`, moduleDef);
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function nextInstanceName(nodes: Node[], moduleName: string) {
  const base = `u_${sanitizeIdentifier(moduleName)}`;
  const used = new Set(nodes.map((node) => String((node.data as any)?.label ?? "")));
  let index = 0;
  while (used.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

function nextModulePosition(nodes: Node[]) {
  const moduleCount = countType(nodes, "moduleInstance");
  return {
    x: 360 + 280 * (moduleCount % 3),
    y: 420 + 190 * Math.floor(moduleCount / 3)
  };
}

function sanitizeIdentifier(value: string) {
  const sanitized = value.replace(/\W+/g, "_").replace(/^(\d)/, "_$1");
  return sanitized || "module";
}
