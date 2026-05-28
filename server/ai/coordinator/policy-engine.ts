// Task #2649 — Policy Engine YAML hot-reload per il Layer AI Coordinato.
// Niente eval, niente JS arbitrario: regole dichiarative validate via Zod.
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  PolicyFileSchema,
  PolicyRuleSchema,
  SEVERITY_RANK,
  type AiEventInput,
  type PolicyEvaluation,
  type PolicyFile,
  type PolicyRule,
  type Severity,
} from "./types";

const DEFAULT_FILE = path.resolve(process.cwd(), "config/ai-policies.yaml");

let state: {
  file: string;
  loadedAt: string;
  source: "file" | "default";
  rules: PolicyRule[];
  lastError: string | null;
} = {
  file: DEFAULT_FILE,
  loadedAt: new Date(0).toISOString(),
  source: "default",
  rules: [],
  lastError: null,
};

// Fallback rules quando il file non esiste: niente regole → ALLOW everywhere.
const DEFAULT_RULES: PolicyRule[] = [
  PolicyRuleSchema.parse({
    id: "builtin-allow",
    name: "Builtin allow (no policy file)",
    priority: 0,
    when: {},
    then: { action: "ALLOW", message: "" },
  }),
];

function sortByPriorityDesc(rules: PolicyRule[]): PolicyRule[] {
  return [...rules].sort((a, b) => b.priority - a.priority);
}

export function loadPolicies(filePath?: string): { ok: boolean; count: number; error: string | null } {
  const file = path.resolve(filePath ?? DEFAULT_FILE);
  try {
    if (!fs.existsSync(file)) {
      state = {
        file,
        loadedAt: new Date().toISOString(),
        source: "default",
        rules: DEFAULT_RULES,
        lastError: null,
      };
      return { ok: true, count: DEFAULT_RULES.length, error: null };
    }
    const raw = fs.readFileSync(file, "utf8");
    const parsed = yaml.load(raw);
    const file_ = PolicyFileSchema.parse(parsed ?? {}) as PolicyFile;
    state = {
      file,
      loadedAt: new Date().toISOString(),
      source: "file",
      rules: sortByPriorityDesc(file_.rules),
      lastError: null,
    };
    return { ok: true, count: file_.rules.length, error: null };
  } catch (err) {
    const message = (err as Error).message ?? "policy load failed";
    state = {
      ...state,
      lastError: message,
    };
    // Mantieni le regole precedenti se erano caricate; altrimenti fallback default.
    if (state.rules.length === 0) state.rules = DEFAULT_RULES;
    return { ok: false, count: state.rules.length, error: message };
  }
}

export function getPolicyStatus() {
  return {
    file: state.file,
    loadedAt: state.loadedAt,
    source: state.source,
    rulesCount: state.rules.length,
    rules: state.rules,
    lastError: state.lastError,
  };
}

function matchWhen(rule: PolicyRule, event: { aiName: string; eventType: string; severity: Severity }): boolean {
  const w = rule.when;
  if (w.aiName && w.aiName !== event.aiName) return false;
  if (w.eventType && w.eventType !== event.eventType) return false;
  if (w.severityGte && SEVERITY_RANK[event.severity] < SEVERITY_RANK[w.severityGte]) return false;
  return true;
}

/** Valuta un singolo evento (es. lato `emit`). Esclude regole con conflictType. */
export function evaluateEvent(event: AiEventInput): PolicyEvaluation {
  ensureLoaded();
  const sev = event.severity ?? "info";
  const ctx = { aiName: event.aiName, eventType: event.eventType, severity: sev };
  for (const rule of state.rules) {
    if (rule.conflictType) continue;
    if (matchWhen(rule, ctx)) {
      return {
        matched: true,
        ruleId: rule.id,
        action: rule.then.action,
        message: rule.then.message ?? "",
        rationale: `rule:${rule.id} (${rule.name})`,
      };
    }
  }
  return {
    matched: false,
    ruleId: null,
    action: "ALLOW",
    message: "",
    rationale: "no rule matched (default ALLOW)",
  };
}

/**
 * Valuta una coppia di eventi in conflitto.
 * Considera solo regole con `conflictType` che matcha (incluso wildcard "*").
 * Per ogni regola in ordine di priorità, verifica se `when` matcha A oppure B:
 * il vincitore è il primo evento che combacia.
 */
export function evaluateConflict(
  conflictType: string,
  a: AiEventInput,
  b: AiEventInput,
): PolicyEvaluation & { winner: "A" | "B" | "none" } {
  ensureLoaded();
  const aCtx = { aiName: a.aiName, eventType: a.eventType, severity: a.severity ?? "info" };
  const bCtx = { aiName: b.aiName, eventType: b.eventType, severity: b.severity ?? "info" };
  for (const rule of state.rules) {
    if (!rule.conflictType) continue;
    if (rule.conflictType !== "*" && rule.conflictType !== conflictType) continue;
    const aMatch = matchWhen(rule, aCtx);
    const bMatch = matchWhen(rule, bCtx);
    if (!aMatch && !bMatch) continue;
    const winner: "A" | "B" | "none" = rule.then.action === "BLOCK"
      ? "none"
      : aMatch
        ? "A"
        : "B";
    return {
      matched: true,
      ruleId: rule.id,
      action: rule.then.action,
      message: rule.then.message ?? "",
      rationale: `rule:${rule.id} (${rule.name}) → ${rule.then.action} winner=${winner}`,
      winner,
    };
  }
  return {
    matched: false,
    ruleId: null,
    action: "BLOCK",
    message: "Conflitto non risolto da policy: attendere decisione admin",
    rationale: "no conflict rule matched (default BLOCK)",
    winner: "none",
  };
}

function ensureLoaded(): void {
  if (state.loadedAt === new Date(0).toISOString()) {
    loadPolicies();
  }
}

// Eager load all'import — best effort.
loadPolicies();
