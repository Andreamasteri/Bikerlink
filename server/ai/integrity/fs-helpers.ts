// Task #2537 — Utility filesystem condivise per i check.
// Scoping difensivo: tutto relativo a projectRoot, esclusioni standard.
import fs from "fs/promises";
import path from "path";

export const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", ".cache", "dist", "build",
  "server_dist", ".expo", "android", "ios", ".local",
  "migrations", "logs", "screenshots", "attached_assets",
  ".replit", ".turbo", "coverage", ".next",
]);

export interface FileEntry { relPath: string; absPath: string; size: number; }

export async function walkFiles(
  root: string,
  opts: { extensions?: string[]; includeDirs?: string[]; maxFiles?: number } = {},
): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const max = opts.maxFiles ?? 50_000;
  const allowedExts = opts.extensions ? new Set(opts.extensions.map((e) => e.toLowerCase())) : null;
  const startDirs = opts.includeDirs?.length
    ? opts.includeDirs.map((d) => path.join(root, d))
    : [root];
  for (const start of startDirs) {
    try { await fs.access(start); } catch { continue; }
    await walk(start, root, allowedExts, out, max);
  }
  return out;
}

async function walk(dir: string, root: string, exts: Set<string> | null, out: FileEntry[], max: number) {
  if (out.length >= max) return;
  let entries: import("fs").Dirent[];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= max) return;
    if (e.name.startsWith(".")) {
      if (e.name !== ".replit" && e.name !== ".eslint-hooks-baseline") {
        if (EXCLUDED_DIRS.has(e.name)) continue;
      }
    }
    if (EXCLUDED_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(abs, root, exts, out, max);
    } else if (e.isFile()) {
      if (exts) {
        const ext = path.extname(e.name).toLowerCase();
        if (!exts.has(ext)) continue;
      }
      try {
        const st = await fs.stat(abs);
        out.push({ relPath: path.relative(root, abs), absPath: abs, size: st.size });
      } catch { /* skip */ }
    }
  }
}

export async function readSafe(absPath: string): Promise<string | null> {
  try { return await fs.readFile(absPath, "utf8"); }
  catch { return null; }
}

export function countLines(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export function relWithin(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, "/");
}
