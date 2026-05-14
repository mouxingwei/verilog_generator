export type VerilogPortDirection = "input" | "output" | "inout";

export type ImportedVerilogParameter = {
  name: string;
  default?: string;
};

export type ImportedVerilogPort = {
  name: string;
  direction: VerilogPortDirection;
  width?: number;
  width_expr?: string;
  signed: boolean;
  required: boolean;
};

export type ImportedVerilogModule = {
  name: string;
  source: string;
  parameters: ImportedVerilogParameter[];
  ports: ImportedVerilogPort[];
};

type PortState = {
  direction: VerilogPortDirection;
  signed: boolean;
  width?: number;
  width_expr?: string;
};

const directionPattern = /\b(input|output|inout)\b/;

export function parseVerilogModules(source: string, sourceName: string): ImportedVerilogModule[] {
  const text = stripComments(source);
  const modules: ImportedVerilogModule[] = [];
  const modulePattern = /\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)\s*(?:#\s*\(([\s\S]*?)\)\s*)?\(([\s\S]*?)\)\s*;([\s\S]*?)\bendmodule\b/g;
  let match: RegExpExecArray | null;

  while ((match = modulePattern.exec(text)) !== null) {
    const [, name, parameterBlock = "", portBlock = "", body = ""] = match;
    modules.push({
      name,
      source: sourceName,
      parameters: parseParameters(parameterBlock, body),
      ports: parsePorts(portBlock, body)
    });
  }

  return modules;
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function parseParameters(parameterBlock: string, body: string): ImportedVerilogParameter[] {
  const seen = new Set<string>();
  const out: ImportedVerilogParameter[] = [];
  const segments = [
    ...splitTopLevel(parameterBlock, ","),
    ...Array.from(body.matchAll(/\bparameter\b\s+([^;]+);/g)).flatMap((match) => splitTopLevel(match[1], ","))
  ];

  for (const segment of segments) {
    const cleaned = segment
      .replace(/\bparameter\b/g, " ")
      .replace(/\b(localparam|integer|real|signed|unsigned)\b/g, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .trim();
    const parsed = cleaned.match(/^([A-Za-z_][A-Za-z0-9_$]*)(?:\s*=\s*(.+))?$/);
    if (!parsed || seen.has(parsed[1])) {
      continue;
    }
    seen.add(parsed[1]);
    out.push({ name: parsed[1], default: parsed[2]?.trim() });
  }

  return out;
}

function parsePorts(portBlock: string, body: string): ImportedVerilogPort[] {
  const headerItems = splitTopLevel(portBlock, ",");
  const hasAnsiPorts = headerItems.some((item) => directionPattern.test(item));
  const seen = new Set<string>();
  const out: ImportedVerilogPort[] = [];

  if (hasAnsiPorts) {
    let state: PortState = { direction: "input", signed: false };
    for (const item of headerItems) {
      const parsed = parsePortItem(item, state);
      state = parsed.state;
      for (const port of parsed.ports) {
        addPort(out, seen, port);
      }
    }
    return out;
  }

  const declared = new Map<string, ImportedVerilogPort>();
  const declarationPattern = /\b(input|output|inout)\b([^;]*);/g;
  let declaration: RegExpExecArray | null;
  while ((declaration = declarationPattern.exec(body)) !== null) {
    const direction = declaration[1] as VerilogPortDirection;
    const state = readPortState(`${direction} ${declaration[2]}`, { direction, signed: false });
    for (const item of splitTopLevel(declaration[2], ",")) {
      for (const port of namesFromPortText(item).map((name) => ({ name, ...state, required: true }))) {
        declared.set(port.name, port);
      }
    }
  }

  for (const name of headerItems.map(cleanPortName).filter(Boolean)) {
    const declaredPort = declared.get(name);
    if (declaredPort) {
      addPort(out, seen, declaredPort);
    }
  }

  return out;
}

function parsePortItem(item: string, previous: PortState): { ports: ImportedVerilogPort[]; state: PortState } {
  const state = readPortState(item, previous);
  const ports = namesFromPortText(item).map((name) => ({
    name,
    ...state,
    required: true
  }));
  return { ports, state };
}

function readPortState(text: string, previous: PortState): PortState {
  const direction = (text.match(directionPattern)?.[1] as VerilogPortDirection | undefined) ?? previous.direction;
  const hasDirection = directionPattern.test(text);
  const width = parseWidth(text);
  return {
    direction,
    signed: /\bsigned\b/.test(text) || (!hasDirection && previous.signed),
    width: width.width ?? (width.width_expr ? undefined : !hasDirection ? previous.width : 1),
    width_expr: width.width_expr ?? (!hasDirection ? previous.width_expr : undefined)
  };
}

function parseWidth(text: string): { width?: number; width_expr?: string } {
  const match = text.match(/\[([^\]]+)\]/);
  if (!match) {
    return {};
  }
  const expr = match[1].trim();
  const range = expr.match(/^(\d+)\s*:\s*(\d+)$/);
  if (range) {
    return { width: Math.abs(Number(range[1]) - Number(range[2])) + 1, width_expr: expr };
  }
  return { width_expr: expr };
}

function namesFromPortText(text: string): string[] {
  const withoutAttributes = text
    .replace(directionPattern, " ")
    .replace(/\b(wire|reg|logic|signed|unsigned|tri|supply0|supply1)\b/g, " ")
    .replace(/\[[^\]]+\]/g, " ");
  return splitTopLevel(withoutAttributes, ",")
    .map(cleanPortName)
    .filter(Boolean);
}

function cleanPortName(text: string): string {
  const cleaned = text
    .replace(/=.*$/, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .trim();
  return cleaned.match(/[A-Za-z_][A-Za-z0-9_$]*$/)?.[0] ?? "";
}

function addPort(out: ImportedVerilogPort[], seen: Set<string>, port: ImportedVerilogPort): void {
  if (!seen.has(port.name)) {
    seen.add(port.name);
    out.push(port);
  }
}

function splitTopLevel(text: string, delimiter: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (char === delimiter && depth === 0) {
      out.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) {
    out.push(tail);
  }
  return out;
}
