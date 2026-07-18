/**
 * BikerLink — Interrogazione Incrociata Horus ↔ Bowie (Task #611)
 *
 * Horus e Bowie si interrogano a vicenda in 3 fasi; Horus poi analizza e
 * produce un report leggibile. Usa due modalità distinte:
 *   • RAGIONAMENTO (callHorusReasoning): think:false + HORUS_THINK_TAG_CONTRACT
 *     per generare domande e analizzare log — output sempre passato a stripThink.
 *   • CHAT (callHorusChat): tono colloquiale, temperature più alto, per rispondere
 *     a Bowie e scrivere il report finale.
 *
 * Uso:
 *   npx tsx scripts/horus-bowie-interrogation.ts
 *   npx tsx scripts/horus-bowie-interrogation.ts --questions 5
 *   npx tsx scripts/horus-bowie-interrogation.ts --dry-run
 *   npx tsx scripts/horus-bowie-interrogation.ts --skip-phase 2
 *   npx tsx scripts/horus-bowie-interrogation.ts --out-dir /tmp/interrog
 *
 * --skip-phase N: salta la fase N e carica automaticamente il log più recente
 *   in --out-dir che corrisponde al suffisso atteso (es. -horus-asks-bowie.md).
 *   Se non esiste nessun file precedente, lo script esce con un errore esplicito.
 *
 * Env (ThinkCentre):
 *   HORUS_OLLAMA_URL, HORUS_OLLAMA_TOKEN, HORUS_OLLAMA_MODEL
 *   BOWIE_OLLAMA_URL, BOWIE_OLLAMA_TOKEN, BOWIE_OLLAMA_MODEL
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cfAccessHeaders } from "../server/lib/cf-access";
import { AGENT_MODEL_DEFAULTS } from "../server/lib/agent-constants";
import { stripThinkBlock as stripThink } from "../server/lib/ollama-think-strip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Configurazione endpoint ──────────────────────────────────────────────────

const HORUS_URL = (process.env.HORUS_OLLAMA_URL ?? process.env.BOWIE_OLLAMA_URL ?? "")
  .trim().replace(/\/$/, "");
const HORUS_TOKEN = (process.env.HORUS_OLLAMA_TOKEN ?? process.env.BOWIE_OLLAMA_TOKEN ?? "").trim();
const BOWIE_URL = (process.env.BOWIE_OLLAMA_URL ?? "").trim().replace(/\/$/, "");
const BOWIE_TOKEN = (process.env.BOWIE_OLLAMA_TOKEN ?? "").trim();

const HORUS_MODEL_ID = (process.env.HORUS_OLLAMA_MODEL ?? AGENT_MODEL_DEFAULTS.horus).trim();
const BOWIE_MODEL_ID = (process.env.BOWIE_OLLAMA_MODEL ?? AGENT_MODEL_DEFAULTS.bowie).trim();

const DEFAULT_OUT_DIR = process.env.HORUS_LOG_DIR ?? path.join(ROOT, "logs");
const REQUEST_TIMEOUT_MS = 240_000; // 4 min — Horus reasoning può richiedere 2-3 min
const PROBE_TIMEOUT_MS = 5_000;

// ─── Contratti system prompt ──────────────────────────────────────────────────

/**
 * Forza qwen3 a incapsulare il ragionamento in <think>…</think>.
 * Copiato da server/ai/assistant/codebase-inventory.ts (HORUS_THINK_TAG_CONTRACT)
 * per evitare di importare quel modulo che ha dipendenze dal DB.
 */
