// Task #4825 — Utility condivise per i checker: scansione file sorgente, snippet.
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

export const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".cache", "dist", "server_dist", "build",
  ".expo", "coverage", "android", "ios", ".local", "logs", "exports",
]);

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

export interface SourceFile {
  abs: string;
  rel: string;
  ext: string;
}

/** Elenca i file sorgente sotto le directory indicate (default: app, server, shared, lib, components, hooks, scripts). */
export function listSourceFiles(dirs?: string[]): SourceFile[] {
  const roots = dirs ?? ["app", "server", "shared", "lib", "components", "hooks", "constants"];
  const out: SourceFile[] = [];
  for (const d of roots) {
    walk(join(ROOT, d), out);
  }
  return out;
}

function walk(dir: string, out: SourceFile[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(abs, out);
    } else {
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "";
      if (SOURCE_EXT.has(ext) && !name.endsWith(".d.ts")) {
        out.push({ abs, rel: relative(ROOT, abs), ext });
      }
    }
  }
}

export function safeRead(abs: string): string {
  try {
    return readFileSync(abs, "utf-8");
  } catch {
    return "";
  }
}

/** Ritorna il numero di riga (1-based) di un offset carattere nel testo. */
export function offsetToLine(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/** Estrae lo snippet di una riga (trim, max 200 char). */
export function lineSnippet(text: string, lineNo: number): string {
  const lines = text.split("\n");
  const raw = lines[lineNo - 1] ?? "";
  return raw.trim().slice(0, 200);
}
