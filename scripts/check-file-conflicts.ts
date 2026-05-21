import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as readline from "readline";

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

  const files: string[] = [];
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) files.push(normalizePath(trimmed));
  }
  return files;
}

async function main(): Promise<void> {
  const inputFiles = await readInputFiles();

  if (inputFiles.length === 0) {
    console.log("Usage: npx ts-node scripts/check-file-conflicts.ts <file1> [file2] ...");
    console.log("       echo 'file1\\nfile2' | npx ts-node scripts/check-file-conflicts.ts");
    console.log("");
    console.log(`Active task registry: ${ACTIVE_TASK_FILES}`);
    process.exit(0);
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
    process.exit(0);
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
    process.exit(0);
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

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
