import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";

export const MAX_LINES = 600;
export const LOCKED_DRIFT = 5;

export const SCAN_EXTENSIONS = [".ts", ".tsx"];
export const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".expo",
  ".git",
  ".local",
  "dist",
  "server_dist",
  "build",
  "coverage",
  ".turbo",
]);
export const EXCLUDED_FILES = new Set([
  "scripts/check-large-files.ts",
  "scripts/check-large-files-ratchet.ts",
  "scripts/lib/large-files-core.ts",
]);

export const ALLOW_LIST_PATH = ".large-files-allow.txt";
export const BASELINE_PATH = ".large-files-baseline";

export type MarkerKind = "ALLOW" | "LOCKED";

export interface MarkerInfo {
  kind: MarkerKind;
  reason?: string;          // ALLOW reason
  lockedLimit?: number;     // LOCKED limit N
  companionPath?: string;   // LOCKED companion (second line)
  rawLine: string;
}

export interface FileEntry {
  file: string;
  lines: number;
  marker: MarkerInfo | null;
}

/** Read first N lines of a file as raw strings (no trailing \n). */
function readFirstLines(filePath: string, n: number): string[] {
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").slice(0, n);
}

export function countLines(filePath: string): number {
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

/**
 * Strip the comment opener according to file extension.
 * Supported syntaxes:
 *   - `//` for .ts/.tsx/.js/.tsx/.mjs/.cjs
 *   - `#`  for .sh/.sql/.py/.yml/.yaml
 *   - `<!-- ... -->` for .html
 */
function stripCommentSyntax(line: string, ext: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if ([".sh", ".sql", ".py", ".yml", ".yaml"].includes(ext)) {
    if (!trimmed.startsWith("#")) return null;
    return trimmed.replace(/^#\s*/, "");
  }
  if (ext === ".html" || ext === ".htm") {
    const m = trimmed.match(/^<!--\s*(.*?)\s*-->$/);
    return m ? m[1] : null;
  }
  // default: //
  if (!trimmed.startsWith("//")) return null;
  return trimmed.replace(/^\/\/\s*/, "");
}

/** Parse marker from first (and optional second) line of file. */
export function parseMarker(filePath: string): MarkerInfo | null {
  let lines: string[];
  try {
    lines = readFirstLines(filePath, 2);
  } catch {
    return null;
  }
  const ext = extname(filePath);
  const first = stripCommentSyntax(lines[0] ?? "", ext);
  if (!first) return null;

  const allowMatch = first.match(/^LARGE-FILE-ALLOW:\s*(.+)$/);
  if (allowMatch) {
    return {
      kind: "ALLOW",
      reason: allowMatch[1].trim(),
      rawLine: lines[0],
    };
  }

  const lockedMatch = first.match(/^LARGE-FILE-LOCKED\s+[—-]\s*limite:\s*(\d+)\s*$/);
  if (lockedMatch) {
    const lockedLimit = parseInt(lockedMatch[1], 10);
    const second = stripCommentSyntax(lines[1] ?? "", ext) ?? "";
    const compMatch = second.match(/^Aggiungi nuove funzionalità in:\s*(.+)$/);
    return {
      kind: "LOCKED",
      lockedLimit,
      companionPath: compMatch ? compMatch[1].trim() : undefined,
      rawLine: lines[0],
    };
  }

  return null;
}

/** Recursively scan project for .ts/.tsx files (excluding standard dirs). */
export function scanAllSourceFiles(root: string = process.cwd()): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(root, full).replace(/\\/g, "/");
      if (EXCLUDED_FILES.has(rel)) continue;
      if (SCAN_EXTENSIONS.includes(extname(entry))) {
        out.push(rel);
      }
    }
  }
  walk(root);
  return out;
}

/** Read .large-files-allow.txt as a Set of paths (skipping comments/empties). */
export function loadAllowList(root: string = process.cwd()): Set<string> {
  const p = join(root, ALLOW_LIST_PATH);
  const out = new Set<string>();
  if (!existsSync(p)) return out;
  const content = readFileSync(p, "utf-8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    out.add(line);
  }
  return out;
}

export interface BaselineState {
  /** Map<path, line count> for legacy files (>600, no marker). */
  legacy: Map<string, number>;
  /** Map<path, declared limit N> for LOCKED files. Anti-bypass tracker. */
  locked: Map<string, number>;
}

/**
 * Read .large-files-baseline. Format (one record per line, `#` comments):
 *   LEGACY <path> <lines>
 *   LOCKED <path> <declaredLimit>
 *
 * Backward-compat: plain `<path> <lines>` lines are treated as LEGACY entries.
 */
export function loadBaseline(root: string = process.cwd()): BaselineState {
  const p = join(root, BASELINE_PATH);
  const out: BaselineState = { legacy: new Map(), locked: new Map() };
  if (!existsSync(p)) return out;
  const content = readFileSync(p, "utf-8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const tagged = line.match(/^(LEGACY|LOCKED)\s+(\S+)\s+(\d+)$/);
    if (tagged) {
      const kind = tagged[1] as "LEGACY" | "LOCKED";
      const path = tagged[2];
      const num = parseInt(tagged[3], 10);
      if (kind === "LEGACY") out.legacy.set(path, num);
      else out.locked.set(path, num);
      continue;
    }
    const legacy = line.match(/^(\S+)\s+(\d+)$/);
    if (legacy) out.legacy.set(legacy[1], parseInt(legacy[2], 10));
  }
  return out;
}

/** Build full file state: every source file with line count + marker. */
export function buildFileState(root: string = process.cwd()): FileEntry[] {
  const files = scanAllSourceFiles(root);
  const out: FileEntry[] = [];
  for (const rel of files) {
    let lines: number;
    try {
      lines = countLines(join(root, rel));
    } catch {
      continue;
    }
    const marker = parseMarker(join(root, rel));
    out.push({ file: rel, lines, marker });
  }
  return out;
}
