// Task #4825 — Checker dead-code: file sorgente mai importati da nessun altro file.
// Euristica: esclude entrypoint (route Expo in app/, server/index, migrazioni, test,
// config) perché sono caricati per convenzione, non via import esplicito.
import { basename } from "path";
import { listSourceFiles, safeRead } from "../scan-utils";
import type { CheckResult } from "../types";

function isEntrypoint(rel: string): boolean {
  if (rel.startsWith("app/")) return true; // file-based routing Expo Router
  if (/\.(test|spec)\.tsx?$/.test(rel)) return true;
  if (/__tests__/.test(rel)) return true;
  if (/\.config\.(ts|js)$/.test(rel)) return true;
  if (/^server\/(index|migrate|boot-sequence)\.ts$/.test(rel)) return true;
  if (/^scripts\//.test(rel)) return true;
  if (/index\.tsx?$/.test(basename(rel))) return true;
  return false;
}

function moduleName(rel: string): string {
  return rel.replace(/\.(ts|tsx|js|jsx)$/, "");
}

export async function runDeadCode(): Promise<CheckResult[]> {
  const files = listSourceFiles();
  // Concatena tutto il sorgente per cercare riferimenti rapidi al basename.
  const allText = files.map((f) => safeRead(f.abs)).join("\n");

  const out: CheckResult[] = [];
  for (const f of files) {
    if (isEntrypoint(f.rel)) continue;
    const name = basename(moduleName(f.rel));
    // Riferimento via stringa di import che contiene il basename del modulo.
    const refRe = new RegExp(`['"\`][^'"\`]*\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"\`/]`);
    if (!refRe.test(allText)) {
      out.push({
        checkId: "DC-unused",
        category: "dead-code",
        severity: "info",
        file: f.rel,
        description: `Modulo '${name}' non risulta importato da altri file (possibile dead-code)`,
      });
    }
  }
  return out;
}
