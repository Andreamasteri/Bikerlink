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
import { db } from "../server/db";
import { sql } from "drizzle-orm";

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
  const logsDir = path.join(ROOT, "logs");
  if (!fs.existsSync(logsDir)) return null;
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("horus-log-analysis-") && f.endsWith(".md") && !f.includes("architect"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(logsDir, files[0]) : null;
}

// ─── Parsing task dalla tabella markdown ──────────────────────────────────────

export interface ParsedTask {
  title: string;
  priority: "alta" | "media" | "bassa" | string;
  problem: string;
  action: string;
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

    const [title, priority, problem = "", action = ""] = cells;
    if (!title || title.startsWith("Titolo")) continue;

    tasks.push({ title, priority: priority?.toLowerCase() ?? "media", problem, action });
  }

  return tasks;
}

function parseTasks(reportContent: string, architectContent: string | null): ParsedTask[] {
  // Preferisce la sezione validata dall'architect se disponibile
  if (architectContent) {
    const validatedSection = extractTaskTable(architectContent, "## TASK VALIDATI");
    if (validatedSection) {
      const tasks = parseTaskTable(validatedSection);
      if (tasks.length > 0) return tasks;
    }
  }

  // Fallback: sezione originale Horus
  const originalSection = extractTaskTable(reportContent, "## TASK PROPOSTI DA HORUS");
  if (originalSection) return parseTaskTable(originalSection);

  return [];
}

// ─── Deduplicazione contro backlog ────────────────────────────────────────────

async function fetchExistingTaskTitles(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`
      SELECT title FROM project_tasks
      WHERE state NOT IN ('CANCELLED', 'MERGED')
      ORDER BY created_at DESC
    `);
    return (rows.rows as Array<{ title: string }>).map((r) => r.title ?? "").filter(Boolean);
  } catch {
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

// ─── Generazione file plan ────────────────────────────────────────────────────

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[àáâã]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôõ]/g, "o").replace(/[ùúûü]/g, "u").replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .slice(0, 60).replace(/^-|-$/g, "");
}

function writePlanFile(task: ParsedTask, slug: string): string {
  const filePath = path.join(ROOT, ".local", "tasks", `horus-${slug}.md`);
  const content =
    `# ${task.title}\n\n` +
    `## What & Why\n` +
    `${task.problem || "Problema identificato dal triage Horus."} ${task.action || ""}\n\n` +
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
    `_Da identificare durante l'analisi._\n\n` +
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
  const tasks = parseTasks(reportContent, architectContent);
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
      const filePath = writePlanFile(task, slug);
      valid.push({ ...task, slug, filePath });
      console.log(`  ✅ Pronto: "${task.title}" → .local/tasks/horus-${slug}.md`);
    }
  }

  // ── Manifest JSON ──
  const manifest = {
    generatedAt: new Date().toISOString(),
    reportPath,
    hasArchitectReview: !!architectContent,
    tasks: valid.map((t) => ({
      title: t.title,
      priority: t.priority,
      filePath: path.relative(ROOT, t.filePath),
      slug: t.slug,
    })),
    skipped,
  };

  const manifestPath = path.join(ROOT, "logs", "horus-tasks-pending.json");
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
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

main().catch((err) => {
  console.error("[horus-propose-tasks] Errore inatteso:", err);
  process.exitCode = 1;
});