const HORUS_THINK_TAG_CONTRACT =
  "Sei Horus. Puoi ragionare quanto ti serve, con tutta la profondità e il tempo necessari: " +
  "nessuna fretta, nessun limite al pensiero — la precisione conta più della rapidità.\n" +
  "Però racchiudi SEMPRE ed ESCLUSIVAMENTE il tuo ragionamento tra i tag <think> e </think>.\n" +
  "Dopo il tag </think> di chiusura scrivi SOLO il risultato finale richiesto, senza ripetere né " +
  'riassumere il ragionamento e senza premesse tipo "Okay", "Let me", "The user wants".\n' +
  "Se non hai bisogno di ragionare, va bene anche <think></think> vuoto seguito subito dal risultato finale.";

/** System prompt colloquiale per le risposte di Horus in modalità CHAT. */
const HORUS_CHAT_CONTRACT =
  "Sei Horus, un intenditore di strade e di tecnologia. Rispondi in italiano naturale e diretto, " +
  "con la tua voce — precisa, curiosa, mai burocratica. Nessuna struttura formale, nessuna analisi: " +
  "parla come parleresti a un collega di strade e codice.";

/**
 * System contract per Bowie: impone la stessa disciplina <think> di Horus
 * ma mantiene la corretta identità di Bowie (assistente in-app, non coordinatore).
 */
const BOWIE_THINK_TAG_CONTRACT =
  "Sei Bowie, l'assistente di BikerLink. Aiuti i motociclisti a pianificare percorsi, " +
  "usare l'app e capire come funziona il sistema.\n" +
  "Puoi ragionare internamente quanto ti serve — racchiudi SEMPRE il ragionamento tra <think> e </think>.\n" +
  "Dopo il tag </think> scrivi SOLO la risposta finale, in italiano naturale e diretto, " +
  "senza ripetere il ragionamento e senza premesse tipo \"Okay\" o \"Let me\".";



// ─── Prompt principali (module-level) ────────────────────────────────────────

function promptHorusGenerateQuestions(n: number, manualSnippet: string): string {
  return (
    `Sei Horus. Devi interrogare Bowie — il tuo assistente in-app — per valutare la sua comprensione di BikerLink.\n` +
    `Genera esattamente ${n} domande numerate (1. 2. 3. …) che testeranno in modo approfondito:\n` +
    `- La sua conoscenza delle funzionalità moto (percorsi curvy, ThinkCentre, telemetria, routing)\n` +
    `- La sua capacità di gestire domande degli utenti sul campo\n` +
    `- La sua coerenza tra risposte tecniche e tone of voice da assistente\n` +
    `Ogni domanda deve essere specifica, non generica.\n` +
    (manualSnippet
      ? `\nEstratto del manuale disponibile:\n${manualSnippet.slice(0, 3000)}\n`
      : "") +
    `\nGenera le ${n} domande:`
  );
}

function promptBowieGenerateQuestions(n: number): string {
  return (
    `Sei Bowie, l'assistente di BikerLink. Sei curioso di capire meglio il sistema in cui operi.\n` +
    `Genera esattamente ${n} domande numerate (1. 2. 3. …) che faresti a Horus — il coordinatore AI — per capire:\n` +
    `- Come funziona il routing e il ThinkCentre\n` +
    `- Cosa succede quando le cose vanno male (TC offline, DragonflyDB giù, OTA fallita)\n` +
    `- Come vengono prese le decisioni sui job automatici\n` +
    `Domande genuine, come un assistente curioso che vuole fare meglio il proprio lavoro.\n` +
    `\nGenera le ${n} domande:`
  );
}

function promptHorusAnalyze(log1: string, log2: string): string {
  return (
    `Sei Horus. Analizza queste due trascrizioni di interrogazione incrociata tra te e Bowie.\n` +
    `\n## TRASCRIZIONE 1 — Horus interroga Bowie:\n${log1.slice(0, 8000)}\n` +
    `\n## TRASCRIZIONE 2 — Bowie interroga Horus:\n${log2.slice(0, 8000)}\n` +
    `\nAnalizza in modo strutturato:\n` +
    `1. Qualità e accuratezza delle risposte di Bowie (per domanda)\n` +
    `2. Coerenza del tono e dello stile di Bowie\n` +
    `3. Lacune di conoscenza rilevate\n` +
    `4. Qualità delle mie risposte (autocritica)\n` +
    `5. Cosa migliorare nei Modelfile di entrambi\n` +
    `Analisi strutturata, in italiano:`
  );
}

