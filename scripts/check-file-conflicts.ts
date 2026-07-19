import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

const ACTIVE_TASK_FILES = resolve(process.cwd(), ".local/active-task-files.txt");

interface TaskEntry {
  task: string;
  files: string[];
}

function parseActiveTaskFiles(): TaskEntry[] {
  if (!existsSync(ACTIVE_TASK_FILES)) {
    return [];
  }
  const content = readFileSync(ACTIVE_TASK_FILES, "utf-8");
  const entries: TaskEntry[] = [];
  let currentTask: string | null = null;
  let currentFiles: string[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("TASK:")) {
      if (currentTask !== null && currentFiles.length > 0) {
        entries.push({ task: currentTask, files: currentFiles });
      }
      currentTask = line.slice("TASK:".length).trim();
      currentFiles = [];
    } else if (currentTask !== null && line.length > 0) {
      currentFiles.push(normalizePath(line));
    }
  }

  if (currentTask !== null && currentFiles.length > 0) {
    entries.push({ task: currentTask, files: currentFiles });
  }

  return entries;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

async function readInputFiles(): Promise<string[]> {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return args.map(normalizePath);
  }
  // No args provided — nothing to check.
  // Stdin reading is intentionally omitted: in non-interactive environments
  // (CI, validation pipeline) stdin never closes, causing an infinite block.
  return [];
}

async function main(): Promise<void> {
  const inputFiles = await readInputFiles();

  if (inputFiles.length === 0) {
    console.log("Usage: npx ts-node scripts/check-file-conflicts.ts <file1> [file2] ...");
    console.log("       echo 'file1\\nfile2' | npx ts-node scripts/check-file-conflicts.ts");
    console.log("");
    console.log(`Active task registry: ${ACTIVE_TASK_FILES}`);
    return;
  }

  const taskEntries = parseActiveTaskFiles();

  if (taskEntries.length === 0) {
    console.log(`⚠️  Nessun task attivo trovato in ${ACTIVE_TASK_FILES}`);
    console.log(
      "   Crea il file con il formato:\n" +
      "     TASK: #1234 Nome task\n" +
      "     server/routes/foo.ts\n" +
      "     app/screens/Bar.tsx\n"
    );
    return;
  }

  const conflicts: Array<{ file: string; task: string }> = [];

  for (const file of inputFiles) {
    for (const entry of taskEntries) {
      if (entry.files.some((f) => f === file || file.startsWith(f) || f.startsWith(file))) {
        conflicts.push({ file, task: entry.task });
      }
    }
  }

  if (conflicts.length === 0) {
    console.log("✅ Nessun conflitto trovato — i file in input non sono toccati da altri task attivi.");
    return;
  }

  console.error(`\n⚠️  CONFLITTI RILEVATI: ${conflicts.length} file in comune con task attivi\n`);

  const maxFileLen = Math.max(...conflicts.map((c) => c.file.length));
  const header = `  ${"FILE".padEnd(maxFileLen + 2)}TASK`;
  const separator = "  " + "─".repeat(maxFileLen + 2) + "─".repeat(40);

  console.error(header);
  console.error(separator);

  for (const { file, task } of conflicts) {
    console.error(`  ${file.padEnd(maxFileLen + 2)}${task}`);
  }

  console.error("");
  console.error(
    "⚡ Questi file sono già toccati da altri task IN_PROGRESS o QUEUED.\n" +
    "   Coordinati con quei task prima di procedere per evitare conflitti al merge."
  );
  console.error("");

  process.exit(1);
}

function runLargeFilesRatchet(): number {
  // Gate "max 800 righe per file" — chiamato anche da pre-commit e post-merge.
  // Vedi replit.md → "⛔ REGOLA FERREA — Limite 800 righe per file".
  const r = spawnSync("bash", ["scripts/check-large-files-ratchet.sh"], {
    stdio: "inherit",
  });
  return r.status ?? 1;
}

main()
  .then(() => {
    const code = runLargeFilesRatchet();
    process.exit(code);
  })
  .catch((err) => {
    console.error("Errore:", err);
    runLargeFilesRatchet();
    process.exit(1);
  });
