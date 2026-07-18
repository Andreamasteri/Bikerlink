/**
 * BikerLink — Horus Patch Scan (orchestration entry point)
 *
 * Scansiona sistematicamente il codebase BikerLink alla ricerca di "cerotti"
 * (patch temporanee, workaround, soppressioni di errori, band-aid accumulati
 * nel tempo) e li invia a Horus per una classificazione ragionata.
 *
 * Uso:
 *   npx tsx scripts/horus-patch-scan.ts
 *   npx tsx scripts/horus-patch-scan.ts --dry-run      # stampa i chunk senza chiamare Horus
 *   npx tsx scripts/horus-patch-scan.ts --no-propose   # salta la proposta task automatica
 *
 * Output:
 *   logs/horus-patch-scan-<timestamp>.md  — report classificato
 *   .local/tasks/horus-<slug>.md          — file plan per ogni trovato CRITICO/ALTO
 *
 * Secret/env:
 *   HORUS_OLLAMA_URL    — URL base di Horus via Cloudflare Tunnel (obbligatorio)
 *   HORUS_OLLAMA_MODEL  — modello (default "qwen3:4b")
 *   HORUS_OLLAMA_TOKEN  — opzionale, Bearer token
 */

import fs from "fs";
import path from "path";
import {
  ROOT,
  DEFAULT_MODEL,
  REQUEST_TIMEOUT_MS,
  collectCandidates,
  deduplicateAndEnrich,
  formatHit,
  buildChunks,
  buildChunkPrompt,
  callHorus,
  parseClassificationTable,
  loadBacklog,
  buildProposals,
  type ClassifiedHit,
} from "./horus-patch-scan.core";

// ─── CLI args ──────────────────────────────────────────────────────────────────

const IS_DRY_RUN = process.argv.includes("--dry-run");
const NO_PROPOSE = process.argv.includes("--no-propose");

// ─── Report builder ────────────────────────────────────────────────────────────

function tableSection(hits: ClassifiedHit[], label: string, emoji: string): string {
  if (hits.length === 0) return `### ${emoji} ${label} (0)\n\n_Nessun trovato in questa categoria._\n`;
  const rows = hits
    .map((h) => `| ${h.severity} | ${h.fileRef} | ${h.pattern} | ${h.reason} |`)
    .join("\n");
  return (
    `### ${emoji} ${label} (${hits.length})\n\n` +
    `| Severità | File:Riga | Pattern | Motivazione Horus |\n` +
    `|----------|-----------|---------|-------------------|\n` +
    rows + "\n"
  );
}

