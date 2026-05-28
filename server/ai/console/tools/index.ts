// Task #2637 — Barrel + scope-based filter per il tool registry della AI Console.
import { moderationTools } from "./moderation";
import { watchdogTools } from "./watchdog";
import { otaTools } from "./ota";
import { integrityTools } from "./integrity";

export const SCOPES = ["moderation", "watchdog", "ota", "db-integrity", "app-integrity"] as const;
export type Scope = typeof SCOPES[number];

const SCOPE_TOOLS: Record<Scope, Record<string, unknown>> = {
  "moderation": moderationTools,
  "watchdog": watchdogTools,
  "ota": otaTools,
  "db-integrity": pickIntegrity("db"),
  "app-integrity": pickIntegrity("app"),
};

function pickIntegrity(kind: "db" | "app"): Record<string, unknown> {
  const out: Record<string, unknown> = {
    integrityViolationsSince: integrityTools.integrityViolationsSince,
  };
  if (kind === "db") {
    out.dbIntegrityLatestRun = integrityTools.dbIntegrityLatestRun;
    out.dbIntegrityOpenViolations = integrityTools.dbIntegrityOpenViolations;
    out.dbIntegrityRecentRuns = integrityTools.dbIntegrityRecentRuns;
  } else {
    out.appIntegrityLatestRun = integrityTools.appIntegrityLatestRun;
    out.appIntegrityOpenViolations = integrityTools.appIntegrityOpenViolations;
  }
  return out;
}

/** Restituisce solo i tool degli scope selezionati dal router. */
export function buildToolsForScopes(scopes: Scope[]): Record<string, unknown> {
  const set = new Set(scopes);
  const out: Record<string, unknown> = {};
  for (const s of set) {
    Object.assign(out, SCOPE_TOOLS[s] ?? {});
  }
  return out;
}

export function allTools(): Record<string, unknown> {
  return buildToolsForScopes([...SCOPES]);
}

export { moderationTools, watchdogTools, otaTools, integrityTools };
