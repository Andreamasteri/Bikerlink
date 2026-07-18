// Task #683 — Finalizzatore della modalità SECURITY di Horus.
//
// Questo modulo gestisce:
//   - Il prompt per-file della modalità security (buildSecurityFilePrompt):
//     richiede a Horus di segnalare SOLO vulnerabilità concrete per categoria
//     in formato strutturato corto `[CAT] breve descrizione.` oppure `OK`.
//   - La finalizzazione (finalizeSecurityScan): aggrega i finding per categoria
//     di rischio, assegna severità e salva il report in AppSetting
//     `horus_security_scan_last_report`.
//
// INVARIANTI:
//   * Prompt compatto e risposta corta → numPredict ridotto a 1500 (vs 4000 analisi).
//   * Sola lettura: nessuna scrittura su codice/GitHub/DB oltre all'AppSetting report.
//   * PII redatta, output sensibile soppresso prima del salvataggio.

import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { type FileScanStore } from "./codebase-inventory";
import { storage } from "../../storage";

// Formato risposta corto → budget token ridotto (vs 4000 per analisi/manuale).
export const SECURITY_NOTE_NUM_PREDICT = 1500;

const MAX_FILE_CHARS = 6000;
const REPORT_SETTING_KEY = "horus_security_scan_last_report";

// ── Prompt per-file ───────────────────────────────────────────────────────────

/**
 * Prompt focalizzato sulle categorie di vulnerabilità di sicurezza.
 * Risposta richiesta nel formato strutturato `[CAT] Descrizione breve.`
 * oppure `OK` se non vengono trovate vulnerabilità.
 * Max 5 finding per file per contenere numPredict.
 */
export function buildSecurityFilePrompt(rel: string, content: string): string {
  return `Sei Horus, in modalità SECURITY SCAN (SOLA LETTURA) dell'app BikerLink.
Esamina il file sorgente e segnala SOLO vulnerabilità concrete nelle categorie:
  SQL/cmd/path INJECTION, AUTH_BYPASS, IDOR, MISSING_VALIDATION, DATA_LEAK, SSRF, XSS_SERVER, INSECURE_REF

Regole risposta:
- Per ogni vulnerabilità concreta: una riga [CATEGORIA] Descrizione breve in italiano.
- Max 5 righe totali per file.
- Se non trovi nulla di rilevante: rispondi ESATTAMENTE con la sola parola "OK".
- Non spiegare il codice, non riscrivere, non dare consigli generici.

FILE: ${rel}
\`\`\`
${content.slice(0, MAX_FILE_CHARS)}
\`\`\`

VULNERABILITÀ:`;
}

// ── Aggregazione e finalizzazione ─────────────────────────────────────────────

interface SecurityFinding {
  file: string;
  category: string;
  description: string;
}

// Mappa categoria → severità
const SEVERITY_MAP: Record<string, "Critical" | "High" | "Medium"> = {
  SQL_INJECTION: "Critical",
  CMD_INJECTION: "Critical",
  PATH_INJECTION: "Critical",
  INJECTION: "Critical",
  AUTH_BYPASS: "Critical",
  IDOR: "High",
  SSRF: "High",
  XSS_SERVER: "High",
  INSECURE_REF: "High",
  MISSING_VALIDATION: "Medium",
  DATA_LEAK: "Medium",
  OTHER: "Medium",
};

function normalizeCat(raw: string): string {
  const u = raw.trim().toUpperCase().replace(/[-\s/]+/g, "_");
  if (u.includes("INJECTION") || u.includes("SQL") || u.includes("CMD") || u.includes("PATH_INJ")) {
    if (u.includes("SQL")) return "SQL_INJECTION";
    if (u.includes("CMD") || u.includes("COMMAND")) return "CMD_INJECTION";
    if (u.includes("PATH")) return "PATH_INJECTION";
    return "INJECTION";
  }
  if (u.includes("AUTH")) return "AUTH_BYPASS";
  if (u.includes("IDOR")) return "IDOR";
  if (u.includes("SSRF")) return "SSRF";
  if (u.includes("XSS")) return "XSS_SERVER";
  if (u.includes("VALIDAT")) return "MISSING_VALIDATION";
  if (u.includes("LEAK") || u.includes("DATA")) return "DATA_LEAK";
  if (u.includes("INSECURE")) return "INSECURE_REF";
  return "OTHER";
}

