#!/usr/bin/env tsx
/**
 * BikerLink — Horus Patch Scan (resumable)
 *
 * Variante riprendibile del patch-scan: salva ogni risultato di chunk in
 * /tmp/patch-scan-state/ e può essere invocata più volte fino a completare
 * tutti i chunk. Utile quando il timeout della shell non permette un run
 * unico di 12+ minuti.
 *
 * Uso:
 *   npx tsx scripts/horus-patch-scan-resume.ts           # processa chunk pendenti
 *   npx tsx scripts/horus-patch-scan-resume.ts --report  # assembla il report finale
 *   npx tsx scripts/horus-patch-scan-resume.ts --reset   # cancella lo stato e ricomincia
 *
 * Lo stato è salvato in /tmp/patch-scan-state/:
 *   chunks.json        — elenco degli enriched hit serializzati
 *   result-N.json      — classificazione Horus per il chunk N
 *
 * Quando tutti i chunk sono completati, genera automaticamente il report.
 */

import fs from "fs";
import path from "path";
import {
  ROOT,
  DEFAULT_MODEL,
  collectCandidates,
  deduplicateAndEnrich,
  buildChunks,
  buildChunkPrompt,
  callHorus,
  parseClassificationTable,
  loadBacklog,
  buildProposals,
  type ClassifiedHit,
  type EnrichedHit,
} from "./horus-patch-scan.core";

// ─── Configurazione ────────────────────────────────────────────────────────────

const STATE_DIR = "/tmp/patch-scan-state";
const CHUNKS_FILE = path.join(STATE_DIR, "chunks.json");
const MAX_RUNTIME_MS = 240_000; // 4 minuti di guardia (ShellExec max 5 min)

const IS_REPORT = process.argv.includes("--report");
const IS_RESET = process.argv.includes("--reset");
const NO_PROPOSE = process.argv.includes("--no-propose");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resultFile(i: number): string {
  return path.join(STATE_DIR, `result-${i}.json`);
}

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function saveChunks(chunks: string[], hits: EnrichedHit[]): void {
  fs.writeFileSync(CHUNKS_FILE, JSON.stringify({ chunks, hits }), "utf8");
}

function loadChunks(): { chunks: string[]; hits: EnrichedHit[] } | null {
  if (!fs.existsSync(CHUNKS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHUNKS_FILE, "utf8")) as { chunks: string[]; hits: EnrichedHit[] };
  } catch {
    return null;
  }
}

function saveResult(i: number, classified: ClassifiedHit[]): void {
  fs.writeFileSync(resultFile(i), JSON.stringify(classified), "utf8");
}

function loadResult(i: number): ClassifiedHit[] | null {
  const f = resultFile(i);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as ClassifiedHit[];
  } catch {
    return null;
  }
}

function pendingChunks(total: number): number[] {
  const pending: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!fs.existsSync(resultFile(i))) pending.push(i);
  }
  return pending;
}

// ─── Report builder (stesso di horus-patch-scan.ts) ──────────────────────────

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

