/**
 * BikerLink — Studio codebase + dump DB con Ollama (PC dedicato)  (Task #5187)
 *
 * Scarica l'intera codebase BikerLink da GitHub (token read-only), la manda a
 * Ollama a chunk per fargli studiare l'architettura, aggiunge al payload il dump
 * completo di schema + dati di ENTRAMBI i DB (dev e prod) e produce un report
 * architetturale in `logs/repo-study-<timestamp>.md`. La sezione `## Architettura`
 * del report viene iniettata in `.agents/skills/ollama-diagnostics/bikerlink-context.md`
 * così Ollama ha una conoscenza completa e persistente del progetto.
 *
 * Distinto da `scripts/ollama-diagnose.ts` (diagnosi crash/boot): questo è uno
 * STUDIO completo, non un triage di crash. Non modifica i DB (sola lettura).
 *
 * La chiamata è HTTP DIRETTA all'endpoint Ollama (`${DIAG_OLLAMA_URL}/api/chat`),
 * con gli header del Service Token Cloudflare Access (se configurati) + Bearer
 * fallback. NON passa dal backend Express.
 *
 * Implementazione divisa in `scripts/ollama-study/`:
 *   config.ts   — costanti, ROOT e parsing CLI
 *   github.ts   — lista file + download dei contenuti dal repo
 *   db-dump.ts  — dump schema + dati di un DB (sola lettura)
 *   ollama.ts   — chunking, chiamata Ollama, iniezione context
 *
 * Uso:
 *   npx tsx scripts/ollama-study-repo.ts
 *   npx tsx scripts/ollama-study-repo.ts --dry-run            # lista file, niente invio
 *   npx tsx scripts/ollama-study-repo.ts --no-db              # salta il dump dei DB
 *   npx tsx scripts/ollama-study-repo.ts --branch develop     # altro branch
 *   npx tsx scripts/ollama-study-repo.ts --max-files 800      # limita i file scaricati
 *   npx tsx scripts/ollama-study-repo.ts --chunk-chars 360000 # dimensione chunk
 *
 * Secret/env:
 *   DIAG_OLLAMA_URL    — URL base dell'Ollama sul PC dedicato (via Cloudflare Tunnel).
 *   DIAG_OLLAMA_MODEL  — modello da usare (default "qwen3.6:35b").
 *   DIAG_OLLAMA_TOKEN  — opzionale, Bearer token se l'endpoint è protetto.
 *   DIAG_GITHUB_TOKEN  — token GitHub READ-ONLY (fine-grained, Contents:read).
 *                        Fallback a GITHUB_TOKEN solo se DIAG_GITHUB_TOKEN assente.
 *   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET — Service Token Cloudflare Access.
 *   DATABASE_URL       — DB dev (sola lettura).
 *   PROD_DATABASE_URL  — DB prod (sola lettura). Mancante → sezione "[non disponibile]".
 */

import fs from "fs";
import path from "path";
import {
  ROOT,
  GITHUB_REPO,
  DEFAULT_MODEL,
  DOWNLOAD_CONCURRENCY,
  REQUEST_TIMEOUT_MS,
  parseCli,
} from "./ollama-study/config";
import { githubToken, fetchFileList, downloadAll } from "./ollama-study/github";
import { dumpDatabase } from "./ollama-study/db-dump";
import { buildChunks, callOllama, STUDY_SYSTEM_PROMPT, extractArchitecture, updateContext } from "./ollama-study/ollama";

