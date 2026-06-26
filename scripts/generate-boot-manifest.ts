// Task #4979 — generatore del manifest BootGate.
//
// Produce .local/boot-reports/ota-{N}-boot-map.md a partire dalla singola fonte
// di verità lib/boot-gate-steps.ts. Il manifest ha due sezioni:
//   - Sezione A: spiegazione in italiano piano (per l'utente non tecnico).
//   - Sezione B: dettaglio tecnico per step (per l'agente che fa il bisect).
//
// Uso:
//   npx tsx scripts/generate-boot-manifest.ts --ota 198
//   npx tsx scripts/generate-boot-manifest.ts            (auto: HWM+1)
//
// È node-safe: importa solo lib/boot-gate-steps.ts (nessun import RN).

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { BOOT_GATE_STEPS, PROVIDER_STEP_IDS } from "../lib/boot-gate-steps";

function resolveOtaNumber(): number {
  const argIdx = process.argv.indexOf("--ota");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    const n = parseInt(process.argv[argIdx + 1], 10);
    if (!Number.isNaN(n)) return n;
  }
  if (process.env.NEXT_OTA) {
    const n = parseInt(process.env.NEXT_OTA, 10);
    if (!Number.isNaN(n)) return n;
  }
  // Fallback: high-water mark + 1.
  const hwmFile = join(process.cwd(), "logs", "ota-hwm.txt");
  if (existsSync(hwmFile)) {
    const raw = readFileSync(hwmFile, "utf8").trim();
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return n + 1;
  }
  return 0;
}

// Escapa il carattere pipe così non rompe le celle della tabella Markdown.
function cell(text: string): string {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildSectionA(): string {
  const lines: string[] = [];
  lines.push("## Sezione A — Come si avvia l'app (in parole semplici)");
  lines.push("");
  lines.push(
    "Quando apri BikerLink, l'app si accende per gradini, uno dopo l'altro. " +
      "Il BootGate ti fa vedere ogni gradino e ti chiede «questo ha funzionato?». " +
      "Rispondendo Sì/No trovi esattamente il gradino dove qualcosa si rompe.",
  );
  lines.push("");
  lines.push("Ecco i gradini, nell'ordine in cui avvengono:");
  lines.push("");
  lines.push("| #ordine | Nome servizio | Cosa fa | Blocca l'avvio? |");
  lines.push("| ---: | --- | --- | :---: |");
  BOOT_GATE_STEPS.forEach((step, i) => {
    lines.push(
      `| ${i + 1} | ${cell(step.label)} | ${cell(step.description)} | ${step.blocksBoot ? "Sì" : "No"} |`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

function buildSectionB(): string {
  const lines: string[] = [];
  lines.push("## Sezione B — Dettaglio tecnico per step (per l'agente)");
  lines.push("");
  for (const step of BOOT_GATE_STEPS) {
    lines.push(`### ${step.originalOrder}. ${step.label} \`(${step.id})\``);
    lines.push("");
    lines.push(`- **kind**: \`${step.kind}\`${step.blocksBoot ? " · blocca il boot" : " · non blocca il boot"}`);
    lines.push(`- **Modulo**: ${step.module}`);
    lines.push(`- **Legge da**: ${step.reads}`);
    lines.push(`- **Scrive su**: ${step.writes}`);
    lines.push(`- **Dipende da**: ${step.dependsOn}`);
    lines.push(`- **Chi dipende da lui**: ${step.dependedBy}`);
    lines.push(`- **Timeout**: ${step.timeout}`);
    lines.push(`- **Perché è in questa posizione**: ${step.positionReason}`);
    lines.push(`- **Rischi noti**: ${step.knownRisks}`);
    lines.push("");
  }
  return lines.join("\n");
}

function main(): void {
  const ota = resolveOtaNumber();
  const otaLabel = ota > 0 ? String(ota) : "next";
  const now = new Date().toISOString();

  const header: string[] = [];
  header.push(`# BootGate — Mappa dell'avvio · OTA ${otaLabel}`);
  header.push("");
  header.push(`> Generato automaticamente da \`scripts/generate-boot-manifest.ts\` il ${now}.`);
  header.push(`> Fonte: \`lib/boot-gate-steps.ts\` — ${BOOT_GATE_STEPS.length} step totali, ` +
    `${PROVIDER_STEP_IDS.length} dei quali sono provider.`);
  header.push("");
  header.push(
    "Questo documento è la *fotografia* della sequenza di boot al momento della " +
      `pubblicazione dell'OTA ${otaLabel}. Confrontando le mappe di due OTA diverse ` +
      "si vede cosa è cambiato nell'ordine di avvio tra una release e l'altra.",
  );
  header.push("");

  const content = [
    header.join("\n"),
    buildSectionA(),
    buildSectionB(),
  ].join("\n");

  const outDir = join(process.cwd(), ".local", "boot-reports");
  const outFile = join(outDir, `ota-${otaLabel}-boot-map.md`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, content, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[boot-manifest] scritto ${outFile} (${BOOT_GATE_STEPS.length} step)`);
}

main();
