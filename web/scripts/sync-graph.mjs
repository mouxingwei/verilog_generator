import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const source = resolve(repoRoot, "build/graph.reactflow.json");
const target = resolve(repoRoot, "web/public/graph.reactflow.json");

if (!existsSync(source)) {
  console.error(`Missing graph file: ${source}`);
  console.error("Run the backend build command before syncing the GUI sample.");
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Synced ${source} -> ${target}`);
