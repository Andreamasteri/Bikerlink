/**
 * Horus backlog cleanup helpers.
 *
 * Extracted into their own module so they can be unit-tested in isolation
 * without pulling in the DB / Ollama / GitHub dependencies of the main
 * log-analysis-horus.ts script.
 *
 * All functions are pure or operate only on the filesystem path explicitly
 * passed to them — no reference to ROOT or module-level state.
 */

import fs from "fs";
import path from "path";

/**
 * Normalises a task title for Jaccard comparison: lowercase, strip
 * punctuation, collapse whitespace.
 *
 * Same algorithm used by `isDuplicate()` in horus-propose-tasks.ts —
 * keep them in sync.
 */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Jaccard similarity between two normalised title strings.
 * Returns a value in [0, 1].
 *
 * The unit of comparison is individual words (space-split tokens), so the
 * metric is sensitive to vocabulary overlap regardless of word order.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Reads the first H1 heading of a markdown file.
 * Returns `null` when the file is unreadable or has no H1.
 */
export function readMarkdownTitle(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const firstLine = content.split("\n").find((l) => l.startsWith("# "));
    if (!firstLine) return null;
    const title = firstLine.replace(/^#\s+/, "").trim();
    return title.length > 0 ? title : null;
  } catch {
    return null;
  }
}

/**
 * Removes `horus-*.md` files from `tasksDir` that are already covered by
 * a numbered task file (`NNN-*.md`) based on Jaccard title similarity ≥ 0.7.
 *
 * A Horus proposal is considered superseded only when its title is
 * *highly similar* (≥ 0.7) to a numbered task — not merely when a few common
 * words overlap.  Short titles (≤ 3 words) require an exact set-match to be
 * deleted, since Jaccard on tiny sets is unreliable.
 *
 * @param tasksDir  Absolute path to the tasks directory (e.g. `.local/tasks`).
 *                  Accepts an explicit parameter so tests can pass a temp dir.
 * @returns Number of files actually removed.
 */
export function cleanupStaleHorusFiles(tasksDir: string): number {
  if (!fs.existsSync(tasksDir)) return 0;

  let allFiles: string[];
  try {
    allFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
  } catch (err) {
    console.warn(
      `  ⚠️  cleanupStaleHorusFiles: cannot read ${tasksDir}: ${(err as Error).message}`,
    );
    return 0;
  }

  // horus-*.md are candidates; numbered NNN-*.md represent accepted tasks
  const horusFiles = allFiles.filter((f) => f.startsWith("horus-"));
  const numberedFiles = allFiles.filter((f) => /^\d/.test(f) && !f.startsWith("horus-"));

  if (horusFiles.length === 0 || numberedFiles.length === 0) return 0;

  // Build the set of normalised titles from accepted numbered task files
  const numberedTitles: string[] = [];
  for (const f of numberedFiles) {
    const title = readMarkdownTitle(path.join(tasksDir, f));
    if (title) numberedTitles.push(normalizeTitle(title));
  }

  let removed = 0;
  for (const horusFile of horusFiles) {
    const fullPath = path.join(tasksDir, horusFile);
    const title = readMarkdownTitle(fullPath);
    if (!title) continue;

    const normalizedHorus = normalizeTitle(title);
    const horusWords = normalizedHorus.split(" ").filter(Boolean);

    const isSuperseded = numberedTitles.some((nt) => {
      const sim = jaccardSimilarity(normalizedHorus, nt);
      // Extra guard: for very short titles (≤ 3 unique words) demand a perfect
      // set match (sim === 1) to avoid false-positive deletions driven by
      // common-word overlap (e.g. both mentioning "watchdog" and "alert").
      if (horusWords.length <= 3) return sim === 1;
      return sim >= 0.7;
    });

    if (isSuperseded) {
      try {
        fs.rmSync(fullPath);
        removed++;
        console.log(`  🧹 Removed stale horus file: ${horusFile}`);
      } catch (err) {
        console.warn(`  ⚠️  Cannot remove ${horusFile}: ${(err as Error).message}`);
      }
    }
  }

  return removed;
}
