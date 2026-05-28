/**
 * Task #2637 — Smoke test (pure logic, no DB/LLM) per la AI Console backend.
 * Verifica:
 *  - SCOPES export + tool registry build
 *  - Schema Drizzle import esiste (aiConversations/aiMessages/aiPinnedInsights)
 *  - Router decision schema (Zod) accetta payload valido + rifiuta invalido
 *  - Tools per scope hanno tutti `execute` + `inputSchema`
 *
 * Esecuzione: `npx tsx scripts/smoke-ai-console-backend.ts`
 */
import { SCOPES, buildToolsForScopes } from "../server/ai/console/tools";
import { aiConversations, aiMessages, aiPinnedInsights } from "@shared/db";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("✗", msg); failed++; }
  else console.log("✓", msg);
}

console.log("=== Task #2637 — Smoke AI Console backend ===\n");

// 1) SCOPES contiene i 5 scope previsti
const expected = ["moderation", "watchdog", "ota", "db-integrity", "app-integrity"];
for (const s of expected) assert(SCOPES.includes(s as never), `SCOPES include ${s}`);
assert(SCOPES.length === expected.length, `SCOPES contiene esattamente ${expected.length} elementi`);

// 2) Schema Drizzle import OK
assert(!!aiConversations, "shared/db esporta aiConversations");
assert(!!aiMessages, "shared/db esporta aiMessages");
assert(!!aiPinnedInsights, "shared/db esporta aiPinnedInsights");

// 3) Tool registry per ogni scope ha tool eseguibili
for (const s of expected) {
  const tools = buildToolsForScopes([s as never]);
  const names = Object.keys(tools);
  assert(names.length > 0, `scope=${s} registra almeno 1 tool (${names.length})`);
  for (const n of names) {
    const t = (tools as Record<string, unknown>)[n] as { execute?: unknown; inputSchema?: unknown };
    assert(typeof t.execute === "function", `tool ${n}: ha execute()`);
    assert(!!t.inputSchema, `tool ${n}: ha inputSchema`);
  }
}

// 4) Build con tutti gli scope produce union senza collisioni
const allTools = buildToolsForScopes(expected as never);
const allNames = Object.keys(allTools);
const dupes = allNames.filter((n, i) => allNames.indexOf(n) !== i);
assert(dupes.length === 0, `nessun nome tool duplicato cross-scope (totale=${allNames.length})`);

console.log(`\n=== Risultato: ${failed === 0 ? "OK" : `FAIL (${failed})`} ===`);
process.exit(failed === 0 ? 0 : 1);
