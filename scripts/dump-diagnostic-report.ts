/**
 * dump-diagnostic-report.ts
 *
 * Scarica dal DB gli ultimi N report diagnostici e li stampa su stdout
 * in formato testo strutturato, così `refresh_all_logs` li cattura
 * insieme agli altri log dei workflow.
 *
 * Uso:
 *   npx tsx scripts/dump-diagnostic-report.ts            # ultimo report
 *   npx tsx scripts/dump-diagnostic-report.ts --limit 3  # ultimi 3 report
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../server/db";
import { diagnosticReports } from "../shared/db/diagnostic";
import { users } from "../shared/db/users";
import type { DiagnosticSummary, DiagnosticTestResult } from "../shared/db/diagnostic";

const STATUS_ICON: Record<string, string> = {
  PASS: "✅",
  FAIL: "❌",
  WARN: "⚠️ ",
  SKIP: "⏭️ ",
};

function parseLimit(): number {
  const idx = process.argv.indexOf("--limit");
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return 1;
}

function formatSummary(summary: DiagnosticSummary): string {
  return [
    `  PASS:    ${summary.passed}`,
    `  FAIL:    ${summary.failed}`,
    `  WARN:    ${summary.warned}`,
    `  SKIP:    ${summary.skipped}`,
    `  Totale:  ${summary.totalTests}`,
    `  Durata:  ${summary.durationMs} ms`,
  ].join("\n");
}

function formatResults(results: DiagnosticTestResult[]): string {
  const sections = [...new Set(results.map(r => r.section))];
  const lines: string[] = [];

  for (const section of sections) {
    lines.push(`\n  ── ${section} ──`);
    const sectionResults = results.filter(r => r.section === section);
    for (const r of sectionResults) {
      const icon = STATUS_ICON[r.status] ?? r.status;
      const msg = r.message ? `  → ${r.message}` : "";
      lines.push(`    ${icon} [${r.status}] ${r.name} (${r.durationMs}ms)${msg}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const limit = parseLimit();

  const rows = await db
    .select({
      id: diagnosticReports.id,
      userId: diagnosticReports.userId,
      nickname: users.nickname,
      triggeredBy: diagnosticReports.triggeredBy,
      appVersion: diagnosticReports.appVersion,
      platform: diagnosticReports.platform,
      deviceModel: diagnosticReports.deviceModel,
      runAt: diagnosticReports.runAt,
      sentryEventId: diagnosticReports.sentryEventId,
      summary: diagnosticReports.summary,
      results: diagnosticReports.results,
    })
    .from(diagnosticReports)
    .leftJoin(users, eq(diagnosticReports.userId, users.id))
    .orderBy(desc(diagnosticReports.runAt))
    .limit(limit);

  if (rows.length === 0) {
    console.log("Nessun report diagnostico trovato nel DB.");
    process.exit(0);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  DIAGNOSTIC REPORT DUMP  (${rows.length} report)`);
  console.log(`${"═".repeat(60)}`);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const summary = r.summary as DiagnosticSummary | null;
    const results = r.results as DiagnosticTestResult[] | null;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`  Report ${i + 1} / ${rows.length}`);
    console.log(`${"─".repeat(60)}`);
    console.log(`  ID:          ${r.id}`);
    console.log(`  UserId:      ${r.userId ?? "—"}`);
    console.log(`  Nickname:    ${r.nickname ?? "—"}`);
    console.log(`  Trigger:     ${r.triggeredBy}`);
    console.log(`  App version: ${r.appVersion ?? "—"}`);
    console.log(`  Platform:    ${r.platform ?? "—"}`);
    console.log(`  Device:      ${r.deviceModel ?? "—"}`);
    console.log(`  RunAt:       ${r.runAt.toISOString()}`);
    if (r.sentryEventId) {
      console.log(`  Sentry ID:   ${r.sentryEventId}`);
    }

    if (summary) {
      console.log("\n  ── Sommario ──");
      console.log(formatSummary(summary));
    }

    if (results && results.length > 0) {
      console.log("\n  ── Risultati ──");
      console.log(formatResults(results));
    } else {
      console.log("\n  (nessun risultato dettagliato)");
    }
  }

  console.log(`\n${"═".repeat(60)}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("[dump-diagnostic-report] Errore:", err);
  process.exit(1);
});
