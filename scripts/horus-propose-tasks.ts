/**
 * BikerLink — Proposta formale task da report Horus
 *
 * Script companion di `log-analysis-horus.ts`. Legge l'ultimo report di
 * triage Horus (o quello specificato con --report), estrae i task validati
 * dalla revisione architect (sezione "## TASK VALIDATI") oppure dalla sezione
 * originale "## TASK PROPOSTI DA HORUS", deduplica contro il backlog esistente
 * via DB, scrive i file plan in `.local/tasks/horus-<slug>.md` e produce il
 * manifest `logs/horus-tasks-pending.json` pronto per la proposta formale.
 *
 * Uso diretto:
 *   npx tsx scripts/horus-propose-tasks.ts
 *   npx tsx scripts/horus-propose-tasks.ts --report logs/horus-log-analysis-<ts>.md
 *
 * Viene invocato automaticamente da log-analysis-horus.ts al termine del triage
 * (a meno che sia passato --no-propose).
 *
 * Output:
 *   - File `.local/tasks/horus-<slug>.md` per ogni task valido non duplicato
 *   - `logs/horus-tasks-pending.json` — manifest con i task pronti da proporre
 *   - Istruzioni a console per la proposta formale via agente Replit
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { titleToSlug } from "./lib/horus-slug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseReportArg(): string | null {
  const i = process.argv.indexOf("--report");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const HAS_ARCHITECT_REVIEW = process.argv.includes("--has-architect-review");

// ─── Trova report più recente ─────────────────────────────────────────────────

function findLatestReport(): string | null {
  // Cerca prima in HORUS_LOG_DIR (es. /tmp nella shell planner), poi in logs/
  const candidates: string[] = [];
  if (process.env.HORUS_LOG_DIR) {
    candidates.push(path.resolve(process.env.HORUS_LOG_DIR));
  }
  candidates.push(path.join(ROOT, "logs"));

  for (const logsDir of candidates) {
    if (!fs.existsSync(logsDir)) continue;
    const files = fs
      .readdirSync(logsDir)
      .filter(
        (f) =>
          (f.startsWith("horus-log-analysis-") || f.startsWith("horus-analysis-")) &&
          f.endsWith(".md") &&
          !f.includes("architect"),
      )
      .sort()
      .reverse();
    if (files.length > 0) return path.join(logsDir, files[0]);
  }
  return null;
}

// ─── Parsing task dalla tabella markdown ──────────────────────────────────────

export interface ParsedTask {
  title: string;
  priority: "alta" | "media" | "bassa" | string;
  problem: string;
  action: string;
  area?: string;
}

/**
 * Estrae le righe di una tabella markdown dalla sezione indicata.
 * Supporta sia la sezione "## TASK VALIDATI" (architect) che
 * "## TASK PROPOSTI DA HORUS" (originale).
 */
function extractTaskTable(content: string, sectionHeader: string): string | null {
  const idx = content.indexOf(sectionHeader);
  if (idx === -1) return null;
  const after = content.slice(idx + sectionHeader.length);
  // Prende fino alla prossima sezione ## o alla fine
  const nextSection = after.search(/\n##\s/);
  return nextSection === -1 ? after : after.slice(0, nextSection);
}

function parseTaskTable(tableText: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = tableText.split("\n");
  let inTable = false;
  let headerParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) { if (inTable && headerParsed) break; continue; }
    inTable = true;
    if (!headerParsed) { headerParsed = true; continue; } // header row
    if (/^\|[-| ]+\|$/.test(trimmed)) continue; // separator row

    const cells = trimmed.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 2) continue;

    let title: string, priority: string, problem: string, action: string, area: string | undefined;
    if (cells.length >= 5) {
      // 5-column format: Titolo | Priorità | Area | Problema | Azione
      [title, priority, area, problem = "", action = ""] = cells;
    } else {
      // 4-column format: Titolo | Priorità | Problema | Azione
      [title, priority, problem = "", action = ""] = cells;
      area = undefined;
    }
    if (!title || title.startsWith("Titolo")) continue;

    tasks.push({ title, priority: priority?.toLowerCase() ?? "media", problem, action, area });
  }

  return tasks;
}

