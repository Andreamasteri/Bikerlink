/**
 * generate-active-task-registry.ts
 *
 * Reads one or more task markdown files from .local/tasks/ and writes
 * .local/active-task-files.txt in the format expected by check-file-conflicts.ts:
 *
 *   TASK: #1234 Task title
 *   server/routes/foo.ts
 *   app/screens/Bar.tsx
 *
 * Usage:
 *   # Update registry from specific task files:
 *   npx ts-node scripts/generate-active-task-registry.ts .local/tasks/foo.md .local/tasks/bar.md
 *
 *   # Dry-run (print to stdout, don't write file):
 *   npx ts-node scripts/generate-active-task-registry.ts --dry-run .local/tasks/*.md
 *
 * The script extracts the "## Relevant files" section (or "## File coinvolti")
 * from each markdown file. Lines inside that section that look like file paths
 * (optionally wrapped in backticks, optionally followed by :line-ranges) are
 * included. Everything else is ignored.
 *
 * File paths are normalised: backticks stripped, line-range suffixes (:N-M) removed,
 * leading "./" removed, backslashes converted to forward slashes.
 *
 * Overwrites (does not append) the registry file each time it is run, so you can
 * re-run it whenever the set of active tasks changes.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename } from "path";

const REGISTRY_PATH = resolve(process.cwd(), ".local/active-task-files.txt");

const RELEVANT_FILES_HEADERS = [
  /^##\s+relevant files/i,
  /^##\s+file\s+coinvolti/i,
  /^##\s+files/i,
];

function extractTitle(content: string, filePath: string): string {
  // 1. Try YAML frontmatter: title: "..."
  const frontmatter = content.match(/^---[\s\S]*?^title:\s*(.+?)\s*$/im);
  if (frontmatter) return frontmatter[1].replace(/^['"]|['"]$/g, "").trim();

  // 2. Try first # heading
  const h1 = content.match(/^#\s+(.+)/m);
  if (h1) return h1[1].trim();

  // 3. Fall back to filename without extension
  return basename(filePath, ".md");
}

function normalizePath(raw: string): string {
  return raw
    .replace(/`/g, "")          // remove backticks
    .replace(/:\d[\d,\-\s]*$/, "") // strip :line-ranges like :12-34 or :12-34,56
    .replace(/\\/g, "/")        // backslash → forward slash
    .replace(/^\.\//, "")       // remove leading ./
    .trim();
}

function isLikelyFilePath(s: string): boolean {
  if (!s) return false;
  // Must contain a dot (extension) or a slash — avoids prose lines
  return /[./]/.test(s) && !/\s{2,}/.test(s) && !s.startsWith("http");
}

function extractRelevantFiles(content: string): string[] {
  const lines = content.split("\n");
  const files: string[] = [];
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect section header
    if (RELEVANT_FILES_HEADERS.some((re) => re.test(trimmed))) {
      inSection = true;
      continue;
    }

    // Stop at the next ## heading (different section)
    if (inSection && /^##\s/.test(trimmed) && !RELEVANT_FILES_HEADERS.some((re) => re.test(trimmed))) {
      break;
    }

    if (!inSection) continue;

    // Skip empty lines, comments, prose
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;

    // Strip list prefixes: "- ", "* ", "1. "
    const withoutList = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");

    const normalized = normalizePath(withoutList);
    if (isLikelyFilePath(normalized)) {
      files.push(normalized);
    }
  }

  return files;
}

function buildRegistryEntry(filePath: string): string | null {
  if (!existsSync(filePath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return null;
  }

  const content = readFileSync(filePath, "utf-8");
  const title = extractTitle(content, filePath);
  const files = extractRelevantFiles(content);

  if (files.length === 0) {
    console.warn(`⚠️  No relevant files found in: ${filePath} — skipping`);
    return null;
  }

  return `TASK: ${title}\n${files.join("\n")}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const taskFiles = args.filter((a) => !a.startsWith("--"));

  if (taskFiles.length === 0) {
    console.log("Usage: npx ts-node scripts/generate-active-task-registry.ts [--dry-run] <task1.md> [task2.md ...]");
    console.log("");
    console.log("Example:");
    console.log("  npx ts-node scripts/generate-active-task-registry.ts .local/tasks/foo.md .local/tasks/bar.md");
    process.exit(0);
  }

  const header = [
    "# .local/active-task-files.txt",
    "#",
    "# Registry of files claimed by IN_PROGRESS / QUEUED tasks.",
    "# Used by scripts/check-file-conflicts.ts to detect merge conflicts early.",
    "#",
    "# FORMAT:",
    "#   TASK: <task title or #ID title>",
    "#   path/to/file.ts",
    "#   path/to/another.tsx",
    "#",
    "# Rules:",
    "#   - Lines starting with '#' are comments and are ignored.",
    "#   - 'TASK:' starts a new task block; everything below it (until the next",
    "#     'TASK:' or EOF) is treated as a file path claimed by that task.",
    "#   - File paths are relative to the project root, forward-slashes only.",
    "#   - A path that ends without an extension (e.g. 'server/routes/') acts as",
    "#     a prefix: any file under that directory is considered claimed.",
    "#",
    "# Regenerate with:",
    "#   npx ts-node scripts/generate-active-task-registry.ts <task.md> [...]",
    "#",
    `# Last generated: ${new Date().toISOString()}`,
    "",
  ].join("\n");

  const entries: string[] = [];

  for (const taskFile of taskFiles) {
    const entry = buildRegistryEntry(taskFile);
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    console.error("❌ No valid entries generated — registry not written.");
    process.exit(1);
  }

  const output = header + entries.join("\n\n") + "\n";

  if (dryRun) {
    console.log(output);
  } else {
    writeFileSync(REGISTRY_PATH, output, "utf-8");
    console.log(`✅ Registry written to ${REGISTRY_PATH}`);
    console.log(`   ${entries.length} task(s) registered.`);
    entries.forEach((e) => {
      const firstLine = e.split("\n")[0];
      const fileCount = e.split("\n").length - 1;
      console.log(`   • ${firstLine.replace("TASK: ", "")} (${fileCount} file${fileCount !== 1 ? "s" : ""})`);
    });
  }
}

main();
