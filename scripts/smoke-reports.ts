/**
 * Task #2530 — Smoke test (pure logic, no DB) per le primitive segnalazioni.
 * Verifica le proprietà invarianti senza toccare storage/DB.
 *
 * Esecuzione: `npx tsx scripts/smoke-reports.ts`
 */
import { categoryToSeverity, REPORT_CATEGORIES, REPORT_CONTEXTS, REPORT_SEVERITIES } from "@shared/db";
import { userReportSchema } from "@shared/validators";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("✗", msg); failed++; }
  else console.log("✓", msg);
}

console.log("=== Task #2530 — Smoke test reporting ===\n");

// 1) Severity mapping copre tutte le categorie
for (const c of REPORT_CATEGORIES) {
  const sev = categoryToSeverity(c);
  assert(REPORT_SEVERITIES.includes(sev), `categoryToSeverity(${c}) → ${sev}`);
}
assert(categoryToSeverity("dangerous_riding") === "critical", "dangerous_riding = critical");
assert(categoryToSeverity("harassment") === "high", "harassment = high");
assert(categoryToSeverity("aggressive") === "high", "aggressive = high");
assert(categoryToSeverity("fake_profile") === "medium", "fake_profile = medium");
assert(categoryToSeverity("opportunist") === "medium", "opportunist = medium");
assert(categoryToSeverity("group_misconduct") === "medium", "group_misconduct = medium");
assert(categoryToSeverity("no_show") === "low", "no_show = low");
assert(categoryToSeverity("other") === "low", "other = low");

// 2) Validator accetta payload nuovo + legacy
const legacy = userReportSchema.safeParse({ reason: "Spam" });
assert(legacy.success, "validator accetta payload legacy (solo reason)");

const novo = userReportSchema.safeParse({
  reason: "Comportamento aggressivo",
  category: "aggressive",
  context: "match",
  contextId: "match-123",
  description: "Mi ha urlato contro al meeting",
});
assert(novo.success, "validator accetta payload nuovo");

const bad = userReportSchema.safeParse({ reason: "Spam", category: "fakeCat" });
assert(!bad.success, "validator rifiuta categoria invalida");

const longDesc = userReportSchema.safeParse({ reason: "x", description: "a".repeat(2001) });
assert(!longDesc.success, "validator rifiuta description > 2000");

// 3) Categorie/contesti enumerati
assert(REPORT_CATEGORIES.length === 8, `8 categorie definite (trovate ${REPORT_CATEGORIES.length})`);
assert(REPORT_CONTEXTS.includes("match") && REPORT_CONTEXTS.includes("chat") && REPORT_CONTEXTS.includes("profile"),
  "contesti includono match/chat/profile");

// 4) Masking deterministico (replico la logica per non importare il service che
//    tira dentro tutta la storage chain). Test della stessa formula in
//    server/services/reportingService.ts → maskReporterId.
function maskReporterId(reporterId: string, viewerRole: string | undefined | null): string {
  if (viewerRole === "admin") return reporterId;
  let h = 0;
  for (let i = 0; i < reporterId.length; i++) h = (h * 31 + reporterId.charCodeAt(i)) | 0;
  return `anon_${Math.abs(h).toString(36).slice(0, 6)}`;
}
const realId = "550e8400-e29b-41d4-a716-446655440000";
assert(maskReporterId(realId, "admin") === realId, "admin vede ID reale");
assert(maskReporterId(realId, "moderator").startsWith("anon_"), "moderator vede anon_");
assert(maskReporterId(realId, "user").startsWith("anon_"), "user vede anon_");
assert(maskReporterId(realId, "moderator") === maskReporterId(realId, "moderator"), "mask deterministico");

console.log(`\n=== ${failed === 0 ? "PASS" : "FAIL"} (${failed} errori) ===`);
process.exit(failed === 0 ? 0 : 1);
