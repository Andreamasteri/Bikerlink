/**
 * watch-diagnostics.ts
 *
 * Gira in loop continuo: ogni 30 secondi controlla se sono arrivati nuovi
 * report diagnostici (reviewedByAgent IS NULL) e li stampa su stdout in
 * formato strutturato, così `refresh_all_logs` li cattura in tempo reale.
 *
 * Usa lo stesso formato di dump-diagnostic-report.ts ma si auto-riavvia
 * senza uscire, rendendo visibile ogni nuova diagnostica appena arriva.
 */

import { desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { diagnosticReports } from "../shared/db/diagnostic";
import { users } from "../shared/db/users";
import type { DiagnosticSummary, DiagnosticTestResult } from "../shared/db/diagnostic";

const POLL_INTERVAL_MS = 30_000;

const STATUS_ICON: Record<string, string> = {
  PASS: "✅",
  FAIL: "❌",
  WARN: "⚠️ ",
  SKIP: "⏭️ ",
};

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
    for (const r of results.filter(s => s.section === section)) {
      const icon = STATUS_ICON[r.status] ?? r.status;
      const msg = r.message ? `  → ${r.message}` : "";
      lines.push(`    ${icon} [${r.status}] ${r.name} (${r.durationMs}ms)${msg}`);
    }
  }
  return lines.join("\n");
}

async function checkNewReports(): Promise<void> {
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
    .where(isNull(diagnosticReports.reviewedByAgent))
    .orderBy(desc(diagnosticReports.runAt))
    .limit(10);

  if (rows.length === 0) return;

  const ids = rows.map(r => r.id);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🆕 NUOVA DIAGNOSTICA  (${rows.length} non ancora visti)`);
  console.log(`  Rilevato alle: ${new Date().toISOString()}`);
  console.log(`${"═".repeat(60)}`);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const summary = r.summary as DiagnosticSummary | null;
    const results = r.results as DiagnosticTestResult[] | null;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`  Report ${i + 1} / ${rows.length}`);
    console.log(`${"─".repeat(60)}`);
    console.log(`  ID:          ${r.id}`);
    console.log(`  Utente:      ${r.nickname ?? r.userId ?? "—"}`);
    console.log(`  Trigger:     ${r.triggeredBy}`);
    console.log(`  App version: ${r.appVersion ?? "—"}`);
    console.log(`  Piattaforma: ${r.platform ?? "—"}`);
    console.log(`  Dispositivo: ${r.deviceModel ?? "—"}`);
    console.log(`  RunAt:       ${r.runAt.toISOString()}`);
    if (r.sentryEventId) console.log(`  Sentry ID:   ${r.sentryEventId}`);

    if (summary) {
      console.log("\n  ── Sommario ──");
      console.log(formatSummary(summary));
    }

    if (results && results.length > 0) {
      console.log("\n  ── Risultati ──");
      console.log(formatResults(results));
    }
  }

  console.log(`\n${"═".repeat(60)}\n`);

  await db
    .update(diagnosticReports)
    .set({ reviewedByAgent: new Date() })
    .where(inArray(diagnosticReports.id, ids));
}

async function main() {
  console.log(`[watch-diagnostics] Avviato — polling ogni ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[watch-diagnostics] In attesa di nuovi report diagnostici...\n`);

  while (true) {
    try {
      await checkNewReports();
    } catch (e) {
      console.error("[watch-diagnostics] Errore durante il check:", e);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch(err => {
  console.error("[watch-diagnostics] Errore fatale:", err);
  process.exit(1);
});
