/**
 * BikerLink — Push del Manuale Q&A in BOWIE (assistente in-app, ThinkCentre)  (Task #5189)
 *
 * Istanze Ollama (vedi .agents/memory/ollama-naming.md):
 *   Ares  = DIAG_OLLAMA_* (PC fisso)   — genera il report e il manuale Q&A
 *   Bowie = OLLAMA_*       (ThinkCentre) — assistente in-app (TARGET di questo script)
 *   Horus = OLLAMA_*       (ThinkCentre) — AI routing
 *
 * Legge `docs/bikerlink-qa-manual.md` (generato da Ares via `scripts/ollama-study-repo.ts`),
 * lo inietta come blocco `## MANUALE UTENTE Q&A` nel SYSTEM prompt di
 * `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile`, e ricrea il modello custom
 * `bikerlink-assistant` su Bowie via `POST ${OLLAMA_URL}/api/create`
 * — senza SSH, senza deploy. Così l'assistente in-app risponde con il manuale
 * già cucito nel system prompt (basta puntare `OLLAMA_MODEL=bikerlink-assistant`).
 *
 * SICUREZZA ORDINE: il Modelfile su disco viene sovrascritto SOLO dopo che il push
 * è andato a buon fine. ThinkCentre irraggiungibile o errore HTTP → exit 1 e
 * NESSUNA modifica al Modelfile.
 *
 * Auth: header del Service Token Cloudflare Access (`cfAccessHeaders()`) + il token
 * custom `OLLAMA_TOKEN` come Bearer / `X-Ollama-Token` (consumato da nginx all'origine).
 *
 * Uso:
 *   npx tsx scripts/ollama-push-manual.ts
 *   npx tsx scripts/ollama-push-manual.ts --dry-run                  # stampa il Modelfile, NON chiama, NON scrive
 *   npx tsx scripts/ollama-push-manual.ts --model-name bikerlink-assistant
 *   npx tsx scripts/ollama-push-manual.ts --qa-file docs/bikerlink-qa-manual.md
 *
 * Env/secret: OLLAMA_URL (obbligatorio), OLLAMA_TOKEN (opz.),
 *   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (Service Token Cloudflare Access).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cfAccessHeaders } from "../server/lib/cf-access";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_MODEL_NAME = "bikerlink-assistant";
const DEFAULT_QA_FILE = "docs/bikerlink-qa-manual.md";
const MODELFILE_PATH = path.join(ROOT, "scripts", "ollama-modelfile", "BikerLink-Bowie.Modelfile");
const REQUEST_TIMEOUT_MS = 120_000;

// Marker (testo letterale dentro il SYSTEM prompt) per iniettare/sostituire il blocco Q&A.
const QA_BEGIN = "=== INIZIO MANUALE UTENTE Q&A (auto-generato, ollama-push-manual) ===";
const QA_END = "=== FINE MANUALE UTENTE Q&A ===";

interface Cli {
  dryRun: boolean;
  modelName: string;
  qaFile: string;
}

function parseCli(): Cli {
  const argv = process.argv;
  const value = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    modelName: value("--model-name") || DEFAULT_MODEL_NAME,
    qaFile: value("--qa-file") || DEFAULT_QA_FILE,
  };
}

/**
 * Inietta il manuale Q&A nel SYSTEM prompt del Modelfile, dentro i marker
 * QA_BEGIN/QA_END (sostituisce il blocco precedente se presente). Costruisce
 * il contenuto IN MEMORIA: non scrive nulla su disco.
 */
