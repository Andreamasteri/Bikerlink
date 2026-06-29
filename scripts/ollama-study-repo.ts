/**
 * BikerLink — Studio codebase + dump DB con Ollama (PC dedicato)  (Task #5187)
 *
 * Scarica l'intera codebase BikerLink da GitHub (token read-only), la manda a
 * Ollama a chunk per fargli studiare l'architettura, aggiunge il dump di schema
 * + dati di ENTRAMBI i DB (dev e prod) e produce un report architetturale in
 * `logs/repo-study-<timestamp>.md`. La sezione `## Architettura` del report viene
 * iniettata in `.agents/skills/ollama-diagnostics/bikerlink-context.md` così
 * Ollama ha una conoscenza completa e persistente del progetto.
 *
 * Distinto da `scripts/ollama-diagnose.ts` (diagnosi crash/boot): questo è uno
 * STUDIO completo, non un triage. Non modifica i DB (sola lettura).
 *
 * STRATEGIA map-reduce (resumabile):
 *   MAP    — ogni chunk viene riassunto in ISOLAMENTO (nessuna history
 *            accumulata → niente overflow di contesto su repo grandi).
 *   REDUCE — i riassunti (piccoli) vengono sintetizzati nel report finale.
 *   STATO  — i file scaricati e i riassunti sono messi in cache su disco
 *            (`.local/ollama-study-state/`), così con `--step` il run avanza
 *            UNA chiamata Ollama per invocazione e sopravvive a interruzioni /
 *            al cap dei 120s del foreground.
 *
 * La chiamata è HTTP DIRETTA a `${DIAG_OLLAMA_URL}/api/chat` con gli header del
 * Service Token Cloudflare Access (+ Bearer fallback). NON passa dal backend.
 *
 * Uso:
 *   npx tsx scripts/ollama-study-repo.ts                  # run completo (terminale)
 *   npx tsx scripts/ollama-study-repo.ts --step           # avanza di UN passo e esce
 *   npx tsx scripts/ollama-study-repo.ts --reset          # azzera lo stato in cache
 *   npx tsx scripts/ollama-study-repo.ts --dry-run        # lista file, niente invio
 *   Flag: --no-db --branch <b> --max-files <n> --chunk-chars <n> --num-ctx <n>
 *         --state-dir <path>
 *
 * Secret/env: DIAG_OLLAMA_URL, DIAG_OLLAMA_MODEL, DIAG_OLLAMA_TOKEN (opz.),
 *   DIAG_GITHUB_TOKEN (fallback GITHUB_TOKEN), CF_ACCESS_CLIENT_ID/SECRET,
 *   DATABASE_URL, PROD_DATABASE_URL.
 */

import fs from "fs";
import path from "path";
import { ROOT, GITHUB_REPO, DEFAULT_MODEL, parseCli, type Cli } from "./ollama-study/config";
import { githubToken, fetchFileList, downloadAll } from "./ollama-study/github";
import { dumpDatabase } from "./ollama-study/db-dump";
import {
  buildChunks,
  summarizeChunk,
  summarizeText,
  foldSummaries,
  composeReport,
  ctxCharBudget,
  extractArchitecture,
  updateContext,
  generateQaManual,
  writeQaManual,
} from "./ollama-study/ollama";
import {
  resolveStateDir,
  loadFiles,
  saveFiles,
  loadState,
  saveState,
  clearState,
  type StudyState,
} from "./ollama-study/state";

interface StepCtx {
  cli: Cli;
  baseUrl: string;
  model: string;
  token: string | undefined;
  dir: string;
  ghToken: string;
}

