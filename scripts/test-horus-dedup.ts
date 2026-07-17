/**
 * BikerLink — Verifica end-to-end della deduplicazione backlog Horus (Task #430)
 *
 * Confirma che:
 * 1. Il backlog viene generato da .local/tasks/*.md con N > 0 titoli (N = conteggio reale)
 * 2. La deduplicazione (Jaccard ≥ 0.7) identifica TUTTI i duplicati attesi (0 miss tollerati)
 * 3. Esattamente i task nuovi attesi compaiono nel manifest — né uno di più, né uno di meno
 * 4. Nessun titolo del backlog reale compare nel manifest finale
 *
 * Il test usa output isolati (/tmp) per evitare che file stantii soddisfino le verifiche.
 * Non richiede il ThinkCentre: usa un report Horus sintetico.
 *
 * Uso:
 *   npx tsx scripts/test-horus-dedup.ts
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const setA = new Set(na.split(" ").filter(Boolean));
  const setB = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/** Stampa un'intestazione di sezione. */
function section(title: string): void {
  console.log(`\n  ── ${title} ──`);
}

// ─── Passo 1: Genera backlog da .local/tasks/*.md ─────────────────────────────

function generateBacklog(): { titles: string[]; fileCount: number } {
  const tasksDir = path.join(ROOT, ".local", "tasks");
  const backlogFile = path.join(ROOT, ".local", "horus-backlog.json");

  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
  const titles: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(tasksDir, file), "utf8");
      const firstLine = content.split("\n").find((l) => l.startsWith("# "));
      if (firstLine) {
        const title = firstLine.replace(/^#\s+/, "").trim();
        if (title.length > 0) titles.push(title);
      }
    } catch {
      // file non leggibile: saltato
    }
  }

  fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
  fs.writeFileSync(
    backlogFile,
    JSON.stringify(
      { titles, generatedAt: new Date().toISOString(), source: "task-files", fileCount: files.length },
      null,
      2,
    ),
    "utf8",
  );

  return { titles, fileCount: files.length };
}

// ─── Passo 2: Selezione candidati duplicati ───────────────────────────────────

function pickDuplicateCandidates(titles: string[], n: number): string[] {
  return titles
    .filter((t) => {
      const words = normalize(t).split(" ").filter(Boolean);
      return words.length >= 4;
    })
    .slice(0, n);
}

// ─── Passo 3: Crea report Horus sintetico ─────────────────────────────────────

function buildMockReport(duplicateTitles: string[], newTitles: string[]): string {
  const allTasks = [
    ...duplicateTitles.map((t) => ({ title: t })),
    ...newTitles.map((t) => ({ title: t })),
  ];

  const tableRows = allTasks
    .map(({ title }) => `| ${title} | media | Problema rilevato dal triage | Applicare la correzione |`)
    .join("\n");

  return [
    "## PROBLEMI TROVATI",
    "",
    "- Alcune anomalie rilevate nel sistema BikerLink.",
    "",
    "## ANALISI CAUSE",
    "",
    "Analisi basata sui log e dati DB raccolti.",
    "",
    "## CORRELAZIONI TROVATE",
    "",
    "Nessuna correlazione critica identificata in questa sessione.",
    "",
    "## TASK PROPOSTI DA HORUS",
    "",
    "| Titolo | Priorità | Problema | Azione |",
    "|--------|----------|---------|--------|",
    tableRows,
    "",
  ].join("\n");
}

// ─── Passo 4: Esegui horus-propose-tasks.ts con output isolati ───────────────

interface ProposeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runProposeScript(
  reportPath: string,
  manifestDir: string,
): ProposeResult {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/horus-propose-tasks.ts", "--report", reportPath],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        // Redirect manifest output to the isolated /tmp dir so stale logs/ files
        // cannot satisfy the assertions.
        HORUS_LOG_DIR: manifestDir,
      },
    },
  );

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

// ─── Passo 5: Verifica strict ─────────────────────────────────────────────────

interface Manifest {
  tasks: Array<{ title: string }>;
  skipped: string[];
}

interface VerifyResult {
  errors: string[];
}