function injectQa(modelfile: string, qa: string): string {
  // `"""` chiuderebbe in anticipo il blocco SYSTEM: neutralizzalo nel testo Q&A.
  const safeQa = qa.replace(/"""/g, '"');
  const block =
    `${QA_BEGIN}\n` +
    "Di seguito un manuale Q&A delle funzionalità BikerLink dal punto di vista dell'utente.\n" +
    "Usalo come fonte autorevole per rispondere; se la domanda non è coperta, applica le REGOLE INDEROGABILI sopra.\n\n" +
    `${safeQa.trim()}\n` +
    `${QA_END}`;

  const sysMatch = modelfile.match(/SYSTEM\s+"""([\s\S]*?)"""/);
  if (!sysMatch) {
    throw new Error("Blocco SYSTEM \"\"\"...\"\"\" non trovato nel Modelfile: impossibile iniettare il Q&A.");
  }
  let inner = sysMatch[1];
  const begin = inner.indexOf(QA_BEGIN);
  if (begin !== -1) {
    const end = inner.indexOf(QA_END);
    const tail = end !== -1 ? inner.slice(end + QA_END.length) : "";
    inner = inner.slice(0, begin).trimEnd() + "\n" + tail;
  }
  const newInner = `${inner.trimEnd()}\n\n${block}\n`;
  return modelfile.replace(sysMatch[0], `SYSTEM """${newInner}"""`);
}

/** Header di autenticazione: Cloudflare Access + token custom (Bearer / X-Ollama-Token). */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  Object.assign(headers, cfAccessHeaders());
  const token = process.env.OLLAMA_TOKEN?.trim();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Ollama-Token"] = token;
  }
  return headers;
}

/** POST /api/create. Ritorna il testo della risposta; lancia in caso di errore HTTP/rete. */
async function pushModel(baseUrl: string, modelName: string, modelfile: string): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/create`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      signal: controller.signal,
      body: JSON.stringify({ name: modelName, modelfile, stream: false }),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 500)}` : ""}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const cli = parseCli();
  const qaPath = path.resolve(ROOT, cli.qaFile);

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Bowie] BikerLink — Push Manuale Q&A → assistente in-app (ThinkCentre)");
  console.log("════════════════════════════════════════════════════════════");

  let qa: string;
  try {
    qa = fs.readFileSync(qaPath, "utf8");
  } catch {
    console.error(`\n❌ Manuale Q&A non trovato: ${path.relative(ROOT, qaPath)}`);
    console.error("   Genera prima il manuale con: npx tsx scripts/ollama-study-repo.ts");
    process.exitCode = 1;
    return;
  }
  if (!qa.trim()) {
    console.error(`\n❌ Manuale Q&A vuoto: ${path.relative(ROOT, qaPath)}`);
    process.exitCode = 1;
    return;
  }

  let modelfile: string;
  try {
    modelfile = fs.readFileSync(MODELFILE_PATH, "utf8");
  } catch {
    console.error(`\n❌ Modelfile non trovato: ${path.relative(ROOT, MODELFILE_PATH)}`);
    process.exitCode = 1;
    return;
  }

  let updated: string;
  try {
    updated = injectQa(modelfile, qa);
  } catch (err) {
    console.error(`\n❌ ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  if (cli.dryRun) {
    console.log("\n  --dry-run: Modelfile risultante (NON inviato, NON scritto su disco):\n");
    console.log("────────────────────────────────────────────────────────────");
    console.log(updated);
    console.log("────────────────────────────────────────────────────────────");
    return;
  }

  const baseUrl = process.env.OLLAMA_URL?.trim();
  if (!baseUrl) {
    console.error("\n❌ OLLAMA_URL non impostato. Imposta il secret e riprova (oppure usa --dry-run).");
    process.exitCode = 1;
    return;
  }

  console.log(`\n  🚀 [Bowie] Creo/aggiorno il modello "${cli.modelName}" su Bowie (ThinkCentre) ...`);
  try {
    const resp = await pushModel(baseUrl, cli.modelName, updated);
    // Push OK → SOLO ora persisto il Modelfile aggiornato su disco.
    fs.writeFileSync(MODELFILE_PATH, updated, "utf8");
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  ✅ [Bowie] Modello "${cli.modelName}" aggiornato sul ThinkCentre.`);
    console.log(`  💾 Modelfile aggiornato: ${path.relative(ROOT, MODELFILE_PATH)}`);
    console.log(`  📘 Q&A iniettato da: ${path.relative(ROOT, qaPath)}`);
    console.log("  ➡️  Punta l'assistente in-app a questo modello: OLLAMA_MODEL=" + cli.modelName);
    console.log("════════════════════════════════════════════════════════════");
    if (resp.trim()) console.log(`  Risposta endpoint: ${resp.trim().slice(0, 300)}`);
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    console.error("\n❌ Push non riuscito — Modelfile su disco NON modificato.");
    if (e.name === "AbortError") console.error("   Timeout: il ThinkCentre non ha risposto in tempo.");
    else if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(e.cause?.code ?? ""))
      console.error("   Host irraggiungibile (ThinkCentre spento o Cloudflare Tunnel giù).");
    console.error(`   Dettaglio: ${e.message}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ollama-push-manual] Errore inatteso:", err);
  process.exitCode = 1;
});