function promptHorusWriteReport(analysis: string): string {
  return (
    `Sei Horus. Scrivi un report in italiano naturale e leggibile basandoti su questa analisi:\n\n` +
    `${analysis.slice(0, 5000)}\n\n` +
    `Il report deve avere esattamente tre sezioni:\n` +
    `## A — Valutazione di Bowie\n` +
    `Valutazione per risposta con voto da 1 a 5 e commento breve.\n\n` +
    `## B — Autocritica di Horus\n` +
    `Cosa ho risposto bene e cosa avrei potuto fare meglio.\n\n` +
    `## C — Suggerimenti per i Modelfile\n` +
    `Suggerimenti concreti per migliorare i Modelfile di Bowie e Horus.\n\n` +
    `Scrivi in tono diretto e personale — come se stessi parlando a un collega. Italiano.`
  );
}

// ─── Parser CLI ───────────────────────────────────────────────────────────────

interface Cli {
  questions: number;
  dryRun: boolean;
  skipPhases: Set<number>;
  outDir: string;
}

function parseCli(): Cli {
  const argv = process.argv;
  const val = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
  };
  const skipPhases = new Set<number>();
  const skipArg = val("--skip-phase");
  if (skipArg) {
    for (const p of skipArg.split(",")) {
      const n = parseInt(p.trim(), 10);
      if (!isNaN(n)) skipPhases.add(n);
    }
  }
  return {
    questions: parseInt(val("--questions") ?? "8", 10) || 8,
    dryRun: argv.includes("--dry-run"),
    skipPhases,
    outDir: val("--out-dir") ?? DEFAULT_OUT_DIR,
  };
}

// ─── Helper HTTP Ollama (fetch diretto — pattern da horus-patch-scan.core.ts) ─

interface OllamaReq {
  url: string; token: string; model: string;
  system: string; prompt: string;
  think: boolean; temperature: number; numPredict: number;
}

interface OllamaApiResponse {
  message?: { content: string; thinking?: string };
  error?: string;
}