async function assembleAndSaveReport(
  model: string,
  hits: EnrichedHit[],
  chunks: string[],
): Promise<{ outPath: string; bySeverity: Record<string, ClassifiedHit[]> }> {
  const allClassified: ClassifiedHit[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const res = loadResult(i);
    if (res) allClassified.push(...res);
  }

  const bySeverity: Record<string, ClassifiedHit[]> = {
    CRITICO: [],
    ALTO: [],
    MEDIO: [],
    BASSO: [],
  };
  for (const h of allClassified) {
    if (bySeverity[h.severity]) bySeverity[h.severity].push(h);
  }

  const ts = new Date().toISOString();
  const tsSafe = ts.replace(/[:.]/g, "-");
  const outPath = path.join(ROOT, "logs", `horus-patch-scan-${tsSafe}.md`);
  const content = buildReport(model, hits.length, allClassified.length, chunks.length, bySeverity, ts);

  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");

  return { outPath, bySeverity };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = process.env.HORUS_OLLAMA_URL?.trim() || process.env.OLLAMA_URL?.trim();
  const model = process.env.HORUS_OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.HORUS_OLLAMA_TOKEN?.trim() || undefined;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Horus Patch Scan — Resumable]");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Modello  : ${model}`);
  console.log(`  Stato    : ${STATE_DIR}`);

  if (IS_RESET) {
    if (fs.existsSync(STATE_DIR)) {
      fs.rmSync(STATE_DIR, { recursive: true });
      console.log("\n  ✅ Stato cancellato. Rilanciare senza --reset per ricominciare.\n");
    } else {
      console.log("\n  ℹ️  Nessuno stato da cancellare.\n");
    }
    return;
  }

  ensureStateDir();

  // ── Carica o genera i chunk ──
  let chunks: string[];
  let hits: EnrichedHit[];

  const saved = loadChunks();
  if (saved) {
    chunks = saved.chunks;
    hits = saved.hits;
    console.log(`\n  📦 Stato ripreso: ${hits.length} candidati, ${chunks.length} chunk`);
  } else {
    console.log("\n  ⏳ Step 1: grep multi-pattern...");
    const rawHits = collectCandidates();
    console.log(`  🔍 Trovati grezzi: ${rawHits.length}`);

    console.log("  ⏳ Step 2: deduplicazione...");
    hits = deduplicateAndEnrich(rawHits);
    console.log(`  🔍 Trovati unici: ${hits.length}`);

    console.log("  ⏳ Step 3: chunking...");
    chunks = buildChunks(hits);
    console.log(`  📦 Chunk: ${chunks.length}`);

    saveChunks(chunks, hits);
  }

  // ── Report-only mode ──
  if (IS_REPORT) {
    const pending = pendingChunks(chunks.length);
    if (pending.length > 0) {
      console.log(`\n  ⚠️  ${pending.length} chunk ancora pendenti (${pending.join(", ")}). Eseguire prima senza --report.`);
      process.exitCode = 1;
      return;
    }
    const { outPath, bySeverity } = await assembleAndSaveReport(model, hits, chunks);
    console.log(`\n  💾 Report: ${outPath}`);
    console.log(`  🔴 CRITICO: ${bySeverity.CRITICO.length}`);
    console.log(`  🟠 ALTO   : ${bySeverity.ALTO.length}`);
    console.log(`  🟡 MEDIO  : ${bySeverity.MEDIO.length}`);
    console.log(`  🟢 BASSO  : ${bySeverity.BASSO.length}`);
    return;
  }

  // ── Classificazione parziale ──
  const pending = pendingChunks(chunks.length);
  const done = chunks.length - pending.length;
  console.log(`\n  📊 Completati: ${done}/${chunks.length}  —  Pendenti: ${pending.length}`);

  if (pending.length === 0) {
    console.log("  ✅ Tutti i chunk già classificati. Usa --report per generare il report.\n");
    const { outPath, bySeverity } = await assembleAndSaveReport(model, hits, chunks);
    console.log(`\n  💾 Report: ${outPath}`);
    console.log(`  🔴 CRITICO: ${bySeverity.CRITICO.length}`);
    console.log(`  🟠 ALTO   : ${bySeverity.ALTO.length}`);
    console.log(`  🟡 MEDIO  : ${bySeverity.MEDIO.length}`);
    console.log(`  🟢 BASSO  : ${bySeverity.BASSO.length}`);

    // Proposta task
    if (!NO_PROPOSE) {
      const allClassified: ClassifiedHit[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const res = loadResult(i);
        if (res) allClassified.push(...res);
      }
      const toPropose = allClassified.filter((h) => h.severity === "CRITICO" || h.severity === "ALTO");
      if (toPropose.length > 0) {
        const backlog = loadBacklog();
        const { proposed, skippedDup } = buildProposals(toPropose, backlog);
        console.log(`\n  ✅ Task pronti: ${proposed.length}  Saltati: ${skippedDup.length}`);
      }
    }
    return;
  }

  if (!baseUrl) {
    console.error(
      "\n❌ HORUS_OLLAMA_URL non impostato.\n" +
      "   Imposta il secret HORUS_OLLAMA_URL.\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ⏳ Classificazione chunk pendenti (max ${MAX_RUNTIME_MS / 1000}s)...\n`);

  const startTime = Date.now();
  let processed = 0;

  for (const i of pending) {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_RUNTIME_MS) {
      console.log(`\n  ⏰ Tempo limite raggiunto (${Math.round(elapsed / 1000)}s). Rilanciare per continuare.`);
      break;
    }

    const chunkPrompt = buildChunkPrompt(i, chunks.length, chunks[i]);
    process.stdout.write(`  [${i + 1}/${chunks.length}] Invio chunk... `);

    try {
      const raw = await callHorus(baseUrl, model, token, chunkPrompt);
      const parsed = parseClassificationTable(raw);
      saveResult(i, parsed);
      processed++;
      console.log(`✅ ${parsed.length} classificazioni (${Math.round((Date.now() - startTime) / 1000)}s totale)`);
    } catch (err) {
      const e = err as Error;
      console.log(`❌ ERRORE: ${e.message.slice(0, 200)}`);
      console.warn(`  ⚠️  Chunk ${i + 1} saltato. Il chunk verrà ritentato al prossimo run.`);
    }
  }

  const remainingAfter = pendingChunks(chunks.length);
  console.log(`\n  📊 Processati in questa sessione: ${processed}`);
  console.log(`  📦 Chunk rimanenti: ${remainingAfter.length}/${chunks.length}`);

  if (remainingAfter.length === 0) {
    console.log("\n  🎉 Tutti i chunk completati! Assemblaggio report...\n");
    const { outPath, bySeverity } = await assembleAndSaveReport(model, hits, chunks);
    console.log(`  💾 Report: ${outPath}`);
    console.log(`  🔴 CRITICO: ${bySeverity.CRITICO.length}`);
    console.log(`  🟠 ALTO   : ${bySeverity.ALTO.length}`);
    console.log(`  🟡 MEDIO  : ${bySeverity.MEDIO.length}`);
    console.log(`  🟢 BASSO  : ${bySeverity.BASSO.length}`);

    if (!NO_PROPOSE) {
      const allClassified: ClassifiedHit[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const res = loadResult(i);
        if (res) allClassified.push(...res);
      }
      const toPropose = allClassified.filter((h) => h.severity === "CRITICO" || h.severity === "ALTO");
      if (toPropose.length > 0) {
        const backlog = loadBacklog();
        const { proposed, skippedDup } = buildProposals(toPropose, backlog);
        console.log(`\n  ✅ Task pronti: ${proposed.length}  Saltati: ${skippedDup.length}`);
      }
    }
  } else {
    console.log(`\n  ➡️  Rilanciare per continuare: npx tsx scripts/horus-patch-scan-resume.ts`);
  }
}

main().catch((err) => {
  console.error("[horus-patch-scan-resume] Errore inatteso:", err);
  process.exitCode = 1;
});
