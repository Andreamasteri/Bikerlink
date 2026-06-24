// Task #4825 — Checker typecheck: esegue tsc su client + server e parsa gli errori.
import { execFileSync } from "child_process";
import { ROOT } from "../scan-utils";
import type { CheckResult } from "../types";

const PROJECTS = ["tsconfig.client.json", "server/tsconfig.json"];

// Esempio output tsc: "app/foo.tsx(12,5): error TS2345: Argument ..."
const TS_ERROR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

function runTsc(project: string): string {
  try {
    execFileSync("npx", ["tsc", "--noEmit", "-p", project], {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return "";
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }
}

export async function runTypecheck(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const project of PROJECTS) {
    const raw = runTsc(project);
    for (const lineRaw of raw.split("\n")) {
      const m = TS_ERROR_RE.exec(lineRaw.trim());
      if (!m) continue;
      out.push({
        checkId: m[4],
        category: "typecheck",
        severity: "critical",
        file: m[1],
        line: parseInt(m[2], 10),
        column: parseInt(m[3], 10),
        description: m[5],
        evidence: `${m[4]}: ${m[5]}`.slice(0, 200),
      });
    }
  }
  return out;
}