function getSeverity(cat: string): "Critical" | "High" | "Medium" {
  return SEVERITY_MAP[cat] ?? "Medium";
}

/** Analizza le note per-file dello store e produce i finding strutturati. */
function extractFindings(store: FileScanStore): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lineRe = /^\[([^\]]+)\]\s*(.+)$/;
  for (const [file, record] of Object.entries(store)) {
    const note = (record.note ?? "").trim();
    if (!note || note.toUpperCase() === "OK") continue;
    for (const raw of note.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = lineRe.exec(line);
      if (!m) continue;
      const cat = normalizeCat(m[1]);
      const desc = m[2].trim();
      if (!desc) continue;
      findings.push({ file, category: cat, description: desc });
    }
  }
  return findings;
}

/** Raggruppa i finding per severità e categoria. */
function groupBySeverity(
  findings: SecurityFinding[],
): Record<"Critical" | "High" | "Medium", Map<string, SecurityFinding[]>> {
  const result: Record<"Critical" | "High" | "Medium", Map<string, SecurityFinding[]>> = {
    Critical: new Map(),
    High: new Map(),
    Medium: new Map(),
  };
  for (const f of findings) {
    const sev = getSeverity(f.category);
    if (!result[sev].has(f.category)) result[sev].set(f.category, []);
    result[sev].get(f.category)!.push(f);
  }
  return result;
}

/** Produce il report testuale italiano con finding aggregati per severità. */
function buildReport(
  findings: SecurityFinding[],
  filesTotal: number,
  filesSkipped: number,
  filesScanned: number,
  startedAt: string,
): string {
  const groups = groupBySeverity(findings);
  const lines: string[] = [];
  lines.push(`# Horus Security Scan — Report`);
  lines.push(`Data: ${startedAt}`);
  lines.push(
    `File scansionati: ${filesScanned} (${filesTotal} totali, ${filesSkipped} invariati saltati)`,
  );
  lines.push(`Finding totali: ${findings.length}`);
  lines.push("");

  for (const sev of ["Critical", "High", "Medium"] as const) {
    const bySev = groups[sev];
    if (bySev.size === 0) continue;
    const count = [...bySev.values()].reduce((s, arr) => s + arr.length, 0);
    lines.push(`## ${sev} (${count} finding)`);
    for (const [cat, items] of bySev) {
      lines.push(`\n### ${cat}`);
      for (const item of items) {
        lines.push(`- \`${item.file}\`: ${item.description}`);
      }
    }
    lines.push("");
  }

  if (findings.length === 0) {
    lines.push("Nessuna vulnerabilità concreta rilevata nei file ad alto rischio scansionati.");
  }

  return lines.join("\n");
}

/**
 * Finalizza la modalità SECURITY: aggrega i finding per categoria di rischio,
 * assegna severità (Critical/High/Medium) e salva il report testuale in
 * AppSetting `horus_security_scan_last_report`. Ritorna un riassunto per lo stato.
 */
export async function finalizeSecurityScan(
  store: FileScanStore,
  filesTotal: number,
  filesSkipped: number,
): Promise<string> {
  const findings = extractFindings(store);
  const filesScanned = Object.keys(store).length;
  const startedAt = new Date().toISOString();

  const rawReport = buildReport(findings, filesTotal, filesSkipped, filesScanned, startedAt);

  // Sanificazione: redazione PII + filtro sensibile (stessa pipeline dell'analisi).
  const clean = redactPII(rawReport).trim();
  const safe = matchesSensitive(clean) ? "Report soppresso dal filtro di sicurezza." : clean;

  // Salva in AppSetting come JSONB (memory: appsetting-valuejson).
  await storage.upsertAppSetting(REPORT_SETTING_KEY, undefined, {
    report: safe,
    generatedAt: startedAt,
    findingsCount: findings.length,
    filesScanned,
    filesTotal,
    filesSkipped,
  });

  const critCount = findings.filter((f) => getSeverity(f.category) === "Critical").length;
  const highCount = findings.filter((f) => getSeverity(f.category) === "High").length;
  const medCount = findings.filter((f) => getSeverity(f.category) === "Medium").length;

  return (
    `Security scan completato: ${filesScanned}/${filesTotal} file scansionati ` +
    `(${filesSkipped} invariati saltati). ` +
    `Finding: ${critCount} Critical, ${highCount} High, ${medCount} Medium. ` +
    `Report salvato in AppSetting \`${REPORT_SETTING_KEY}\`.`
  );
}
