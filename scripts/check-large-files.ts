import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, relative } from "path";

const MAX_LINES = 600;
const SCAN_EXTENSIONS = [".ts", ".tsx"];
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".expo",
  ".git",
  "dist",
  "server_dist",
  "build",
  "coverage",
  ".turbo",
]);
const EXCLUDED_FILES = new Set([
  "scripts/check-large-files.ts",
]);

function countLines(filePath: string): number {
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

function scanDir(dir: string, results: Array<{ file: string; lines: number }>): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      scanDir(fullPath, results);
    } else if (EXCLUDED_FILES.has(relative(process.cwd(), fullPath).replace(/\\/g, "/"))) {
      continue;
    } else if (SCAN_EXTENSIONS.includes(extname(entry))) {
      const lines = countLines(fullPath);
      if (lines > MAX_LINES) {
        results.push({ file: relative(process.cwd(), fullPath), lines });
      }
    }
  }
}

const root = process.cwd();
const violations: Array<{ file: string; lines: number }> = [];
scanDir(root, violations);

violations.sort((a, b) => b.lines - a.lines);

if (violations.length === 0) {
  console.log(`✅ All TypeScript files are under ${MAX_LINES} lines.`);
  process.exit(0);
} else {
  console.error(`\n❌ Found ${violations.length} file(s) exceeding ${MAX_LINES} lines:\n`);
  const maxLen = Math.max(...violations.map((v) => v.file.length));
  for (const { file, lines } of violations) {
    const excess = lines - MAX_LINES;
    console.error(`  ${file.padEnd(maxLen + 2)} ${lines} lines  (+${excess} over limit)`);
  }
  console.error(`\nPlease split these files into focused modules before committing.\n`);

  const proposalLines: string[] = [
    "",
    "=== PROPOSTA TASK ===",
    `Titolo suggerito: Split file TypeScript — ${violations.length} file oltre i ${MAX_LINES} righe`,
    "",
    "File da splittare (Relevant files per il task):",
  ];
  for (const { file, lines } of violations) {
    proposalLines.push(`  - ${file}  (${lines} righe, +${lines - MAX_LINES} oltre il limite)`);
  }
  proposalLines.push(
    "",
    "Nota per l'agente:",
    `  Crea un task di split con questi file come "Relevant files".`,
    `  Soglia: ${MAX_LINES} righe per file.`,
    "  Obiettivo: spezzare ogni file in moduli focalizzati (es. un file per route,",
    "  un file per tipo di helper, un barrel index.ts per i re-export).",
    "  Aggiorna tutti gli import nei file che li usano dopo lo split.",
    "=== FINE PROPOSTA ===",
    "",
  );

  console.error(proposalLines.join("\n"));
  process.exit(1);
}
