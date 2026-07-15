// Finalizzazione modalità MANUALE di Horus (Task #152).
// Estratto da horus-scanner-finalize.ts per ratchet 600-line gate.
// Le costanti MANUAL_AREAS e GLOSSARY_TERMS vivono in horus-manual-areas.ts.
// Gli helper condivisi (stripThink, sanitizeManual, MIRROR_DIR, HORUS_MODEL_ID)
// sono esportati da horus-scanner-finalize.ts.
import { promises as fs } from "node:fs";
import path from "node:path";
import { callOllamaChat } from "../../lib/ollama-client";
import { saveNadirManualWithBackup, getNadirManualTranslations } from "../nadir/manual";
import { retranslateManualNow } from "../nadir/translate";
import { storage } from "../../storage";
import { hubPost, isHubAvailable } from "../../lib/ai-hub-client";
import {
  type FileScanStore,
  HORUS_THINK_TAG_CONTRACT,
  MANUAL_LANGUAGE_STYLE_BLOCK,
} from "./codebase-inventory";
import {
  TRANSLATABLE_APP_LANGUAGES,
  APP_LANGUAGE_NAMES,
  type AppLanguageCode,
} from "@shared/languages";
import {
  MIRROR_DIR,
  HORUS_MODEL_ID,
  stripThink,
  sanitizeManual,
} from "./horus-scanner-finalize";
import { MANUAL_AREAS, GLOSSARY_TERMS } from "./horus-manual-areas";

// Task #152 — Il manuale documenta ogni area in profondità (domande specifiche +
// dizionario dell'interfaccia): più note in ingresso e più token in uscita.
const SECTION_MAX_NOTES_CHARS = 14000;
// Verificato live: con un tetto stretto il ragionamento di qwen3:4b (senza tag,
// vedi HORUS_THINK_TAG_CONTRACT) consuma tutto lo spazio e la sintesi/sezione vera
// non viene mai scritta per intero. Budget generoso: la finalizzazione gira poche
// volte per scansione (non per-file), nessuna fretta.
const SECTION_NUM_PREDICT = 7000;

// ── Helper interni ────────────────────────────────────────────────────────────

/** Aggrega le note FUNZIONALI per-file in un corpus unico, entro un tetto di caratteri. */
function buildFunctionalCorpus(store: FileScanStore, maxChars: number): string {
  let corpus = "";
  for (const [p, r] of Object.entries(store)) {
    const note = (r.note ?? "").trim();
    if (!note || note.toUpperCase() === "OK") continue;
    const line = `- ${p}: ${note}\n`;
    if (corpus.length + line.length > maxChars) break;
    corpus += line;
  }
  return corpus;
}

/** Spezza le note LESSICALI aggregate in blocchi entro il tetto per-prompt. */
function chunkLexiconNotes(store: FileScanStore, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const [p, r] of Object.entries(store)) {
    const note = (r.lexiconNote ?? "").trim();
    if (!note) continue;
    const block = `### File: ${p}\n${note}\n\n`;
    if (current.length + block.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += block;
  }
  if (current.trim().length > 0) chunks.push(current);
  return chunks;
}

/** Intestazione standard di ogni file .md salvato sul TC (Task #152, step 8). */
function buildManualHeader(lang: AppLanguageCode, iso: string): string {
  const name = APP_LANGUAGE_NAMES[lang];
  return (
    `# Manuale BikerLink — generato da Horus\n` +
    `_Generato il ${iso}. Lingua: ${name}_\n` +
    `_Storage TC: ~/agent-shared/nadir/manuale/${lang}.md_\n` +
    `_Search: ai-hub POST /nadir/search (TC) | fallback: Replit pgvector_`
  );
}

/** Scrive UNA sezione funzionale del manuale per una delle 24 aree (step 5). */
async function writeManualSection(area: string, questions: string, corpus: string): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Scrivi UNA sezione del manuale di BikerLink per l'area "${area}",
pensata per ISTRUIRE un altro agente AI su COSA fa l'app e COME funziona
quest'area. Prosa scorrevole in italiano, 2-4 paragrafi.

