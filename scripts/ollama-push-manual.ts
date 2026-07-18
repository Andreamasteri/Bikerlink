/**
 * BikerLink — Push del Manuale Q&A in BOWIE e/o HORUS (ThinkCentre)
 *
 * Istanze Ollama (vedi .agents/memory/ollama-naming.md):
 *   Ares  = DIAG_OLLAMA_* (PC fisso)   — genera il report e il manuale Q&A
 *   Bowie = BOWIE_OLLAMA_* (ThinkCentre) — assistente in-app (target "bowie")
 *   Horus = HORUS_OLLAMA_* (ThinkCentre) — AI routing / coordinatore job AI (target "horus")
 *
 * Legge `docs/bikerlink-qa-manual.md` (generato da Ares via `scripts/ollama-study-repo.ts`),
 * lo inietta come blocco `## MANUALE UTENTE Q&A` nel SYSTEM prompt del Modelfile
 * del target scelto, e ricrea il modello custom via `POST <URL>/api/create`
 * — senza SSH, senza deploy. Completa la pipeline:
 *   Horus genera → Nadir indicizza → Bowie riceve → Horus riceve
 *
 * SICUREZZA ORDINE: il Modelfile su disco viene sovrascritto SOLO dopo che il push
 * è andato a buon fine. ThinkCentre irraggiungibile o errore HTTP → exit 1 e
 * NESSUNA modifica al Modelfile.
 *
 * Auth: header del Service Token Cloudflare Access (`cfAccessHeaders()`) + il token
 * custom `<TARGET>_OLLAMA_TOKEN` come Bearer / `X-Ollama-Token` (consumato da nginx all'origine).
 *
 * Uso:
 *   npx tsx scripts/ollama-push-manual.ts                              # default: bowie
 *   npx tsx scripts/ollama-push-manual.ts --target bowie
 *   npx tsx scripts/ollama-push-manual.ts --target horus
 *   npx tsx scripts/ollama-push-manual.ts --target both
 *   npx tsx scripts/ollama-push-manual.ts --dry-run                   # stampa il Modelfile, NON chiama, NON scrive
 *   npx tsx scripts/ollama-push-manual.ts --target horus --dry-run
 *   npx tsx scripts/ollama-push-manual.ts --model-name bikerlink-assistant
 *   npx tsx scripts/ollama-push-manual.ts --qa-file docs/bikerlink-qa-manual.md
 *
 * Env/secret Bowie:  BOWIE_OLLAMA_URL (obbligatorio), BOWIE_OLLAMA_TOKEN (opz.)
 * Env/secret Horus:  HORUS_OLLAMA_URL (obbligatorio), HORUS_OLLAMA_TOKEN (opz.)
 * Comuni: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (Service Token Cloudflare Access).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cfAccessHeaders } from "../server/lib/cf-access";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_QA_FILE = "docs/bikerlink-qa-manual.md";
const REQUEST_TIMEOUT_MS = 120_000;

// Marker (testo letterale dentro il SYSTEM prompt) per iniettare/sostituire il blocco Q&A.
const QA_BEGIN = "=== INIZIO MANUALE UTENTE Q&A (auto-generato, ollama-push-manual) ===";
const QA_END = "=== FINE MANUALE UTENTE Q&A ===";

type TargetName = "bowie" | "horus";

interface TargetConfig {
  label: string;
  ollamaUrl: string | undefined;
  ollamaToken: string | undefined;
  modelName: string;
  modelfilePath: string;
}

interface Cli {
  dryRun: boolean;
  /** Override del nome modello (usato solo per target singolo). */
  modelNameOverride: string | null;
  qaFile: string;
  targets: TargetName[];
}

function parseCli(): Cli {
  const argv = process.argv;
  const value = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
  };

  const targetArg = value("--target") ?? "bowie";
  let targets: TargetName[];
  if (targetArg === "both") {
    targets = ["bowie", "horus"];
  } else if (targetArg === "bowie" || targetArg === "horus") {
    targets = [targetArg];
  } else {
    console.error(`\n❌ --target non valido: "${targetArg}". Valori accettati: bowie | horus | both`);
    process.exit(1);
  }

  return {
    dryRun: argv.includes("--dry-run"),
    modelNameOverride: value("--model-name"),
    qaFile: value("--qa-file") ?? DEFAULT_QA_FILE,
    targets,
  };
}