export interface ParseTasksResult {
  tasks: ParsedTask[];
  /** false quando il file architect esiste ma non contiene una tabella '## TASK VALIDATI' parseable (neanche dopo normalizzazione). */
  architectFormatValid: boolean;
}

/**
 * Converte la sezione "## TASK VALIDATI" di una risposta architect da lista
 * puntata/numerata a tabella markdown, se necessario.
 * Lascia invariata la sezione se è già una tabella (contiene `|`).
 * Restituisce il contenuto modificato e un flag `normalized`.
 */
export function normalizeArchitectSection(content: string): { content: string; normalized: boolean } {
  const HEADER = "## TASK VALIDATI";
  const idx = content.indexOf(HEADER);
  if (idx === -1) return { content, normalized: false };

  const before = content.slice(0, idx + HEADER.length);
  const after = content.slice(idx + HEADER.length);
  const sectionBody = after.split(/\n##\s/)[0];

  // Se c'è già una tabella (almeno una riga con pipe), lascia invariato
  if (/^\s*\|/m.test(sectionBody)) return { content, normalized: false };

  const restAfterSection = after.slice(sectionBody.length);

  // Estrai righe della lista (numerate "1. testo" o puntate "- testo" o "* testo")
  const listItemRe = /^(?:\d+\.|[-*])\s+(.+)$/;
  const rows: string[] = [];
  for (const line of sectionBody.split("\n")) {
    const m = listItemRe.exec(line.trim());
    if (m) {
      // Strip trailing "(file: …)" annotations (complete or cut-off), matching normalizeTaskSection
      let raw = m[1].replace(/\s*\(file:[^)]*\)?$/, "").trim();
      // Truncate at a word boundary instead of mid-character
      if (raw.length > 80) {
        const cut = raw.slice(0, 80);
        const lastSpace = cut.lastIndexOf(" ");
        raw = lastSpace > 10 ? cut.slice(0, lastSpace) : cut;
      }
      const titolo = raw.replace(/\|/g, "—");
      rows.push(`| ${titolo} | media | validato da architect |`);
    }
  }

  if (rows.length === 0) return { content, normalized: false };

  const table =
    "\n| Titolo | Priorità | Motivazione |\n" +
    "|--------|----------|-------------|\n" +
    rows.join("\n") +
    "\n";

  return {
    content: before + table + (restAfterSection ? restAfterSection : ""),
    normalized: true,
  };
}

export function parseTasks(reportContent: string, architectContent: string | null): ParseTasksResult {
  // Preferisce la sezione validata dall'architect se disponibile
  if (architectContent) {
    // Prova prima a normalizzare un'eventuale lista in tabella
    const { content: normalizedArchitect, normalized } = normalizeArchitectSection(architectContent);

    const validatedSection = extractTaskTable(normalizedArchitect, "## TASK VALIDATI");

    // Il formato è valido se la sezione esiste ED ha una struttura tabella (almeno una riga con |).
    // Un'architect review che valida 0 task (tabella vuota con solo intestazione) è VALIDA:
    // significa che l'architect ha scartato tutto — non è un errore di formato.
    const hasTableStructure = validatedSection !== null && /^\s*\|/m.test(validatedSection);

    if (hasTableStructure) {
      // Formato valido: l'architect decision è autorevole anche con 0 righe dati
      const tasks = parseTaskTable(validatedSection!);

      if (normalized) {
        console.warn(
          "\n  ⚠️  ──────────────────────────────────────────────────────",
        );
        console.warn(
          "  ⚠️  ARCHITECT FORMAT: la sezione '## TASK VALIDATI' era in formato lista,",
        );
        console.warn(
          "       non tabella markdown. Convertita automaticamente prima del parsing.",
        );
        console.warn(
          "  ⚠️  Considera di rafforzare l'ARCHITECT_PROMPT per evitare il problema.",
        );
        console.warn(
          "  ⚠️  ──────────────────────────────────────────────────────\n",
        );
      }

      if (tasks.length === 0) {
        console.log(
          "  ℹ️  Architect ha validato 0 task (tutti scartati). Nessun task da proporre.\n",
        );
      }

      // Nessun fallback alla sezione originale: la decisione dell'architect è definitiva
      return { tasks, architectFormatValid: true };
    }

    // La sezione ## TASK VALIDATI è assente o non ha struttura tabella
    // (neanche dopo il tentativo di normalizzazione da lista) → formato invalido
    console.warn(
      "\n  ⚠️  ──────────────────────────────────────────────────────",
    );
    console.warn(
      "  ⚠️  ARCHITECT FORMAT INVALIDO: il file architect esiste ma non contiene",
    );
    console.warn(
      "       una sezione '## TASK VALIDATI' con tabella markdown parseable",
    );
    console.warn(
      "       (neanche dopo tentativo di normalizzazione da lista).",
    );
    console.warn(
      "       Il filtro architect è stato IGNORATO — fallback al report originale Horus.",
    );
    console.warn(
      "  ⚠️  Rafforzare l'ARCHITECT_PROMPT per evitare output in formato libero.",
    );
    console.warn(
      "  ⚠️  ──────────────────────────────────────────────────────\n",
    );

    // Fallback: sezione originale Horus (filtro architect perso)
    const originalSection = extractTaskTable(reportContent, "## TASK PROPOSTI DA HORUS");
    if (originalSection) return { tasks: parseTaskTable(originalSection), architectFormatValid: false };
    return { tasks: [], architectFormatValid: false };
  }

  // Nessuna revisione architect: usa direttamente la sezione originale
  const originalSection = extractTaskTable(reportContent, "## TASK PROPOSTI DA HORUS");
  if (originalSection) return { tasks: parseTaskTable(originalSection), architectFormatValid: true };

  return { tasks: [], architectFormatValid: true };
}