async function ollamaChat(req: OllamaReq): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.token) headers["Authorization"] = `Bearer ${req.token}`;
  Object.assign(headers, cfAccessHeaders());
  try {
    const res = await fetch(`${req.url}/api/chat`, {
      method: "POST", headers, signal: controller.signal,
      body: JSON.stringify({
        model: req.model, stream: false, think: req.think,
        options: { temperature: req.temperature, num_predict: req.numPredict },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`);
    }
    const data = (await res.json()) as OllamaApiResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    return (data.message?.content ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Wrapper per modalità ─────────────────────────────────────────────────────

async function callHorusReasoning(prompt: string, numPredict = 5000): Promise<string> {
  if (!HORUS_URL) throw new Error("HORUS_OLLAMA_URL / BOWIE_OLLAMA_URL non configurato.");
  const t0 = Date.now();
  const raw = await ollamaChat({
    url: HORUS_URL, token: HORUS_TOKEN, model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT, prompt,
    think: false, temperature: 0.2, numPredict,
  });
  const result = stripThink(raw);
  console.log(`  [Horus/ragionamento] ${Math.round((Date.now() - t0) / 1000)}s — output: ${result.length} chars`);
  if (!result.trim()) throw new Error("callHorusReasoning: output vuoto dopo stripThink.");
  return result;
}

async function callHorusChat(prompt: string, numPredict = 2500): Promise<string> {
  if (!HORUS_URL) throw new Error("HORUS_OLLAMA_URL / BOWIE_OLLAMA_URL non configurato.");
  const t0 = Date.now();
  const raw = await ollamaChat({
    url: HORUS_URL, token: HORUS_TOKEN, model: HORUS_MODEL_ID,
    system: HORUS_CHAT_CONTRACT, prompt,
    think: false, temperature: 0.5, numPredict,
  });
  const result = stripThink(raw);
  console.log(`  [Horus/chat] ${Math.round((Date.now() - t0) / 1000)}s — output: ${result.length} chars`);
  if (!result.trim()) throw new Error("callHorusChat: output vuoto dopo stripThink.");
  return result;
}

async function callBowie(prompt: string, numPredict = 3000): Promise<string> {
  if (!BOWIE_URL) throw new Error("BOWIE_OLLAMA_URL non configurato.");
  const t0 = Date.now();
  const raw = await ollamaChat({
    url: BOWIE_URL, token: BOWIE_TOKEN, model: BOWIE_MODEL_ID,
    system: BOWIE_THINK_TAG_CONTRACT, prompt,
    think: false, temperature: 0.5, numPredict,
  });
  const result = stripThink(raw);
  console.log(`  [Bowie] ${Math.round((Date.now() - t0) / 1000)}s — output: ${result.length} chars`);
  if (!result.trim()) throw new Error("callBowie: output vuoto dopo stripThink.");
  return result;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function parseQuestions(text: string, max: number): string[] {
  const numbered = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s+/.test(l))
    .map((l) => l.replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean);
  if (numbered.length >= 2) return numbered.slice(0, max);
  // Fallback: righe non vuote abbastanza lunghe
  console.warn("  ⚠️  Formato domande non riconosciuto (atteso 'N. domanda'), uso fallback righe.");
  return text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 20).slice(0, max);
}

async function isReachable(url: string, token: string, label: string): Promise<boolean> {
  if (!url) { console.error(`  ❌ ${label}: URL non configurato.`); return false; }
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    Object.assign(headers, cfAccessHeaders());
    const res = await fetch(`${url}/api/tags`, { headers, signal: controller.signal });
    if (!res.ok) { console.error(`  ❌ ${label}: HTTP ${res.status}`); return false; }
    console.log(`  ✅ ${label} raggiungibile (${url})`);
    return true;
  } catch (e) {
    console.error(`  ❌ ${label}: non raggiungibile — ${(e as Error).message}`);
    return false;
  }
}

async function fetchManualSnippet(): Promise<string> {
  try {
    const res = await fetch("http://localhost:5000/api/admin/nadir/manual", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    if (text.length < 200) {
      console.warn("  ⚠️  Manuale troppo corto (<200 chars), ignorato.");
      return "";
    }
    console.log(`  📖 Manuale disponibile (${text.length} chars), snippet usato nel prompt Horus.`);
    return text;
  } catch {
    console.warn("  ⚠️  Manuale non disponibile (server locale non risponde) — interrogazione senza contesto.");
    return "";
  }
}

function writeMarkdown(outDir: string, filename: string, content: string): string {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * Cerca in outDir il file più recente il cui nome termina con `suffix`
 * (es. "-horus-asks-bowie.md"). I nomi includono il timestamp ISO, quindi
 * un ordinamento lessicografico discendente dà il file più recente per primo.
 * Restituisce il percorso completo oppure null se non esiste nulla.
 */
function findLatestLog(outDir: string, suffix: string): string | null {
  if (!fs.existsSync(outDir)) return null;
  const matches = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("interrogation-") && f.endsWith(suffix))
    .sort()
    .reverse();
  return matches.length > 0 ? path.join(outDir, matches[0]) : null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = parseCli();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  // Nomi dei file per questa sessione (usati solo quando la fase VIENE eseguita).
  // Per le fasi saltate si usa findLatestLog per trovare il run precedente.
  const outFile1 = `interrogation-${ts}-horus-asks-bowie.md`;
  const outFile2 = `interrogation-${ts}-bowie-asks-horus.md`;
  const outFile3 = `interrogation-${ts}-report.md`;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  BikerLink — Interrogazione Incrociata Horus ↔ Bowie");
  console.log(
    `  Domande: ${cli.questions} | Skip fasi: ${[...cli.skipPhases].join(",") || "nessuna"} | Out: ${cli.outDir}`,
  );
  console.log("════════════════════════════════════════════════════════════");

  if (cli.dryRun) {
    console.log("\n──── DRY-RUN — prompt e config, nessuna chiamata effettuata ────");
    console.log(`\nModelli: Horus=${HORUS_MODEL_ID} | Bowie=${BOWIE_MODEL_ID}`);
    console.log(`\n[Fase 1] PROMPT_HORUS_GENERATE_QUESTIONS (numPredict=4000):`);
    console.log(promptHorusGenerateQuestions(cli.questions, "").slice(0, 600));
    console.log(`\n[Fase 2] PROMPT_BOWIE_GENERATE_QUESTIONS (numPredict=3000):`);
    console.log(promptBowieGenerateQuestions(cli.questions).slice(0, 600));
    console.log(`\n[Fase 3a] PROMPT_HORUS_ANALYZE (numPredict=7000): [log1+log2 inseriti a runtime]`);
    console.log(`\n[Fase 3b] PROMPT_HORUS_WRITE_REPORT (numPredict=5000): [analisi inserita a runtime]`);
    return;
  }

  // ── Preflight ────────────────────────────────────────────────────────────────
  console.log("\n── Preflight ──");
  const [horusOk, bowieOk] = await Promise.all([
    isReachable(HORUS_URL, HORUS_TOKEN, "Horus (ThinkCentre)"),
    isReachable(BOWIE_URL, BOWIE_TOKEN, "Bowie (ThinkCentre)"),
  ]);
  if (!horusOk || !bowieOk) {
    console.error(
      "\n❌ Preflight fallito — ThinkCentre non raggiungibile.\n" +
        "   Verificare HORUS_OLLAMA_URL / BOWIE_OLLAMA_URL e connessione TC.",
    );
    process.exitCode = 1;
    return;
  }
  const manualSnippet = await fetchManualSnippet();

  // ── Fase 1: Horus interroga Bowie ────────────────────────────────────────────
  let log1 = "";
  let p1Path = path.join(cli.outDir, outFile1);

  if (!cli.skipPhases.has(1)) {
    console.log("\n── Fase 1: Horus genera domande (ragionamento) + Bowie risponde ──");
    console.log("  Horus: genero le domande…");
    const questionsRaw = await callHorusReasoning(
      promptHorusGenerateQuestions(cli.questions, manualSnippet),
      4000,
    );
    const questions = parseQuestions(questionsRaw, cli.questions);
    console.log(`  → ${questions.length} domande estratte.`);

    const sections: string[] = [
      `# Interrogazione: Horus chiede a Bowie\n\nData: ${new Date().toISOString()}\n`,
    ];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      console.log(`  [Domanda ${i + 1}/${questions.length}] Horus riformula → Bowie risponde…`);
      // Horus riformula in tono colloquiale così Bowie riceve una domanda vera, non sistemica
      const colloquiale = await callHorusChat(
        `Riformula questa domanda in tono naturale e colloquiale, come la farebbe un utente curioso (max 2 righe):\n\n${q}`,
        300,
      );
      const risposta = await callBowie(colloquiale, 3000);
      sections.push(`## Domanda ${i + 1}\n\n**${colloquiale}**\n\n${risposta}\n`);
    }

    log1 = sections.join("\n---\n\n");
    p1Path = writeMarkdown(cli.outDir, outFile1, log1);
    console.log(`  ✅ Fase 1 → ${p1Path}`);
  } else {
    console.log("\n── Fase 1 saltata (--skip-phase 1) — cerco log più recente in outDir…");
    const found = findLatestLog(cli.outDir, "-horus-asks-bowie.md");
    if (!found) {
      console.error(
        `  ❌ Nessun file *-horus-asks-bowie.md trovato in ${cli.outDir}.\n` +
          "   Eseguire almeno una volta la Fase 1 senza --skip-phase, oppure controllare --out-dir.",
      );
      process.exitCode = 1;
      return;
    }
    log1 = fs.readFileSync(found, "utf8");
    p1Path = found;
    console.log(`  → File caricato: ${found}`);
  }

  // ── Fase 2: Bowie interroga Horus ────────────────────────────────────────────
  let log2 = "";
  let p2Path = path.join(cli.outDir, outFile2);

  if (!cli.skipPhases.has(2)) {
    console.log("\n── Fase 2: Bowie genera domande + Horus risponde (chat) ──");
    console.log("  Bowie: genero le domande…");
    const bowieQRaw = await callBowie(promptBowieGenerateQuestions(cli.questions), 3000);
    const bowieQs = parseQuestions(bowieQRaw, cli.questions);
    console.log(`  → ${bowieQs.length} domande estratte.`);

    const sections2: string[] = [
      `# Interrogazione: Bowie chiede a Horus\n\nData: ${new Date().toISOString()}\n`,
    ];
    for (let i = 0; i < bowieQs.length; i++) {
      const q = bowieQs[i];
      console.log(`  [Domanda ${i + 1}/${bowieQs.length}] Horus risponde…`);
      const risposta = await callHorusChat(q, 2500);
      sections2.push(`## Domanda ${i + 1}\n\n**${q}**\n\n${risposta}\n`);
    }

    log2 = sections2.join("\n---\n\n");
    p2Path = writeMarkdown(cli.outDir, outFile2, log2);
    console.log(`  ✅ Fase 2 → ${p2Path}`);
  } else {
    console.log("\n── Fase 2 saltata (--skip-phase 2) — cerco log più recente in outDir…");
    const found = findLatestLog(cli.outDir, "-bowie-asks-horus.md");
    if (!found) {
      console.error(
        `  ❌ Nessun file *-bowie-asks-horus.md trovato in ${cli.outDir}.\n` +
          "   Eseguire almeno una volta la Fase 2 senza --skip-phase, oppure controllare --out-dir.",
      );
      process.exitCode = 1;
      return;
    }
    log2 = fs.readFileSync(found, "utf8");
    p2Path = found;
    console.log(`  → File caricato: ${found}`);
  }

  // ── Fase 3: Horus analizza e scrive il report ─────────────────────────────────
  if (!cli.skipPhases.has(3)) {
    console.log("\n── Fase 3: Horus analizza i log (ragionamento) → scrive report (chat) ──");

    console.log("  [3a] Analisi strutturata (ragionamento profondo)…");
    const analysis = await callHorusReasoning(promptHorusAnalyze(log1, log2), 7000);

    console.log("  [3b] Scrittura report finale (chat colloquiale)…");
    const report = await callHorusChat(promptHorusWriteReport(analysis), 5000);

    const reportContent =
      `# Report Interrogazione Incrociata Horus ↔ Bowie\n\n` +
      `Data: ${new Date().toISOString()}\nDomande per lato: ${cli.questions}\n\n` +
      `${report}\n`;

    const p3 = writeMarkdown(cli.outDir, outFile3, reportContent);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  ✅ Interrogazione incrociata completata.");
    console.log(`  📄 ${p1Path}`);
    console.log(`  📄 ${p2Path}`);
    console.log(`  📄 ${p3}`);
    console.log("════════════════════════════════════════════════════════════");
  } else {
    console.log("\n── Fase 3 saltata (--skip-phase 3).");
    console.log(`  📄 ${p1Path}`);
    console.log(`  📄 ${p2Path}`);
  }
}

main().catch((err) => {
  console.error("[horus-bowie-interrogation] Errore inatteso:", err);
  process.exitCode = 1;
});