function buildReport(
  model: string,
  totalCandidates: number,
  totalFound: number,
  totalChunks: number,
  bySeverity: Record<string, ClassifiedHit[]>,
  ts: string,
): string {
  return (
    `# Horus Patch Scan — ${ts}\n\n` +
    `- Modello: \`${model}\`\n` +
    `- Candidati grep: ${totalCandidates}\n` +
    `- Classificazioni ricevute: ${totalFound}\n` +
    `- Chunk processati: ${totalChunks}\n\n` +
    `## Riepilogo\n\n` +
    `| Categoria | Conteggio |\n` +
    `|-----------|----------|\n` +
    `| 🔴 CRITICO | ${bySeverity.CRITICO.length} |\n` +
    `| 🟠 ALTO | ${bySeverity.ALTO.length} |\n` +
    `| 🟡 MEDIO | ${bySeverity.MEDIO.length} |\n` +
    `| 🟢 BASSO | ${bySeverity.BASSO.length} |\n\n` +
    `## Trovati Classificati\n\n` +
    tableSection(bySeverity.CRITICO, "CRITICO", "🔴") + "\n" +
    tableSection(bySeverity.ALTO, "ALTO", "🟠") + "\n" +
    tableSection(bySeverity.MEDIO, "MEDIO", "🟡") + "\n" +
    tableSection(bySeverity.BASSO, "BASSO", "🟢") + "\n"
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = process.env.HORUS_OLLAMA_URL?.trim() || process.env.OLLAMA_URL?.trim();
  const model = process.env.HORUS_OLLAMA_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.HORUS_OLLAMA_TOKEN?.trim() || process.env.OLLAMA_TOKEN?.trim() || undefined;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Horus Patch Scan] Scansione cerotti e workaround");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Modello  : ${model}`);
  if (IS_DRY_RUN) console.log("  Modalità : DRY-RUN (nessuna chiamata a Horus)");
  if (NO_PROPOSE) console.log("  Proposta : disabilitata (--no-propose)");
  console.log("");

  // ── Step 1: Raccolta candidati ──
  console.log("  ⏳ Step 1: grep multi-pattern...");
  const rawHits = collectCandidates();
  console.log(`  🔍 Trovati grezzi: ${rawHits.length}`);

  // ── Step 2: Deduplicazione e arricchimento ──
  console.log("  ⏳ Step 2: deduplicazione e arricchimento contesto...");
  const enriched = deduplicateAndEnrich(rawHits);
  console.log(`  🔍 Trovati unici: ${enriched.length}`);

  // Salva candidati raw in /tmp per debug
  try {
    const rawText = enriched.map(formatHit).join("\n");
    fs.writeFileSync("/tmp/patch-candidates.txt", rawText, "utf8");
    console.log("  💾 Candidati grezzi: /tmp/patch-candidates.txt");
  } catch {
    // Non fatale
  }

  // ── Step 3: Chunking ──
  console.log("  ⏳ Step 3: chunking...");
  const chunks = buildChunks(enriched);
  console.log(`  📦 Chunk da inviare a Horus: ${chunks.length}`);

  if (chunks.length === 0) {
    console.log("\n  ✅ Nessun candidato trovato. Il codebase è pulito!\n");
    return;
  }

  // ── DRY RUN ──
  if (IS_DRY_RUN) {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  CHUNK ANTEPRIMA (dry-run — Horus NON viene chiamato)");
    console.log("════════════════════════════════════════════════════════════\n");
    for (let i = 0; i < chunks.length; i++) {
      console.log(`\n──── CHUNK ${i + 1}/${chunks.length} ────\n`);
      console.log(chunks[i].slice(0, 2000) + (chunks[i].length > 2000 ? "\n[...troncato per dry-run]" : ""));
    }
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  Totale trovati unici: ${enriched.length}`);
    console.log(`  Chunk: ${chunks.length}`);
    console.log("════════════════════════════════════════════════════════════");
    return;
  }

  if (!baseUrl) {
    console.error(
      "\n❌ HORUS_OLLAMA_URL non impostato.\n" +
      "   Imposta il secret HORUS_OLLAMA_URL con l'URL di Horus (ThinkCentre).\n",
    );
    process.exitCode = 1;
    return;
  }

  // ── Step 4: Classificazione Horus (un chunk alla volta) ──
  console.log(`\n  ⏳ Step 4: classificazione Horus (${chunks.length} chunk, timeout ${REQUEST_TIMEOUT_MS / 1000}s/chunk)...\n`);

  const allClassified: ClassifiedHit[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkPrompt = buildChunkPrompt(i, chunks.length, chunks[i]);
    process.stdout.write(`  [${i + 1}/${chunks.length}] Invio chunk... `);

    try {
      const raw = await callHorus(baseUrl, model, token, chunkPrompt);
      const parsed = parseClassificationTable(raw);
      allClassified.push(...parsed);
      console.log(`✅ ${parsed.length} classificazioni`);
    } catch (err) {
      const e = err as Error;
      console.log(`❌ ERRORE: ${e.message.slice(0, 200)}`);
      console.warn(`  ⚠️  Chunk ${i + 1} saltato — classificazioni perse per questo blocco.`);
    }
  }

  console.log(`\n  📊 Classificazioni totali: ${allClassified.length}`);

  // ── Contatori per categoria ──
  const bySeverity: Record<string, ClassifiedHit[]> = {
    CRITICO: [],
    ALTO: [],
    MEDIO: [],
    BASSO: [],
  };
  for (const h of allClassified) {
    if (bySeverity[h.severity]) bySeverity[h.severity].push(h);
  }

  console.log(`  🔴 CRITICO: ${bySeverity.CRITICO.length}`);
  console.log(`  🟠 ALTO   : ${bySeverity.ALTO.length}`);
  console.log(`  🟡 MEDIO  : ${bySeverity.MEDIO.length}`);
  console.log(`  🟢 BASSO  : ${bySeverity.BASSO.length}`);

  // ── Step 5: Genera report ──
  const ts = new Date().toISOString();
  const tsSafe = ts.replace(/[:.]/g, "-");
  const outPath = path.join(ROOT, "logs", `horus-patch-scan-${tsSafe}.md`);
  const reportContent = buildReport(model, enriched.length, allClassified.length, chunks.length, bySeverity, ts);

  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    fs.writeFileSync(outPath, reportContent, "utf8");
  } catch (_err) {
    const fallback = `/tmp/horus-patch-scan-${tsSafe}.md`;
    try {
      fs.writeFileSync(fallback, reportContent, "utf8");
      console.warn(`\n  ⚠️  Salvato in fallback: ${fallback}`);
    } catch {
      console.error("  ❌ Impossibile salvare il report.");
    }
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  REPORT");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(reportContent);
  console.log(`\n  💾 Report salvato in: ${outPath}`);
  console.log("════════════════════════════════════════════════════════════");

  // ── Step 6: Proposta task automatica per CRITICO e ALTO ──
  if (NO_PROPOSE) {
    console.log("\n  ⏭️  Proposta task saltata (--no-propose).\n");
    return;
  }

  const toPropose = [...bySeverity.CRITICO, ...bySeverity.ALTO];
  if (toPropose.length === 0) {
    console.log("\n  ✅ Nessun trovato CRITICO/ALTO — nessun task da proporre.\n");
    return;
  }

  console.log(`\n  ⏳ Proposta task per ${toPropose.length} trovati CRITICO/ALTO...\n`);

  const backlog = loadBacklog();
  console.log(`  📋 Backlog attivo: ${backlog.length} task`);

  const { proposed, skippedDup } = buildProposals(toPropose, backlog);

  // Manifest compatibile con horus-propose-tasks.ts
  const manifest = {
    generatedAt: new Date().toISOString(),
    reportPath: outPath,
    scanType: "patch-scan",
    hasArchitectReview: false,
    architectFormatValid: true,
    tasks: proposed.map((t) => ({
      title: t.title,
      priority: t.severity === "CRITICO" ? "alta" : "media",
      filePath: path.relative(ROOT, t.filePath),
      slug: t.slug,
    })),
    skipped: skippedDup,
  };

  const manifestPath = path.join(ROOT, "logs", "horus-tasks-pending.json");
  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch {
    // Non fatale
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  RIEPILOGO PROPOSTA TASK");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  ✅ Task pronti da proporre : ${proposed.length}`);
  console.log(`  ⏭️  Task saltati (duplicati): ${skippedDup.length}`);
  console.log(`  💾 Report: ${outPath}`);
  if (proposed.length > 0) {
    console.log("\n  File plan generati:");
    for (const t of proposed) {
      console.log(`    • .local/tasks/horus-${t.slug}.md  [${t.severity}]  "${t.title}"`);
    }
    console.log(
      "\n  ➡️  Per proporli nel pannello Replit, chiedi all'agente: \"Proponi i task Horus pendenti\".\n",
    );
  }
}

main().catch((err) => {
  console.error("[horus-patch-scan] Errore inatteso:", err);
  process.exitCode = 1;
});
