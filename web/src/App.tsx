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
  NodeMouseHandler,
  Position,
  ReactFlow,
  useReactFlow
} from "@xyflow/react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cpu,
  FileJson,
  GitBranch,
  Maximize2,
  RefreshCw,
  Upload
} from "lucide-react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [graph, setGraph] = useState<GraphPayload>(emptyGraph);
  const [sourceName, setSourceName] = useState("graph.reactflow.json");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

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
      setError(err instanceof Error ? err.message : "无法加载图数据");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadDefaultGraph();
  }, [loadDefaultGraph]);

  const nodes = useMemo(() => graph.nodes.map(normalizeNode), [graph.nodes]);
  const edges = useMemo(() => graph.edges.map(normalizeEdge), [graph.edges]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelection({ kind: "node", item: node });
  }, []);

  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setSelection({ kind: "edge", item: edge });
  }, []);

  const loadLocalFile = useCallback(async (file: File) => {
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
      setError(err instanceof Error ? err.message : "JSON 解析失败");
      setStatus("error");
    }
  }, []);

  return (
    <div className="appShell">
      <aside className="sidePanel leftPanel">
        <BrandBlock status={status} sourceName={sourceName} error={error} />
        <MetricGrid graph={graph} />
        <Diagnostics diagnostics={graph.diagnostics ?? []} />
      </aside>

      <main className="workspace">
        <Toolbar
          status={status}
          sourceName={sourceName}
          onUpload={() => inputRef.current?.click()}
          onRefresh={loadDefaultGraph}
        />
        <input
          ref={inputRef}
          className="hiddenInput"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void loadLocalFile(file);
            }
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
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
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

function MetricGrid({ graph }: { graph: GraphPayload }) {
  const summary = graph.summary ?? {};
  const metrics = [
    { label: "Modules", value: summary.modules ?? 0, icon: Boxes },
    { label: "Instances", value: summary.instances ?? countType(graph.nodes, "moduleInstance"), icon: Cpu },
    { label: "Nets", value: summary.nets ?? countType(graph.nodes, "signalNet"), icon: GitBranch },
    { label: "Edges", value: summary.connections ?? graph.edges.length, icon: FileJson }
  ];

  return (
    <section className="panelSection">
      <div className="sectionTitle">工程摘要</div>
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

function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const visible = diagnostics.slice(0, 8);
  return (
    <section className="panelSection diagnosticsPanel">
      <div className="sectionTitle">诊断</div>
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
  onUpload,
  onRefresh
}: {
  status: "loading" | "ready" | "error";
  sourceName: string;
  onUpload: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="toolbar">
      <div className="toolbarTitle">
        <GitBranch size={18} />
        <span>Topology Preview</span>
        <small>{sourceName}</small>
      </div>
      <div className="toolbarActions">
        <button className="iconButton" onClick={onUpload} title="加载本地 JSON">
          <Upload size={17} />
          <span>导入</span>
        </button>
        <button className="iconButton" onClick={onRefresh} title="重新加载示例图">
          <RefreshCw size={17} className={status === "loading" ? "spin" : ""} />
          <span>刷新</span>
        </button>
      </div>
    </header>
  );
}

function FlowActions() {
  const { fitView } = useReactFlow();
  return (
    <div className="flowActions">
      <button className="canvasButton" onClick={() => fitView({ padding: 0.18 })} title="适配视图">
        <Maximize2 size={16} />
      </button>
    </div>
  );
}

function LoadError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="loadError">
      <AlertTriangle size={18} />
      <strong>图数据未加载</strong>
      <span>{error ?? "unknown error"}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}

function ModuleInstanceNode({ data, selected }: any) {
  const ports = Array.isArray(data.ports) ? data.ports : [];
  const inputPorts = ports.filter((port: any) => port.direction !== "output");
  const outputPorts = ports.filter((port: any) => port.direction === "output");
  return (
    <div className={`moduleNode ${selected ? "selected" : ""}`}>
      <div className="moduleHeader">
        <span>{data.label}</span>
        <strong>{data.module}</strong>
      </div>
      <div className="moduleMeta">{data.hierarchy}</div>
      <div className="portColumns">
        <div className="portStack">
          {inputPorts.map((port: any) => (
            <PortRow port={port} key={`in-${port.name}`} side="left" />
          ))}
        </div>
        <div className="portStack right">
          {outputPorts.map((port: any) => (
            <PortRow port={port} key={`out-${port.name}`} side="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PortRow({ port, side }: { port: any; side: "left" | "right" }) {
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
        <div className="sectionTitle">详情</div>
        <div className="emptyState">Nothing selected</div>
      </section>
    );
  }

  const data = (selection.item.data ?? {}) as Record<string, unknown>;
  const fields =
    selection.kind === "node"
      ? detailRows(data, ["label", "module", "signal", "hierarchy", "block", "block_type", "fixed_format", "width", "signed", "frac_width", "port_direction"])
      : detailRows(data, ["signal", "hierarchy", "instance", "module", "port", "direction", "port_width", "net_width", "fixed_format"]);

  return (
    <section className="panelSection detailPanel">
      <div className="sectionTitle">{selection.kind === "node" ? "节点详情" : "连线详情"}</div>
      <div className="detailList">
        <DetailRow label="id" value={selection.item.id} />
        {fields.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
      </div>
      {selection.kind === "node" && Array.isArray(data.ports) && (
        <div className="portTable">
          <div className="sectionTitle small">端口</div>
          {(data.ports as any[]).map((port) => (
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
    draggable: false,
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

function formatWidth(port: any) {
  if (port.width !== undefined && port.width !== null) {
    return `${port.width}b`;
  }
  if (port.width_expr) {
    return port.width_expr;
  }
  return "1b";
}