// ─── Deduplicazione contro backlog (via file) ─────────────────────────────────

/**
 * Path del file backlog scritto dall'agente Replit prima di ogni triage.
 * Contiene i titoli dei task attivi (non CANCELLED/MERGED) come array JSON.
 * Supporta sia `string[]` che `{ titles: string[] }`.
 */
const BACKLOG_FILE_DEFAULT = path.join(ROOT, ".local", "horus-backlog.json");

function parseBacklogFileArg(): string | null {
  const i = process.argv.indexOf("--backlog-file");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

async function fetchExistingTaskTitles(): Promise<string[]> {
  const backlogFile = parseBacklogFileArg() ?? BACKLOG_FILE_DEFAULT;
  if (!fs.existsSync(backlogFile)) {
    console.warn(
      `\n  ⚠️  Backlog non disponibile — deduplicazione saltata.\n` +
      `       File atteso: ${path.relative(ROOT, backlogFile)}\n` +
      `       Per attivare la deduplicazione, chiedi all'agente di scrivere\n` +
      `       i titoli dei task attivi in quel file prima del triage,\n` +
      `       oppure passa --backlog-file <path>.\n`,
    );
    return [];
  }
  try {
    const raw = fs.readFileSync(backlogFile, "utf8");
    const data = JSON.parse(raw) as { titles?: string[] } | string[];
    const titles = Array.isArray(data) ? data : ((data as { titles?: string[] }).titles ?? []);
    const filtered = titles.filter((t): t is string => typeof t === "string" && t.length > 0);
    return filtered;
  } catch (err) {
    console.warn(
      `\n  ⚠️  Errore lettura backlog (${backlogFile}): ${(err as Error).message}\n` +
      `       Deduplicazione saltata.\n`,
    );
    return [];
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function isDuplicate(title: string, existingTitles: string[]): boolean {
  const n = normalize(title);
  return existingTitles.some((t) => {
    const en = normalize(t);
    // Considera duplicato se ≥70% delle parole coincidono (Jaccard semplificato)
    const a = new Set(n.split(" "));
    const b = new Set(en.split(" "));
    const intersection = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    return union > 0 && intersection / union >= 0.7;
  });
}

// ─── Estrazione contesto dal report ───────────────────────────────────────────

const STOP_WORDS = new Set([
  "il", "la", "lo", "gli", "le", "un", "una", "uno", "di", "da", "in", "con",
  "su", "per", "tra", "fra", "e", "o", "ma", "se", "che", "non", "del", "della",
  "dei", "degli", "al", "alla", "ai", "agli", "nel", "nella", "nei", "nelle",
  "the", "a", "an", "of", "in", "for", "on", "with", "at", "by", "to", "is",
]);

/**
 * Estrae le righe rilevanti dalle sezioni ## PROBLEMI TROVATI e ## ANALISI CAUSE
 * del report principale, facendo un match fuzzy per keyword dal titolo del task.
 * Restituisce una stringa vuota se non trova nulla.
 */
function extractReportContext(reportContent: string, taskTitle: string): string {
  const keywords = taskTitle
    .toLowerCase()
    .replace(/[^a-zàáâãèéêëìíîïòóôõùúûü0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  if (keywords.length === 0) return "";

  function extractMatchingLines(sectionHeader: string, bulletOnly: boolean): string[] {
    const idx = reportContent.indexOf(sectionHeader);
    if (idx === -1) return [];
    const after = reportContent.slice(idx + sectionHeader.length);
    const nextSection = after.search(/\n##\s/);
    const body = nextSection === -1 ? after : after.slice(0, nextSection);
    const lines = body.split("\n");
    const candidates = bulletOnly
      ? lines.filter((l) => /^\s*[-*]/.test(l))
      : lines.filter((l) => l.trim().length > 10);
    return candidates
      .filter((l) => keywords.some((kw) => l.toLowerCase().includes(kw)))
      .slice(0, 4);
  }

  const problemLines = extractMatchingLines("## PROBLEMI TROVATI", true);
  const causeLines = extractMatchingLines("## ANALISI CAUSE", false);

  const parts: string[] = [];
  if (problemLines.length > 0) {
    parts.push("**Evidenza dal triage:**\n" + problemLines.join("\n"));
  }
  if (causeLines.length > 0) {
    parts.push("**Analisi cause:**\n" + causeLines.join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * Estrae path di file sorgente citati nel testo (es. server/foo.ts, app/bar.tsx).
 */
function extractFilePaths(text: string): string[] {
  const pathRe =
    /(?:^|[\s`"'(])((server|scripts|app|components|shared|client|lib|hooks)\/[\w./:-]+\.[a-z]{2,4})/gm;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text)) !== null) {
    const p = m[1].replace(/[,;:.)"']+$/, "");
    if (p) matches.add(p);
  }
  return [...matches].slice(0, 6);
}

// ─── Generazione file plan ────────────────────────────────────────────────────

// titleToSlug is imported from ./lib/horus-slug (pure, testable, no side effects)
export { titleToSlug };

/**
 * Scrive il file plan per un task. Se `reportContext` è fornito (estratto da
 * ## PROBLEMI TROVATI / ## ANALISI CAUSE del report principale), viene usato
 * per popolare "What & Why" e "Relevant files" con contenuto concreto.
 * Se non disponibile, usa il template generico come fallback.
 */
function writePlanFile(task: ParsedTask, slug: string, reportContext?: string): string {
  const filePath = path.join(ROOT, ".local", "tasks", `horus-${slug}.md`);

  // ── What & Why ──
  let whatAndWhy: string;
  if (reportContext && reportContext.trim().length > 0) {
    whatAndWhy =
      reportContext.trim() +
      (task.action ? `\n\n**Azione proposta:** ${task.action}` : "");
  } else {
    // Fallback al testo dalla tabella markdown
    const prob = task.problem && task.problem !== "vedi analisi" ? task.problem : "";
    const act = task.action && task.action !== "vedi analisi" ? task.action : "";
    whatAndWhy = [prob, act].filter(Boolean).join(" ") || "Problema identificato dal triage Horus.";
  }

  // ── Relevant files ──
  const fileRefs = extractFilePaths(reportContext ?? "" + " " + task.problem + " " + task.action);
  const relevantFilesSection =
    fileRefs.length > 0
      ? fileRefs.map((f) => `- \`${f}\``).join("\n")
      : "_Da identificare durante l'analisi._";

  const content =
    `# ${task.title}\n\n` +
    `## What & Why\n` +
    `${whatAndWhy}\n\n` +
    `## Done looks like\n` +
    `- Il problema "${task.title.toLowerCase()}" è risolto e verificabile.\n` +
    `- Nessuna regressione sui flussi correlati.\n\n` +
    `## Out of scope\n` +
    `- Refactoring non correlato al problema specifico.\n\n` +
    `## Steps\n` +
    `1. **Analisi** — Identificare il file/componente coinvolto e la causa radice.\n` +
    `2. **Fix** — Implementare la correzione minima necessaria.\n` +
    `3. **Verifica** — Confermare che il problema non si ripresenta.\n\n` +
    `## Relevant files\n` +
    `${relevantFilesSection}\n\n` +
    `---\n` +
    `_Proposto automaticamente da Horus triage. Priorità: ${task.priority}._\n`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n  [horus-propose-tasks] Avvio preparazione proposta task...\n");

  // ── Trova report ──
  const reportArg = parseReportArg();
  const reportPath = reportArg ?? findLatestReport();
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error("  ❌ Nessun report Horus trovato. Esegui prima log-analysis-horus.ts.");
    process.exitCode = 1;
    return;
  }

  const reportContent = fs.readFileSync(reportPath, "utf8");
  console.log(`  📄 Report: ${path.relative(ROOT, reportPath)}`);

  // ── Leggi revisione architect se disponibile ──
  let architectContent: string | null = null;
  if (HAS_ARCHITECT_REVIEW) {
    const architectPath = reportPath.replace(".md", "-architect.md");
    if (fs.existsSync(architectPath)) {
      architectContent = fs.readFileSync(architectPath, "utf8");
      console.log(`  📐 Revisione architect: ${path.relative(ROOT, architectPath)}`);
    }
  }

  // ── Parsing task ──
  const { tasks, architectFormatValid } = parseTasks(reportContent, architectContent);
  if (architectContent && !architectFormatValid) {
    console.warn(
      "  ⚠️  architectFormatValid=false — la revisione architect non ha prodotto una tabella\n" +
      "       valida e il suo filtro è stato ignorato. I task vengono presi dal report originale.\n",
    );
  }
  if (tasks.length === 0) {
    console.log("  ℹ️  Nessun task trovato nel report. Niente da proporre.\n");
    return;
  }
  console.log(`  🔍 Task trovati nel report: ${tasks.length}`);

  // ── Deduplicazione ──
  const existingTitles = await fetchExistingTaskTitles();
  console.log(`  📋 Task nel backlog (attivi): ${existingTitles.length}`);

  const skipped: string[] = [];
  const valid: Array<ParsedTask & { slug: string; filePath: string }> = [];

  for (const task of tasks) {
    if (isDuplicate(task.title, existingTitles)) {
      skipped.push(task.title);
      console.log(`  ⏭️  Saltato (duplicato): "${task.title}"`);
    } else {
      const slug = titleToSlug(task.title);
      const reportContext = extractReportContext(reportContent, task.title);
      const filePath = writePlanFile(task, slug, reportContext);
      valid.push({ ...task, slug, filePath });
      console.log(`  ✅ Pronto: "${task.title}" → .local/tasks/horus-${slug}.md`);
    }
  }

  // ── Manifest JSON ──
  const manifest = {
    generatedAt: new Date().toISOString(),
    reportPath,
    hasArchitectReview: !!architectContent,
    architectFormatValid,
    tasks: valid.map((t) => ({
      title: t.title,
      priority: t.priority,
      filePath: path.relative(ROOT, t.filePath),
      slug: t.slug,
    })),
    skipped,
  };

  const manifestDir = process.env.HORUS_LOG_DIR
    ? path.resolve(process.env.HORUS_LOG_DIR)
    : path.join(ROOT, "logs");
  const manifestPath = path.join(manifestDir, "horus-tasks-pending.json");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // ── Riepilogo ──
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  RIEPILOGO PROPOSTA TASK");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  ✅ Task pronti da proporre : ${valid.length}`);
  console.log(`  ⏭️  Task saltati (duplicati): ${skipped.length}`);
  console.log(`  💾 Manifest: ${path.relative(ROOT, manifestPath)}`);

  if (valid.length > 0) {
    console.log("\n  File plan generati:");
    for (const t of valid) {
      console.log(`    • .local/tasks/horus-${t.slug}.md  [${t.priority}]  "${t.title}"`);
    }
    console.log(
      "\n  ➡️  I task sono pronti. L'agente Replit li proporrà formalmente nel pannello Replit.\n" +
      "      Per proporli subito, chiedi all'agente: \"Proponi i task Horus pendenti\".\n",
    );
  } else {
    console.log("\n  ℹ️  Nessun nuovo task da proporre (tutti duplicati o nessun task valido).\n");
  }
}

// Run only when this file is executed directly (not imported by tests or other modules)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("[horus-propose-tasks] Errore inatteso:", err);
    process.exitCode = 1;
  });
}