function verifyManifest(
  manifest: Manifest,
  duplicateTitles: string[],
  newTitles: string[],
  backlogTitles: string[],
  generatedBacklogCount: number,
  backlogReadCount: number,
): VerifyResult {
  const errors: string[] = [];

  // ── Verifica 1: il conteggio backlog letto deve corrispondere a quello generato ──
  if (backlogReadCount !== generatedBacklogCount) {
    errors.push(
      `❌ Backlog letto (${backlogReadCount}) ≠ backlog generato (${generatedBacklogCount}). ` +
      `Il file .local/horus-backlog.json non è stato aggiornato prima del run.`,
    );
  } else {
    console.log(`  ✅ Backlog letto correttamente: ${backlogReadCount} titoli (= generati).`);
  }

  // ── Verifica 2: TUTTI i duplicati devono essere in skipped (nessun miss tollerato) ──
  for (const dupTitle of duplicateTitles) {
    const found = manifest.skipped.some(
      (s) => jaccardSimilarity(s.replace(/\*\*/g, "").trim(), dupTitle) >= 0.5,
    );
    if (!found) {
      errors.push(
        `❌ Duplicato NON catturato: "${dupTitle}" — non presente in skipped=[${manifest.skipped.join(", ")}].`,
      );
    } else {
      console.log(`  ✅ Duplicato catturato: "${dupTitle.slice(0, 60)}"`);
    }
  }

  // ── Verifica 3: esattamente newTitles.length task nel manifest (né più né meno) ──
  if (manifest.tasks.length !== newTitles.length) {
    errors.push(
      `❌ Manifest contiene ${manifest.tasks.length} task, attesi esattamente ${newTitles.length}. ` +
      `Titoli presenti: [${manifest.tasks.map((t) => `"${t.title}"`).join(", ")}]`,
    );
  } else {
    console.log(`  ✅ Manifest contiene esattamente ${manifest.tasks.length} task (come atteso).`);
  }

  // ── Verifica 4: i task nuovi devono essere nel manifest, non negli skipped ──
  for (const newTitle of newTitles) {
    const inManifest = manifest.tasks.some(
      (t) => jaccardSimilarity(t.title.replace(/\*\*/g, "").trim(), newTitle) >= 0.5,
    );
    const inSkipped = manifest.skipped.some(
      (s) => jaccardSimilarity(s.replace(/\*\*/g, "").trim(), newTitle) >= 0.5,
    );
    if (!inManifest) {
      if (inSkipped) {
        errors.push(
          `❌ Task nuovo "${newTitle}" è finito negli skipped anziché nel manifest — dedup troppo aggressiva.`,
        );
      } else {
        errors.push(
          `❌ Task nuovo "${newTitle}" non trovato né nel manifest né negli skipped — parsing fallito.`,
        );
      }
    } else {
      console.log(`  ✅ Task nuovo nel manifest: "${newTitle.slice(0, 60)}"`);
    }
  }

  // ── Verifica 5: nessun titolo del backlog reale nel manifest finale ──
  for (const t of manifest.tasks) {
    const cleanTitle = t.title.replace(/\*\*/g, "").trim();
    const matched = backlogTitles.find((bt) => jaccardSimilarity(cleanTitle, bt) >= 0.7);
    if (matched) {
      errors.push(
        `❌ Task nel manifest "${cleanTitle}" corrisponde al backlog "${matched}" (Jaccard ≥ 0.7) — duplicato non filtrato.`,
      );
    }
  }
  if (!errors.some((e) => e.includes("corrisponde al backlog"))) {
    console.log(`  ✅ Nessun duplicato del backlog presente nel manifest finale.`);
  }

  return { errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  [test-horus-dedup] Verifica deduplicazione backlog Horus");
  console.log("════════════════════════════════════════════════════════════");

  const allErrors: string[] = [];

  // ── Passo 1: Genera backlog ──
  section("1/6 — Generazione backlog da .local/tasks/*.md");
  const { titles: backlogTitles, fileCount } = generateBacklog();
  console.log(`  ${fileCount} file scansionati, ${backlogTitles.length} titoli estratti.`);
  if (backlogTitles.length === 0) {
    console.error("  ❌ ERRORE FATALE: backlog vuoto — impossibile testare la deduplicazione.");
    process.exitCode = 1;
    return;
  }
  console.log(`  📋 Backlog scritto in .local/horus-backlog.json`);

  // ── Passo 2: Candidati duplicati ──
  section("2/6 — Selezione candidati duplicati dal backlog reale");
  const EXPECTED_DUPLICATES = 3;
  const duplicateCandidates = pickDuplicateCandidates(backlogTitles, EXPECTED_DUPLICATES);
  if (duplicateCandidates.length < EXPECTED_DUPLICATES) {
    console.error(`  ❌ ERRORE FATALE: meno di ${EXPECTED_DUPLICATES} candidati disponibili nel backlog.`);
    process.exitCode = 1;
    return;
  }
  for (const d of duplicateCandidates) {
    console.log(`  📌 "${d}"`);
  }

  // Titoli genuinamente nuovi (non presenti nel backlog)
  const newTitles = [
    "Implementare backup automatico notturno del database principale",
    "Aggiungere test di integrazione per il modulo di telemetria GPS offline",
  ];

  // ── Passo 3: Mock report ──
  section("3/6 — Creazione mock report Horus");
  const mockReport = buildMockReport(duplicateCandidates, newTitles);
  // Usa /tmp per isolamento totale: nessun file in logs/ può "aiutare" il test
  const tmpDir = fs.mkdtempSync("/tmp/horus-dedup-test-");
  const mockReportPath = path.join(tmpDir, "horus-log-analysis-test.md");
  const header =
    `# Triage AI BikerLink — TEST DEDUP\n\n` +
    `- Istanza: Mock (test-horus-dedup.ts)\n` +
    `- Nota: Report sintetico per verifica deduplicazione\n\n---\n\n`;
  fs.writeFileSync(mockReportPath, header + mockReport, "utf8");
  console.log(`  Mock report: ${mockReportPath}`);
  console.log(`  Task duplicati inclusi : ${duplicateCandidates.length}`);
  console.log(`  Task nuovi inclusi     : ${newTitles.length}`);

  // ── Passo 4: Esecuzione horus-propose-tasks.ts ──
  section("4/6 — Esecuzione horus-propose-tasks.ts (output isolato in /tmp)");
  const { stdout, stderr, exitCode } = runProposeScript(mockReportPath, tmpDir);

  console.log("\n  ── stdout ──");
  console.log(stdout);
  if (stderr.trim()) {
    console.log("  ── stderr ──");
    console.log(stderr);
  }

  // Exit non-zero = errore bloccante
  if (exitCode !== 0) {
    allErrors.push(`❌ horus-propose-tasks.ts ha terminato con exitCode=${exitCode} — errore bloccante.`);
  }

  // ── Passo 5: Verifica log "📋 Backlog letto da file" ──
  section("5/6 — Verifica conteggio backlog nel log");
  const backlogLogMatch = stdout.match(/📋\s+(?:Backlog letto da file:|Task nel backlog \(attivi\):)\s+(\d+)/);
  let backlogReadCount = -1;
  if (!backlogLogMatch) {
    allErrors.push(
      "❌ Riga '📋 Backlog letto da file: N' non trovata nello stdout — " +
      "fetchExistingTaskTitles() non ha trovato il file o non ha loggato il conteggio.",
    );
  } else {
    backlogReadCount = parseInt(backlogLogMatch[1], 10);
    console.log(`  Letto dal log: ${backlogReadCount} task attivi.`);
    console.log(`  Generati     : ${backlogTitles.length} titoli.`);
  }

  // ── Passo 6: Verifica manifest ──
  section("6/6 — Verifica manifest horus-tasks-pending.json");
  const manifestPath = path.join(tmpDir, "horus-tasks-pending.json");
  if (!fs.existsSync(manifestPath)) {
    allErrors.push(`❌ Manifest non trovato in ${manifestPath}.`);
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
    const { errors } = verifyManifest(
      manifest,
      duplicateCandidates,
      newTitles,
      backlogTitles,
      backlogTitles.length,
      backlogReadCount,
    );
    allErrors.push(...errors);
  }

  // ── Pulizia ──
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // non critico
  }
  // Rimuovi eventuali file .local/tasks/horus-*.md generati dal test
  try {
    const taskFiles = fs.readdirSync(path.join(ROOT, ".local", "tasks"))
      .filter((f) => f.startsWith("horus-") && f.endsWith(".md"));
    for (const f of taskFiles) {
      const content = fs.readFileSync(path.join(ROOT, ".local", "tasks", f), "utf8");
      const isTestFile = newTitles.some((nt) => content.includes(nt.slice(0, 30)));
      if (isTestFile) {
        fs.unlinkSync(path.join(ROOT, ".local", "tasks", f));
      }
    }
  } catch {
    // non critico
  }

  // ── Riepilogo ──
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  RIEPILOGO");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Backlog generato  : ${backlogTitles.length} titoli da ${fileCount} file`);
  console.log(`  Backlog letto     : ${backlogReadCount >= 0 ? String(backlogReadCount) : "n/d"}`);
  console.log(`  Duplicati attesi  : ${EXPECTED_DUPLICATES}`);
  console.log(`  Task nuovi attesi : ${newTitles.length}`);

  if (allErrors.length > 0) {
    console.log("\n  ERRORI:");
    for (const e of allErrors) console.log(`  ${e}`);
    console.log("");
    process.exitCode = 1;
  } else {
    console.log(
      "\n  ✅ TUTTI I CONTROLLI SUPERATI — la deduplicazione funziona correttamente.\n" +
      "     Il backlog blocca la riproposta di task già presenti in .local/tasks/.\n",
    );
  }
}

main().catch((err: unknown) => {
  console.error("[test-horus-dedup] Errore inatteso:", err);
  process.exitCode = 1;
});