/** Esegue UN passo dello studio. Ritorna true se restano altri passi. */
async function runStep(c: StepCtx): Promise<boolean> {
  // 0. Init: scarica i file (una volta) e prepara lo stato.
  let files = loadFiles(c.dir);
  if (!files) {
    console.log(`  📋 Lista file da GitHub (${GITHUB_REPO}@${c.cli.branch})...`);
    let list = await fetchFileList(c.cli.branch, c.ghToken);
    if (c.cli.maxFiles && list.length > c.cli.maxFiles) {
      console.log(`  ✂️  Limito a ${c.cli.maxFiles} file (su ${list.length}).`);
      list = list.slice(0, c.cli.maxFiles);
    }
    console.log(`  ⬇️  Scarico ${list.length} file...`);
    const { downloaded, failed } = await downloadAll(list, c.cli.branch, c.ghToken);
    if (failed.length) console.log(`  ⚠️  ${failed.length} file non scaricati.`);
    saveFiles(c.dir, downloaded);
    files = downloaded;
    const chunks = buildChunks(downloaded, c.cli.chunkChars);
    const state: StudyState = {
      branch: c.cli.branch,
      model: c.model,
      chunkChars: c.cli.chunkChars,
      numCtx: c.cli.numCtx,
      noDb: c.cli.noDb,
      maxFiles: c.cli.maxFiles,
      totalChunks: chunks.length,
      summaries: new Array<string | null>(chunks.length).fill(null),
      dbRaw: null,
      dbSummary: null,
      reduceQueue: null,
      reportPath: null,
      qaPath: null,
      done: false,
    };
    saveState(c.dir, state);
    console.log(`  ✅ Init: ${downloaded.length} file, ${chunks.length} chunk (num_ctx ${state.numCtx}).`);
    return true;
  }

  // Recovery: file in cache ma stato mancante (crash tra saveFiles e saveState).
  // Ricostruisco lo stato iniziale dai file invece di obbligare a --reset.
  let state = loadState(c.dir);
  if (!state) {
    console.log("  ♻️  Stato mancante ma file in cache: ricostruisco lo stato iniziale.");
    const rebuilt = buildChunks(files, c.cli.chunkChars);
    state = {
      branch: c.cli.branch,
      model: c.model,
      chunkChars: c.cli.chunkChars,
      numCtx: c.cli.numCtx,
      noDb: c.cli.noDb,
      maxFiles: c.cli.maxFiles,
      totalChunks: rebuilt.length,
      summaries: new Array<string | null>(rebuilt.length).fill(null),
      dbRaw: null,
      dbSummary: null,
      reduceQueue: null,
      reportPath: null,
      qaPath: null,
      done: false,
    };
    saveState(c.dir, state);
  }
  const chunks = buildChunks(files, state.chunkChars);
  if (chunks.length !== state.summaries.length) {
    throw new Error(
      `Stato incoerente: ${chunks.length} chunk ma ${state.summaries.length} slot di riassunto. ` +
        "I file in cache o chunk-chars sono cambiati: rilancia con --reset.",
    );
  }

  // 1. MAP chunk: primo riassunto mancante.
  const nextIdx = state.summaries.findIndex((s) => s === null);
  if (nextIdx !== -1) {
    console.log(`  🧩 Riassunto chunk ${nextIdx + 1}/${chunks.length}...`);
    const summary = await summarizeChunk(c.baseUrl, c.model, chunks[nextIdx], nextIdx, chunks.length, c.token, state.numCtx);
    state.summaries[nextIdx] = summary;
    saveState(c.dir, state);
    const left = state.summaries.filter((s) => s === null).length;
    console.log(`  ✅ Chunk ${nextIdx + 1} fatto (${left} chunk rimanenti).`);
    return true;
  }

  // 2. Dump DB (cache grezza), separato dalla chiamata Ollama.
  if (!state.noDb && state.dbRaw === null) {
    console.log("  🗄️  Dump database dev + prod (sola lettura)...");
    const [dev, prod] = await Promise.all([
      dumpDatabase("DEV", process.env.DATABASE_URL, false),
      dumpDatabase("PROD", process.env.PROD_DATABASE_URL, false),
    ]);
    state.dbRaw = `${dev}\n\n${prod}`;
    saveState(c.dir, state);
    console.log(`  ✅ Dump DB in cache (${state.dbRaw.length} char).`);
    return true;
  }

  // 3. MAP DB: riassunto del dump.
  if (!state.noDb && state.dbSummary === null) {
    console.log("  🧩 Riassunto del dump DB...");
    state.dbSummary = await summarizeText(c.baseUrl, c.model, "i due database BikerLink (dev e prod)", state.dbRaw!, c.token, state.numCtx);
    saveState(c.dir, state);
    console.log("  ✅ Riassunto DB fatto.");
    return true;
  }

  // 4. REDUCE gerarchico: inizializza la coda dai riassunti per-chunk e riducila
  //    (fold) un batch per passo finché entra nel budget di contesto. Così la
  //    sintesi finale non sfora `num_ctx` anche con tanti chunk.
  if (state.reduceQueue === null) {
    state.reduceQueue = state.summaries as string[];
    saveState(c.dir, state);
    return true;
  }
  const budget = ctxCharBudget(state.numCtx);
  const dbLen = state.dbSummary?.length ?? 0;
  const queueLen = (q: string[]): number => q.join("\n\n").length;
  if (state.reduceQueue.length > 1 && queueLen(state.reduceQueue) + dbLen > budget) {
    // Batch greedy dal fronte: almeno 2 elementi, senza sforare (budget - dbLen).
    const target = Math.max(budget - dbLen, Math.floor(budget / 2));
    const batch: string[] = [];
    let acc = 0;
    for (const s of state.reduceQueue) {
      if (batch.length >= 2 && acc + s.length > target) break;
      batch.push(s);
      acc += s.length + 2;
    }
    console.log(`  🪢 Fold di ${batch.length}/${state.reduceQueue.length} riassunti (coda ${queueLen(state.reduceQueue)} char)...`);
    const folded = await foldSummaries(c.baseUrl, c.model, batch, c.token, state.numCtx);
    state.reduceQueue = [folded, ...state.reduceQueue.slice(batch.length)];
    saveState(c.dir, state);
    console.log(`  ✅ Fold fatto (coda ora ${state.reduceQueue.length} elementi).`);
    return true;
  }

  // 5. REDUCE finale: report + iniezione context.
  if (state.reportPath == null) {
    console.log("  📝 Sintesi report finale...");
    const summaries = state.reduceQueue as string[];
    const report = await composeReport(c.baseUrl, c.model, summaries, state.dbSummary, c.token, state.numCtx);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = path.join(ROOT, "logs", `repo-study-${ts}.md`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const head =
      `# Studio codebase BikerLink — ${new Date().toISOString()}\n\n` +
      `- Modello: \`${c.model}\` (num_ctx ${state.numCtx})\n` +
      `- Endpoint: \`${c.baseUrl}\`\n` +
      `- Branch: \`${state.branch}\`\n` +
      `- File studiati: ${files.length} (${chunks.length} chunk, map-reduce)\n` +
      `- DB: ${state.noDb ? "saltato" : "dev + prod inclusi"}\n\n---\n\n`;
    fs.writeFileSync(outPath, head + report + "\n", "utf8");

    const arch = extractArchitecture(report);
    let ctxMsg = "⚠️  sezione '## Architettura' non trovata nel report — context non aggiornato.";
    if (arch && updateContext(arch)) ctxMsg = `✅ bikerlink-context.md aggiornato (${arch.length} char).`;

    state.reportPath = path.relative(ROOT, outPath);
    saveState(c.dir, state);

    console.log(`  💾 Report: ${state.reportPath}`);
    console.log(`  📝 ${ctxMsg}`);
    console.log(`  ➡️  Resta il manuale utente Q&A (rilancia con --step).`);
    return true;
  }

  // 6. MAP finale: manuale utente Q&A (Task #5189). Si basa sul report già
  //    salvato (fallback ai riassunti consolidati se il file non è leggibile).
  if (!state.done) {
    console.log("  📘 Generazione manuale utente Q&A...");
    let context = "";
    try {
      context = fs.readFileSync(path.join(ROOT, state.reportPath), "utf8");
    } catch {
      context = (state.reduceQueue ?? []).join("\n\n");
    }
    const qa = await generateQaManual(c.baseUrl, c.model, context, c.token, state.numCtx);
    state.qaPath = writeQaManual(qa);
    state.done = true;
    saveState(c.dir, state);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  💾 Report:       ${state.reportPath}`);
    console.log(`  📘 Manuale Q&A:  ${state.qaPath}`);
    console.log("  ➡️  Push all'assistant ThinkCentre: npx tsx scripts/ollama-push-manual.ts");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(qa.slice(0, 2000));
    if (qa.length > 2000) console.log("\n...[manuale troncato nella console, vedi il file]...");
    return false;
  }

  console.log(`  ✅ Studio già completato: ${state.reportPath} (+ Q&A ${state.qaPath ?? "n/d"})`);
  return false;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const baseUrl = process.env.DIAG_OLLAMA_URL?.trim();
  const model = process.env.DIAG_OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.DIAG_OLLAMA_TOKEN?.trim() || undefined;
  const dir = resolveStateDir(cli.stateDir);

  console.log("════════════════════════════════════════════════════════════");
  console.log("  BikerLink — Studio codebase + dump DB con Ollama (map-reduce)");
  console.log("════════════════════════════════════════════════════════════");

  if (cli.reset) {
    clearState(dir);
    console.log(`  🧹 Stato azzerato: ${path.relative(ROOT, dir)}`);
  }

  const ghToken = githubToken();
  if (!ghToken) {
    console.error("\n❌ Nessun token GitHub (DIAG_GITHUB_TOKEN o GITHUB_TOKEN). Impossibile scaricare la codebase.");
    process.exitCode = 1;
    return;
  }
  if (!cli.dryRun && !baseUrl) {
    console.error("\n❌ DIAG_OLLAMA_URL non impostato. Imposta il secret e riprova (oppure usa --dry-run).");
    process.exitCode = 1;
    return;
  }

  if (cli.dryRun) {
    let files = await fetchFileList(cli.branch, ghToken);
    if (cli.maxFiles && files.length > cli.maxFiles) files = files.slice(0, cli.maxFiles);
    console.log(`\n  --dry-run: ${files.length} file (nessun invio):\n`);
    files.forEach((f) => console.log(`    ${f}`));
    return;
  }

  const ctx: StepCtx = { cli, baseUrl: baseUrl!, model, token, dir, ghToken };
  try {
    if (cli.step) {
      const more = await runStep(ctx);
      console.log(more ? "\nSTATUS: MORE — restano altri passi (rilancia con --step)." : "\nSTATUS: DONE — studio completato.");
    } else {
      let more = true;
      while (more) more = await runStep(ctx);
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    console.error("\n❌ Studio non riuscito.");
    if (e.name === "AbortError") console.error("   Timeout: l'endpoint Ollama non ha risposto in tempo.");
    else if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(e.cause?.code ?? ""))
      console.error("   Host irraggiungibile (PC spento o Cloudflare Tunnel giù).");
    console.error(`   Dettaglio: ${e.message}\n`);
    console.error("   Lo stato parziale è salvato: correggi e rilancia (riprende da dove era).");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ollama-study-repo] Errore inatteso:", err);
  process.exitCode = 1;
});
