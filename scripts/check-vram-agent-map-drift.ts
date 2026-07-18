#!/usr/bin/env tsx
/**
 * check-vram-agent-map-drift.ts
 *
 * Verifica che DEFAULT_AGENT_MAP in scripts/thinkcentre/ai-hub/vram-routes.js
 * contenga una chiave per ogni modello elencato in AGENT_MODEL_DEFAULTS in
 * server/lib/agent-constants.ts.
 *
 * PERCHÉ ESISTE:
 *   vram-routes.js è deployato sul ThinkCentre come parte dell'ai-hub e non
 *   viene aggiornato automaticamente quando un agente cambia modello.
 *   Se un model upgrade viene applicato solo in agent-constants.ts (o solo in
 *   vram-routes.js), il TC torna al DEFAULT_AGENT_MAP hardcoded dopo un
 *   riavvio e prima che l'api-server abbia fatto la push: GET /vram mostra
 *   agent:null per il modello aggiornato, rendendo il monitoring inattendibile.
 *
 *   Questo script cattura la divergenza PRIMA che arrivi in produzione, senza
 *   richiedere un TC live o una GPU reale.
 *
 * UTILIZZO:
 *   npx tsx scripts/check-vram-agent-map-drift.ts
 *
 * EXIT:
 *   0 — ogni modello in AGENT_MODEL_DEFAULTS compare come chiave in DEFAULT_AGENT_MAP
 *       e nessun modello retired è stato re-introdotto
 *   1 — uno o più modelli mancano (drift rilevato) o un modello retired è riapparso
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ── 1. Leggi AGENT_MODEL_DEFAULTS da server/lib/agent-constants.ts ──────────

const agentConstantsPath = path.join(ROOT, "server", "lib", "agent-constants.ts");
const vramRoutesPath = path.join(
  ROOT,
  "scripts",
  "thinkcentre",
  "ai-hub",
  "vram-routes.js"
);

/**
 * Estrae i valori stringa da AGENT_MODEL_DEFAULTS tramite regex.
 * Cerca il blocco `export const AGENT_MODEL_DEFAULTS = { ... } as const;`
 * e cattura le coppie key: "value".
 *
 * Exported for unit testing with synthetic fixture strings.
 */
export function parseAgentModelDefaults(src: string): Map<string, string> {
  const blockMatch = src.match(/export const AGENT_MODEL_DEFAULTS\s*=\s*\{([^}]+)\}\s*as const/s);
  if (!blockMatch) {
    throw new Error(
      `[drift-check] Cannot find AGENT_MODEL_DEFAULTS block in agent-constants.ts`
    );
  }
  const block = blockMatch[1];
  const result = new Map<string, string>();
  // Match lines like:   bowie: "qwen3:1.7b",
  for (const m of block.matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) {
    result.set(m[1], m[2]);
  }
  if (result.size === 0) {
    throw new Error("[drift-check] AGENT_MODEL_DEFAULTS parsed 0 entries — check regex");
  }
  return result;
}

// ── 2. Leggi DEFAULT_AGENT_MAP da scripts/thinkcentre/ai-hub/vram-routes.js ─

/**
 * Estrae le chiavi di DEFAULT_AGENT_MAP tramite regex.
 * Cerca il blocco `const DEFAULT_AGENT_MAP = { ... };`
 * e cattura tutte le chiavi (stringhe quotate).
 *
 * Exported for unit testing with synthetic fixture strings.
 */
export function parseDefaultAgentMapKeys(src: string): Set<string> {
  const blockMatch = src.match(/const DEFAULT_AGENT_MAP\s*=\s*\{([^}]+)\}/s);
  if (!blockMatch) {
    throw new Error(
      `[drift-check] Cannot find DEFAULT_AGENT_MAP block in vram-routes.js`
    );
  }
  const block = blockMatch[1];
  const result = new Set<string>();
  // Match lines like:   "qwen3:4b": "Horus",
  for (const m of block.matchAll(/"([^"]+)"\s*:/g)) {
    result.add(m[1]);
  }
  if (result.size === 0) {
    throw new Error("[drift-check] DEFAULT_AGENT_MAP parsed 0 keys — check regex");
  }
  return result;
}

// ── 3. Retired-model blocklist ───────────────────────────────────────────────
//
// Models listed here had coordinators that were later removed. They must NOT
// reappear in DEFAULT_AGENT_MAP or AGENT_MODEL_DEFAULTS — there is no live agent
// to claim them, and a ghost entry would make GET /vram misleading.
//
// Before adding a new entry here, document WHY the coordinator was removed and
// confirm no replacement coordinator picks up the same model name.
export const RETIRED_MODELS: Record<string, string> = {
  // Quebracho was unified into Horus (Task #591). The coordinator process no
  // longer exists; granite4:tiny-h must not be re-added without a matching
  // coordinator entry in server/lib/agent-constants.ts.
  // check-hardcoded-agent-models: ok — retired model registry, no longer in agent-constants.ts
  "granite4:tiny-h": "Quebracho (unified into Horus, Task #591) — no coordinator",
};