/** Restituisce la configurazione di un target (url, token, modello, modelfile). */
function getTargetConfig(target: TargetName, modelNameOverride: string | null): TargetConfig {
  if (target === "bowie") {
    return {
      label: "Bowie",
      ollamaUrl: process.env.BOWIE_OLLAMA_URL?.trim(),
      ollamaToken: process.env.BOWIE_OLLAMA_TOKEN?.trim(),
      modelName: modelNameOverride ?? "bikerlink-assistant",
      modelfilePath: path.join(ROOT, "scripts", "ollama-modelfile", "BikerLink-Bowie.Modelfile"),
    };
  }
  return {
    label: "Horus",
    ollamaUrl: process.env.HORUS_OLLAMA_URL?.trim(),
    ollamaToken: process.env.HORUS_OLLAMA_TOKEN?.trim(),
    modelName: modelNameOverride ?? "bikerlink-routing",
    modelfilePath: path.join(ROOT, "scripts", "ollama-modelfile", "BikerLink-Horus.Modelfile"),
  };
}

/**
 * Inietta il manuale Q&A nel SYSTEM prompt del Modelfile, dentro i marker
 * QA_BEGIN/QA_END (sostituisce il blocco precedente se presente). Costruisce
 * il contenuto IN MEMORIA: non scrive nulla su disco.
 */
function injectQa(modelfile: string, qa: string, label: string): string {
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
    throw new Error(
      `[${label}] Blocco SYSTEM \"\"\"...\"\"\" non trovato nel Modelfile: impossibile iniettare il Q&A.`
    );
  }
  let inner = sysMatch[1];
  const begin = inner.indexOf(QA_BEGIN);
  if (begin !== -1) {
    const end = inner.indexOf(QA_END);
    if (end === -1) {
      throw new Error(
        `[${label}] Marker QA_BEGIN trovato ma QA_END mancante nel Modelfile: file corrotto.`
      );
    }
    const tail = inner.slice(end + QA_END.length);
    inner = inner.slice(0, begin).trimEnd() + "\n" + tail;
  } else {
    // Marker assenti: il Modelfile non li contiene ancora.
    throw new Error(
      `[${label}] Marker QA_BEGIN/QA_END non trovati nel blocco SYSTEM del Modelfile.\n` +
        `   Aggiungi i marker al Modelfile prima di usare questo script:\n` +
        `     ${QA_BEGIN}\n` +
        `     ${QA_END}`
    );
  }
  const newInner = `${inner.trimEnd()}\n\n${block}\n`;
  return modelfile.replace(sysMatch[0], `SYSTEM """${newInner}"""`);
}

/** Header di autenticazione: Cloudflare Access + token custom (Bearer / X-Ollama-Token). */
function buildAuthHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  Object.assign(headers, cfAccessHeaders());
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Ollama-Token"] = token;
  }
  return headers;
}

