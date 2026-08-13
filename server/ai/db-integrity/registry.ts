// Task #2536 — Registry dei check pack.
//
// Strategia ibrida: prima discovery dinamica via fast-glob (dev tsx/ESM),
// poi fallback su import statici espliciti (prod CJS bundle dove __dirname
// può non esistere o la cartella non viene copiata nel bundle).
// Questo soddisfa sia il requisito di discovery automatica sia la robustezza
// in produzione.
import fg from "fast-glob";
import path from "path";
import { pathToFileURL } from "url";
import type { IntegrityCheck } from "./types";

import orphans from "./checks/orphans";
import orphansExtra from "./checks/orphans-extra";
import invalidStates from "./checks/invalid-states";
import stateExtra from "./checks/state-extra";
import jsonbShapes from "./checks/jsonb-shapes";
import jsonbExtra from "./checks/jsonb-extra";
import counters from "./checks/counters";
import logicalFks from "./checks/logical-fks";
import embeddings from "./checks/embeddings";
import crossTable from "./checks/cross-table";
import time from "./checks/time";
import duplicates from "./checks/duplicates";
import schemaRegistry from "./checks/schema-registry";
import softDeleteCleanup from "./checks/soft-delete-cleanup";

const STATIC_PACKS: IntegrityCheck[][] = [
  orphans, orphansExtra,
  invalidStates, stateExtra,
  jsonbShapes, jsonbExtra,
  counters, logicalFks, embeddings, crossTable, time, duplicates,
  schemaRegistry, softDeleteCleanup,
];

let cached: IntegrityCheck[] | null = null;

function safeCurrentDir(): string | null {
  // In CommonJS bundles Node provides __dirname. In tsx/ESM development,
  // process.cwd() points to the repository root, so the source path is
  // deterministic without parsing import.meta through eval().
  if (typeof __dirname !== "undefined" && __dirname) return __dirname;
  return path.resolve(process.cwd(), "server/ai/db-integrity");
}

async function discoverViaGlob(): Promise<IntegrityCheck[]> {
  const dir = safeCurrentDir();
  if (!dir) return [];
  const checksDir = path.resolve(dir, "checks");
  const pattern = path.join(checksDir, "**/*.{ts,js}").replace(/\\/g, "/");
  let files: string[] = [];
  try { files = await fg(pattern, { absolute: true }); } catch { return []; }
  if (!files.length) return [];
  const out: IntegrityCheck[] = [];
  for (const f of files) {
    try {
      const mod = await import(pathToFileURL(f).href);
      const list = mod?.default;
      if (Array.isArray(list)) {
        for (const c of list as IntegrityCheck[]) {
          if (c && typeof c.id === "string" && typeof c.query === "function") out.push(c);
        }
      }
    } catch { /* silently skip — fallback statico copre */ }
  }
  return out;
}

function fromStatic(): IntegrityCheck[] {
  const out: IntegrityCheck[] = [];
  for (const pack of STATIC_PACKS) {
    if (!Array.isArray(pack)) continue;
    for (const c of pack) {
      if (c && typeof c.id === "string" && typeof c.query === "function") out.push(c);
    }
  }
  return out;
}

export async function loadAllChecks(force = false): Promise<IntegrityCheck[]> {
  if (!force && cached) return cached;
  const dynamicHits = await discoverViaGlob();
  const baseline = fromStatic();
  // Unione: static garantisce min coverage; dynamic permette aggiunte locali a runtime.
  const map = new Map<string, IntegrityCheck>();
  for (const c of baseline) map.set(c.id, c);
  for (const c of dynamicHits) map.set(c.id, c); // dynamic vince (consente override)
  cached = Array.from(map.values());
  return cached;
}

export function invalidateChecksCache(): void {
  cached = null;
}