// ── 4. Core check logic ──────────────────────────────────────────────────────

export interface RetiredViolation {
  model: string;
  location: string;
  reason: string;
}

export interface MissingEntry {
  agent: string;
  model: string;
}

export interface CheckResult {
  retiredViolations: RetiredViolation[];
  missing: MissingEntry[];
  /** true when any violation or drift was found */
  failed: boolean;
}

/**
 * Core check logic — exported for unit testing.
 *
 * Receives already-parsed data so tests can inject synthetic fixtures without
 * touching the filesystem.
 *
 * @param agentDefaults  Map<agentName, modelString> from AGENT_MODEL_DEFAULTS
 * @param defaultMapKeys Set<modelString>  from DEFAULT_AGENT_MAP
 * @param retiredModels  Record<modelString, reason> (defaults to RETIRED_MODELS)
 */
export function runDriftCheck(
  agentDefaults: Map<string, string>,
  defaultMapKeys: Set<string>,
  retiredModels: Record<string, string> = RETIRED_MODELS
): CheckResult {
  const retiredViolations: RetiredViolation[] = [];

  for (const [model, reason] of Object.entries(retiredModels)) {
    if (defaultMapKeys.has(model)) {
      retiredViolations.push({ model, location: "DEFAULT_AGENT_MAP (vram-routes.js)", reason });
    }
    for (const [, agentModel] of agentDefaults) {
      if (agentModel === model) {
        retiredViolations.push({
          model,
          location: "AGENT_MODEL_DEFAULTS (agent-constants.ts)",
          reason,
        });
      }
    }
  }

  const missing: MissingEntry[] = [];
  for (const [agent, model] of agentDefaults) {
    if (!defaultMapKeys.has(model)) {
      missing.push({ agent, model });
    }
  }

  return {
    retiredViolations,
    missing,
    failed: retiredViolations.length > 0 || missing.length > 0,
  };
}

// ── 5. Confronta e segnala il drift (CLI entry point) ───────────────────────

function main(): void {
  const agentConstantsSrc = fs.readFileSync(agentConstantsPath, "utf8");
  const vramRoutesSrc = fs.readFileSync(vramRoutesPath, "utf8");

  const agentDefaults = parseAgentModelDefaults(agentConstantsSrc);
  const defaultMapKeys = parseDefaultAgentMapKeys(vramRoutesSrc);

  console.log("── AGENT_MODEL_DEFAULTS (server/lib/agent-constants.ts) ──────────────────");
  for (const [agent, model] of agentDefaults) {
    console.log(`  ${agent}: "${model}"`);
  }

  console.log("\n── DEFAULT_AGENT_MAP keys (scripts/thinkcentre/ai-hub/vram-routes.js) ───");
  for (const key of defaultMapKeys) {
    console.log(`  "${key}"`);
  }

  const result = runDriftCheck(agentDefaults, defaultMapKeys, RETIRED_MODELS);

  if (result.retiredViolations.length > 0) {
    console.error(
      "\n❌  RETIRED MODEL RE-INTRODUCED — the following models are retired and must\n" +
      "    not appear in either map. Remove them or add a matching coordinator first.\n"
    );
    for (const { model, location, reason } of result.retiredViolations) {
      console.error(`  model: "${model}"  found in: ${location}`);
      console.error(`    reason: ${reason}`);
    }
  }

  console.log();

  if (result.missing.length > 0) {
    console.error(
      "❌  DRIFT DETECTED — the following models are in AGENT_MODEL_DEFAULTS but missing\n" +
      "    from DEFAULT_AGENT_MAP in vram-routes.js.\n" +
      "    Add the missing entries to DEFAULT_AGENT_MAP so the pre-push fallback\n" +
      "    correctly labels these agents before the api-server pushes its map.\n"
    );
    for (const { agent, model } of result.missing) {
      console.error(`  agent: ${agent}  →  model: "${model}"  ← MISSING from DEFAULT_AGENT_MAP`);
    }
  }

  if (result.failed) {
    process.exit(1);
  }

  console.log("✅  No drift: every model in AGENT_MODEL_DEFAULTS appears in DEFAULT_AGENT_MAP,");
  console.log("    and no retired models have been re-introduced.");
  process.exit(0);
}

// Only run when executed directly (not when imported by tests).
// tsx compiles to CJS so `require.main === module` works correctly.
if (require.main === module) {
  main();
}
