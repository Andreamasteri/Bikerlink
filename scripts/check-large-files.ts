/**
 * Standalone diagnostic: list TypeScript files exceeding MAX_LINES (currently 800).
 *
 * This script is now MARKER-AWARE:
 *   - `// LARGE-FILE-ALLOW: <motivo>` on line 1 → skipped IF path appears
 *     in `.large-files-allow.txt`. Otherwise hard error.
 *   - `// LARGE-FILE-LOCKED — limite: <N>` on line 1 → uses N as the limit;
 *     drift ±5 is enforced (over → block, under → shrink hint).
 *
 * The CI gate lives in `scripts/check-large-files-ratchet.sh`. This file
 * remains a useful local helper for "show me the offenders".
 */
import {
  MAX_LINES,
  LOCKED_DRIFT,
  buildFileState,
  loadAllowList,
} from "./lib/large-files-core";

const state = buildFileState();
const allowList = loadAllowList();

interface Violation {
  file: string;
  lines: number;
  limit: number;
  kind: "default" | "locked";
  companion?: string;
}
const violations: Violation[] = [];
const allowErrors: string[] = [];
const lockedShrinkHints: string[] = [];
const allowed: { file: string; lines: number; reason: string }[] = [];
const lockedOk: { file: string; lines: number; limit: number; companion?: string }[] = [];

for (const entry of state) {
  if (entry.marker?.kind === "ALLOW") {
    if (!allowList.has(entry.file)) {
      allowErrors.push(
        `  ${entry.file}  → marker LARGE-FILE-ALLOW presente ma file NON in .large-files-allow.txt`,
      );
      continue;
    }
    allowed.push({ file: entry.file, lines: entry.lines, reason: entry.marker.reason ?? "" });
    continue;
  }

  if (entry.marker?.kind === "LOCKED") {
    const limit = entry.marker.lockedLimit ?? MAX_LINES;
    const diff = entry.lines - limit;
    if (diff > LOCKED_DRIFT) {
      violations.push({
        file: entry.file,
        lines: entry.lines,
        limit,
        kind: "locked",
        companion: entry.marker.companionPath,
      });
    } else {
      lockedOk.push({
        file: entry.file,
        lines: entry.lines,
        limit,
        companion: entry.marker.companionPath,
      });
      if (limit - entry.lines > LOCKED_DRIFT) {
        lockedShrinkHints.push(
          `  ${entry.file}: ${entry.lines} righe, limite ${limit} (shrink di ${limit - entry.lines}; valuta --update-baseline)`,
        );
      }
    }
    continue;
  }

  if (entry.lines > MAX_LINES) {
    violations.push({
      file: entry.file,
      lines: entry.lines,
      limit: MAX_LINES,
      kind: "default",
    });
  }
}

violations.sort((a, b) => b.lines - a.lines);

if (allowErrors.length > 0) {
  console.error(
    `\n❌ ${allowErrors.length} file con marker LARGE-FILE-ALLOW non autorizzato:\n`,
  );
  for (const e of allowErrors) console.error(e);
  console.error(
    `\nAuto-discovery proibita. Aggiunte a .large-files-allow.txt richiedono task utente esplicito.\n`,
  );
}

if (violations.length === 0 && allowErrors.length === 0) {
  console.log(`✅ Nessun file oltre il limite (default ${MAX_LINES}, locked custom).`);
  if (allowed.length > 0) {
    console.log(`   (${allowed.length} file esclusi via LARGE-FILE-ALLOW, ${lockedOk.length} LOCKED entro limite)`);
  }
  if (lockedShrinkHints.length > 0) {
    console.log(`\nℹ️  Shrink rilevato su file LOCKED:`);
    for (const h of lockedShrinkHints) console.log(h);
  }
  process.exit(0);
}

if (violations.length > 0) {
  console.error(`\n❌ Trovati ${violations.length} file oltre il limite:\n`);
  const maxLen = Math.max(...violations.map((v) => v.file.length));
  for (const v of violations) {
    const excess = v.lines - v.limit;
    const tag = v.kind === "locked" ? ` [LOCKED limite=${v.limit}]` : "";
    const comp = v.companion ? `  → companion: ${v.companion}` : "";
    console.error(
      `  ${v.file.padEnd(maxLen + 2)} ${v.lines} righe  (+${excess} oltre ${v.limit})${tag}${comp}`,
    );
  }
  console.error(`\nSplittare in moduli focalizzati prima di committare.\n`);
}

if (lockedShrinkHints.length > 0) {
  console.log(`\nℹ️  Shrink rilevato su file LOCKED:`);
  for (const h of lockedShrinkHints) console.log(h);
}

process.exit(violations.length > 0 || allowErrors.length > 0 ? 1 : 0);