async function main(): Promise<void> {
  const cli = parseCli();
  const baseUrl = process.env.DIAG_OLLAMA_URL?.trim();
  const model = process.env.DIAG_OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.DIAG_OLLAMA_TOKEN?.trim() || undefined;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  BikerLink — Studio codebase + dump DB con Ollama");
  console.log("════════════════════════════════════════════════════════════");

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

  // 1. Lista file
  console.log(`\n  📋 Recupero lista file da GitHub (${GITHUB_REPO}@${cli.branch})...`);
  let files: string[];
  try {
    files = await fetchFileList(cli.branch, ghToken);
  } catch (err) {
    console.error(`\n❌ Impossibile recuperare la lista file: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  if (cli.maxFiles && files.length > cli.maxFiles) {
    console.log(`  ✂️  Limito a ${cli.maxFiles} file (su ${files.length}).`);
    files = files.slice(0, cli.maxFiles);
  }
  console.log(`  ✅ ${files.length} file rilevanti.`);

  if (cli.dryRun) {
    console.log("\n  --dry-run: elenco file (nessun invio):\n");
    files.forEach((f) => console.log(`    ${f}`));
    console.log(`\n  Totale: ${files.length} file.`);
    return;
  }

  // 2. Download
  console.log(`\n  ⬇️  Scarico i contenuti (concorrenza ${DOWNLOAD_CONCURRENCY})...`);
  const { downloaded, failed } = await downloadAll(files, cli.branch, ghToken);
  if (failed.length) console.log(`  ⚠️  ${failed.length} file non scaricati.`);
  console.log(`  ✅ ${downloaded.length} file scaricati.`);

  // 3. Chunking
  const chunks = buildChunks(downloaded, cli.chunkChars);
  const totalChars = downloaded.reduce((a, f) => a + f.content.length, 0);
  console.log(`  📦 ${chunks.length} chunk (~${cli.chunkChars} char/chunk, ${totalChars} char totali).`);

  // 4. Dump DB
  console.log(`\n  🗄️  Dump database${cli.noDb ? " (saltato: --no-db)" : " dev + prod"}...`);
  const [devDump, prodDump] = await Promise.all([
    dumpDatabase("DEV", process.env.DATABASE_URL, cli.noDb),
    dumpDatabase("PROD", process.env.PROD_DATABASE_URL, cli.noDb),
  ]);

  // 5. Invio progressivo a Ollama
  console.log(`\n  🤖 Invio a Ollama (${baseUrl}, modello ${model})...`);
  const conversation: { role: string; content: string }[] = [{ role: "system", content: STUDY_SYSTEM_PROMPT }];
  try {
    for (let i = 0; i < chunks.length; i++) {
      const header = `Chunk ${i + 1} di ${chunks.length} della codebase BikerLink.\n\n`;
      conversation.push({ role: "user", content: header + chunks[i] + "\n\nConsolida brevemente." });
      console.log(`  ⏳ Chunk ${i + 1}/${chunks.length} (timeout ${REQUEST_TIMEOUT_MS / 1000}s)...`);
      const reply = await callOllama(baseUrl!, model, conversation, token);
      conversation.push({ role: "assistant", content: reply });
    }

    if (!cli.noDb) {
      console.log("  ⏳ Invio dump DB (schema + dati dev/prod)...");
      conversation.push({
        role: "user",
        content:
          "Di seguito il dump di schema e dati dei due database BikerLink. Studialo e " +
          "annota il drift dev↔prod. Consolida brevemente.\n\n" +
          devDump +
          "\n\n" +
          prodDump,
      });
      const dbReply = await callOllama(baseUrl!, model, conversation, token);
      conversation.push({ role: "assistant", content: dbReply });
    }

    // 6. Sintesi finale
    console.log("  ⏳ Richiesta report finale...");
    conversation.push({
      role: "user",
      content:
        "Produci ora un report completo dell'architettura BikerLink basato su tutto il " +
        "materiale ricevuto. Usa ESATTAMENTE queste sezioni H2:\n" +
        "## Architettura — panoramica architetturale e mappa dei moduli\n" +
        "## Dipendenze critiche\n" +
        "## Pattern ripetuti\n" +
        "## Punti di rischio\n" +
        "## Confronto schema dev↔prod\n" +
        "La sezione '## Architettura' deve essere autosufficiente: verrà estratta e " +
        "usata come system prompt persistente.",
    });
    const report = await callOllama(baseUrl!, model, conversation, token);

    // Salvataggio report
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(ROOT, "logs");
    const outPath = path.join(outDir, `repo-study-${ts}.md`);
    fs.mkdirSync(outDir, { recursive: true });
    const head =
      `# Studio codebase BikerLink — ${new Date().toISOString()}\n\n` +
      `- Modello: \`${model}\`\n` +
      `- Endpoint: \`${baseUrl}\`\n` +
      `- Branch: \`${cli.branch}\`\n` +
      `- File studiati: ${downloaded.length} (${chunks.length} chunk)\n` +
      `- DB: ${cli.noDb ? "saltato" : "dev + prod inclusi"}\n\n---\n\n`;
    fs.writeFileSync(outPath, head + report + "\n", "utf8");

    // 7. Aggiornamento context
    const arch = extractArchitecture(report);
    let ctxMsg = "⚠️  sezione '## Architettura' non trovata nel report — context non aggiornato.";
    if (arch && updateContext(arch)) {
      ctxMsg = `✅ bikerlink-context.md aggiornato con la sezione Architettura (${arch.length} char).`;
    }

    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  💾 Report: ${path.relative(ROOT, outPath)}`);
    console.log(`  📝 ${ctxMsg}`);
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(report.slice(0, 2000));
    if (report.length > 2000) console.log("\n...[report troncato nella console, vedi il file]...");
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    console.error("\n❌ Studio non riuscito: l'endpoint Ollama non ha risposto correttamente.");
    if (e.name === "AbortError") console.error(`   Timeout dopo ${REQUEST_TIMEOUT_MS / 1000}s.`);
    else if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(e.cause?.code ?? ""))
      console.error("   Host irraggiungibile (PC spento o Cloudflare Tunnel giù).");
    console.error(`   Dettaglio: ${e.message}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ollama-study-repo] Errore inatteso:", err);
  process.exitCode = 1;
});