DOMANDE A CUI RISPONDERE per quest'area:
${questions}

Basati SOLO sulle note per-file qui sotto (descrizioni funzionali raccolte
leggendo il codice). Aggrega SOLO le note pertinenti a quest'area e ignora le
altre. NON elencare i file uno per uno, NON incollare codice, NON inventare
funzionalità non presenti nelle note.

AUTO-VERIFICA prima di consegnare:
✓ Hai risposto alle domande dell'area
✓ Hai descritto il flusso d'uso principale e chi usa la funzionalità
✓ Hai descritto il comportamento in caso di errore
✓ Hai citato le interazioni con altri sistemi
✓ Nomi italiani esatti di bottoni/sezioni tra virgolette
✓ Frasi complete, nessun idioma non traducibile

NOTE PER-FILE:
${corpus}

SEZIONE "${area}":`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Genera un blocco del "Dizionario dell'Interfaccia — Schermata per Schermata" (step 6). */
async function writeLexiconSection(notesText: string): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Componi una parte del "Dizionario dell'Interfaccia — Schermata per
Schermata" del manuale di BikerLink, a partire dalle note lessicali per-schermata
qui sotto (già estratte leggendo il codice UI). Per OGNI schermata distinta
produci un blocco con questo formato ESATTO:

### [Nome schermata]
**Percorso di accesso**: come ci si arriva
**Titolo visualizzato**: testo esatto nell'header
**Tab o sezioni interne**: nome esatto di ciascuna
**Bottoni e azioni**: "Testo" → cosa succede
**Campi di input**: label e placeholder esatti
**Messaggi**: errori, toast, alert con testo esatto
**Modal e fogli**: titolo e ogni opzione/bottone

Ometti una voce se non c'è nulla per quella schermata. NON inventare testi: usa
solo ciò che trovi nelle note. Mantieni i testi UI tra virgolette in italiano.

NOTE LESSICALI PER-SCHERMATA:
${notesText}

DIZIONARIO:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Panoramica introduttiva (~400 parole) che apre il manuale (step 7). */
async function writeManualOverview(): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Scrivi la PANORAMICA introduttiva del manuale di BikerLink (circa 400
parole, prosa scorrevole in italiano) che apre il documento. Copri:
- Cos'è BikerLink e a chi serve (biker, zavorrine, coppie)
- Le 5 funzionalità principali (mappa live, routing moto, matching tra rider,
  proposte ed eventi, assistente AI Bowie)
- La struttura tecnica (app mobile React Native + backend Express/PostgreSQL +
  ThinkCentre self-hosted + stack AI multi-persona)
- I differenziatori rispetto ad altre app (routing curvy self-hosted, privacy con
  ghost mode e fake position, assistente AI integrato)
Frasi complete e traducibili, nessun elenco di file, nessun codice.

PANORAMICA:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.4,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Glossario di 35 termini che chiude il manuale (step 7). */
async function writeManualGlossary(corpus: string): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Scrivi il GLOSSARIO che chiude il manuale di BikerLink: per CIASCUNO
dei 35 termini elencati qui sotto, una voce con definizione breve (1-2 frasi) in
italiano. I nomi propri (Bowie, Horus, Nadir, Ares, Quebracho, ThinkCentre, EAS,
qwen3…) restano invariati in tutte le lingue. Formato per riga:
**Termine** — definizione.

TERMINI (35):
${GLOSSARY_TERMS}

Puoi appoggiarti a queste note tecniche per definizioni accurate (ignora ciò che
non serve, non elencare i file):
${corpus}

GLOSSARIO:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Salva un file del manuale sul TC via ai-hub (best-effort). Ritorna true se ok. */
async function hubWriteManual(fileName: string, content: string): Promise<boolean> {
  const res = await hubPost("/files/write", { path: `nadir/manuale/${fileName}`, content });
  if (!res.ok) {
    console.warn(`[horus-manual] salvataggio TC ${fileName} fallito (non-fatale): ${res.error ?? res.status}`);
  }
  return res.ok;
}

/** Legge il numero di chunk manuale indicizzati (per il log finale). */
async function readManualChunkCount(): Promise<number | null> {
  try {
    const row = await storage.getAppSetting("nadir_index_status");
    const raw = (row?.valueJson ?? row?.value) as { counts?: { manual?: number } } | undefined;
    return typeof raw?.counts?.manual === "number" ? raw.counts.manual : null;
  } catch {
    return null;
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Mirror su filesystem: logs/nadir-manual-{ts}.md + logs/nadir-manual-latest.md. */
async function writeManualMirror(
  when: Date,
  iso: string,
  manualBody: string,
): Promise<{ tsPath: string | null; latestPath: string | null }> {
  try {
    await fs.mkdir(MIRROR_DIR, { recursive: true });
    const ts = `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}_${pad2(when.getHours())}-${pad2(when.getMinutes())}`;
    const content = `${buildManualHeader("it", iso)}\n\n${manualBody}\n`;
    const tsPath = path.join(MIRROR_DIR, `nadir-manual-${ts}.md`);
    const latestPath = path.join(MIRROR_DIR, "nadir-manual-latest.md");
    await fs.writeFile(tsPath, content, "utf8");
    await fs.writeFile(latestPath, content, "utf8");
    return { tsPath, latestPath };
  } catch (err) {
    console.warn("[horus-manual] mirror filesystem fallito (non-fatale):", (err as Error).message);
    return { tsPath: null, latestPath: null };
  }
}

/**
 * Finalizza la modalità MANUALE (Task #152): assembla un manuale italiano ricco
 * (Panoramica → 24 sezioni funzionali → Dizionario dell'Interfaccia → Glossario),
 * lo salva sul ThinkCentre via ai-hub (storage primario) e su Replit (storage
 * secondario: nadir_manual_text + traduzioni + reindicizzazione vettoriale +
 * mirror filesystem). La traduzione vera e propria vive in ../nadir/translate.ts
 * (NON modificata) e produce le 6 lingue target; le traduzioni riuscite vengono
 * rispecchiate sul TC. Tutto il salvataggio TC è best-effort: se ai-hub è offline
 * si prosegue con Replit.
 */
export async function finalizeManualScan(store: FileScanStore): Promise<string> {
  const when = new Date();
  const iso = when.toISOString();

  // 1) Corpus funzionale (una volta) condiviso da tutte le sezioni.
  const corpus = buildFunctionalCorpus(store, SECTION_MAX_NOTES_CHARS);

  // 2) Panoramica (apre il manuale).
  const overview = await writeManualOverview();

  // 3) 24 sezioni funzionali con domande specifiche.
  const sections: string[] = [];
  for (const { title, questions } of MANUAL_AREAS) {
    const section = await writeManualSection(title, questions, corpus);
    if (section) sections.push(`## ${title}\n\n${section}`);
  }

  // 4) Dizionario dell'Interfaccia — Schermata per Schermata (dalle note lessicali).
  const lexiconChunks = chunkLexiconNotes(store, SECTION_MAX_NOTES_CHARS);
  const lexiconParts: string[] = [];
  for (const chunk of lexiconChunks) {
    const part = await writeLexiconSection(chunk);
    if (part) lexiconParts.push(part);
  }

  // 5) Glossario (chiude il manuale).
  const glossary = await writeManualGlossary(corpus);

  // 6) Assembla il corpo italiano (senza intestazione TC: quella si aggiunge per file).
  const parts: string[] = [];
  if (overview) parts.push(`## Panoramica\n\n${overview}`);
  if (sections.length > 0) parts.push(sections.join("\n\n"));
  parts.push(
    `## Dizionario dell'Interfaccia — Schermata per Schermata\n\n` +
      (lexiconParts.length > 0
        ? lexiconParts.join("\n\n")
        : "_Nessuna nota lessicale disponibile (ri-esegui una scansione completa delle schermate)._"),
  );
  if (glossary) parts.push(`## Glossario\n\n${glossary}`);
  const manualBody = parts.join("\n\n");

  // 7) Storage secondario Replit — salva l'italiano conservando la versione precedente.
  const { backedUp } = await saveNadirManualWithBackup(manualBody);

  // 8) Storage primario ThinkCentre — it.md + latest.md (best-effort).
  const hubUp = isHubAvailable();
  const tcResults: Record<string, boolean | undefined> = {};
  if (hubUp) {
    const itFile = `${buildManualHeader("it", iso)}\n\n${manualBody}`;
    tcResults.it = await hubWriteManual("it.md", itFile);
    tcResults.latest = await hubWriteManual("latest.md", itFile);
  } else {
    console.warn("[horus-manual] ai-hub non disponibile: salvataggio TC saltato (solo Replit).");
  }

  // 9) Traduzioni Replit (6 lingue) + reindicizzazione (retranslateManualNow include il reindex).
  const { translatedLangs } = await retranslateManualNow("horus-scan");
  const missingLangs = TRANSLATABLE_APP_LANGUAGES.filter((l) => !translatedLangs.includes(l));

  // 10) Rispecchia sul TC ogni traduzione riuscita (best-effort).
  if (hubUp && translatedLangs.length > 0) {
    const translations = await getNadirManualTranslations().catch(() => ({} as Record<string, { text?: string }>));
    for (const lang of translatedLangs) {
      const text = translations[lang]?.text;
      if (!text) continue;
      const file = `${buildManualHeader(lang, iso)}\n\n${text}`;
      tcResults[lang] = await hubWriteManual(`${lang}.md`, file);
    }
  }

  // 11) Mirror filesystem + conteggio chunk indicizzati.
  const mirror = await writeManualMirror(when, iso, manualBody);
  const chunkCount = await readManualChunkCount();

  // 12) Log finale esplicito (stato di ogni file TC + Replit + filesystem).
  const tcMark = (lang: string): string => {
    if (!hubUp) return "skip";
    if (tcResults[lang] === true) return "✓";
    if (tcResults[lang] === false) return "✗";
    return "—";
  };
  const tcLine = ["it", "en", "de", "es", "fr", "el", "tr", "latest"]
    .map((l) => `${l}.md ${tcMark(l)}`)
    .join(" | ");
  console.log(
    `[horus-manual] Italiano: ${manualBody.length} car, ${sections.length} sezioni.\n\n` +
      `TC agent-shared/nadir/manuale/:\n  ${tcLine}\n\n` +
      `Replit:\n  nadir_manual_text ✓ | translations ${translatedLangs.length}/${TRANSLATABLE_APP_LANGUAGES.length} | ` +
      `embeddings ${chunkCount ?? "?"} chunks\n\n` +
      `Filesystem: ${mirror.tsPath ? `logs/${path.basename(mirror.tsPath)} ✓` : "✗"} | ` +
      `${mirror.latestPath ? "nadir-manual-latest.md ✓" : "✗"}`,
  );

  return (
    `Manuale generato (${sections.length}/24 sezioni, ${lexiconParts.length} blocchi lessicali, ` +
    `${manualBody.length} caratteri) e salvato nello storage di Nadir` +
    `${backedUp ? " (versione precedente conservata)" : ""}. ` +
    `TC: ${hubUp ? "salvato via ai-hub" : "saltato (ai-hub offline)"}. ` +
    `Tradotto in ${translatedLangs.length}/${TRANSLATABLE_APP_LANGUAGES.length} lingue` +
    `${missingLangs.length > 0 ? ` (mancanti: ${missingLangs.join(", ")}, ricadono sull'italiano)` : ""}. ` +
    `Reindicizzazione inclusa${chunkCount != null ? ` (${chunkCount} chunk manuale)` : ""}. ` +
    `Mirror: ${mirror.tsPath ? path.basename(mirror.tsPath) : "non scritto"}.`
  );
}