/** POST /api/create. Ritorna il testo della risposta; lancia in caso di errore HTTP/rete. */
async function pushModel(
  baseUrl: string,
  modelName: string,
  modelfile: string,
  token: string | undefined
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/create`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildAuthHeaders(token),
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

/**
 * Esegue l'intero ciclo per un singolo target:
 *   legge Modelfile → inietta Q&A → [dry-run: stampa e torna] → push HTTP → scrivi disco.
 * Lancia in caso di errore (il chiamante decide se proseguire con altri target).
 */
async function pushToTarget(
  config: TargetConfig,
  qa: string,
  qaRelPath: string,
  dryRun: boolean
): Promise<void> {
  const { label, modelName, modelfilePath, ollamaUrl, ollamaToken } = config;
  const modelfileRel = path.relative(ROOT, modelfilePath);

  console.log(`\n  ── [${label}] target ──────────────────────────────────────────`);

  // Leggi Modelfile.
  let modelfile: string;
  try {
    modelfile = fs.readFileSync(modelfilePath, "utf8");
  } catch {
    throw new Error(`[${label}] Modelfile non trovato: ${modelfileRel}`);
  }

  // Inietta Q&A in memoria.
  const updated = injectQa(modelfile, qa, label);

  if (dryRun) {
    console.log(`\n  --dry-run [${label}]: Modelfile risultante (NON inviato, NON scritto su disco):\n`);
    console.log("────────────────────────────────────────────────────────────");
    console.log(updated);
    console.log("────────────────────────────────────────────────────────────");
    return;
  }

  if (!ollamaUrl) {
    throw new Error(
      `[${label}] ${label.toUpperCase()}_OLLAMA_URL non impostato. Imposta il secret e riprova (oppure usa --dry-run).`
    );
  }

  console.log(`  🚀 Creo/aggiorno il modello "${modelName}" su ${label} (ThinkCentre) ...`);
  const resp = await pushModel(ollamaUrl, modelName, updated, ollamaToken);

  // Push OK → SOLO ora persisto il Modelfile aggiornato su disco.
  fs.writeFileSync(modelfilePath, updated, "utf8");

  console.log(`\n  ✅ [${label}] Modello "${modelName}" aggiornato sul ThinkCentre.`);
  console.log(`  💾 Modelfile aggiornato: ${modelfileRel}`);
  console.log(`  📘 Q&A iniettato da: ${qaRelPath}`);
  if (label === "Bowie") {
    console.log(`  ➡️  Punta l'assistente in-app a questo modello: BOWIE_OLLAMA_MODEL=${modelName}`);
  } else {
    console.log(`  ➡️  Punta il routing AI a questo modello: HORUS_OLLAMA_MODEL=${modelName}`);
  }
  if (resp.trim()) console.log(`  Risposta endpoint: ${resp.trim().slice(0, 300)}`);
}

async function main(): Promise<void> {
  const cli = parseCli();
  const qaPath = path.resolve(ROOT, cli.qaFile);
  const qaRelPath = path.relative(ROOT, qaPath);

  const targetsLabel = cli.targets.length === 2 ? "both (Bowie + Horus)" : cli.targets[0];

  console.log("════════════════════════════════════════════════════════════");
  console.log(`  BikerLink — Push Manuale Q&A → ${targetsLabel} (ThinkCentre)`);
  console.log("════════════════════════════════════════════════════════════");

  // Leggi il manuale Q&A una sola volta.
  let qa: string;
  try {
    qa = fs.readFileSync(qaPath, "utf8");
  } catch {
    console.error(`\n❌ Manuale Q&A non trovato: ${qaRelPath}`);
    console.error("   Genera prima il manuale con: npx tsx scripts/ollama-study-repo.ts");
    process.exitCode = 1;
    return;
  }
  if (!qa.trim()) {
    console.error(`\n❌ Manuale Q&A vuoto: ${qaRelPath}`);
    process.exitCode = 1;
    return;
  }

  // Quando --model-name è usato con --target both, avvisiamo e ignoriamo l'override.
  if (cli.modelNameOverride && cli.targets.length === 2) {
    console.warn(
      "\n⚠️  --model-name ignorato con --target both (ogni target usa il proprio nome di default)."
    );
  }

  let anyFailed = false;

  for (const target of cli.targets) {
    const modelNameOverride = cli.targets.length === 1 ? cli.modelNameOverride : null;
    const config = getTargetConfig(target, modelNameOverride);
    try {
      await pushToTarget(config, qa, qaRelPath, cli.dryRun);
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      console.error(`\n❌ Push [${config.label}] non riuscito — Modelfile su disco NON modificato.`);
      if (e.name === "AbortError") {
        console.error("   Timeout: il ThinkCentre non ha risposto in tempo.");
      } else if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(e.cause?.code ?? "")) {
        console.error("   Host irraggiungibile (ThinkCentre spento o Cloudflare Tunnel giù).");
      }
      console.error(`   Dettaglio: ${e.message}\n`);
      anyFailed = true;
      // Con --target both: prosegui con l'altro target anche se questo ha fallito.
    }
  }

  if (!cli.dryRun) {
    console.log("\n════════════════════════════════════════════════════════════");
    if (anyFailed) {
      console.log("  ⚠️  Almeno un target ha fallito. Controllare i messaggi sopra.");
    } else {
      console.log("  ✅ Push completato con successo per tutti i target.");
    }
    console.log("════════════════════════════════════════════════════════════");
  }

  if (anyFailed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[ollama-push-manual] Errore inatteso:", err);
  process.exitCode = 1;
});
