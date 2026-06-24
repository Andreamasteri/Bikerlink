#!/usr/bin/env tsx
/**
 * fix-inline-default-memo-deps.ts
 *
 * Riscrive automaticamente il pattern pericoloso:
 *   useMemo(() => x ?? [],  [x ?? []])   →  useMemo(() => x ?? [],  [x])
 *   useMemo(() => x ?? {},  [x ?? {}])   →  useMemo(() => x ?? {},  [x])
 *   useCallback(() => ...,  [a ?? []])   →  useCallback(() => ...,  [a])
 *
 * Un [] o {} letterale nei deps di useMemo/useCallback crea un nuovo oggetto
 * ad ogni render → il memo ricalcola ad ogni render → se il risultato finisce
 * in uno stato o hook si innesca "Maximum update depth exceeded".
 *
 * Uso:
 *   npx tsx scripts/fix-inline-default-memo-deps.ts           # dry-run (default)
 *   npx tsx scripts/fix-inline-default-memo-deps.ts --apply   # scrive le modifiche
 *   npx tsx scripts/fix-inline-default-memo-deps.ts --verbose # mostra anche i file senza fix
 *
 * Pattern NON gestiti automaticamente (richiede fix manuale):
 *   useMemo(() => ..., [[], otherDep])   ← [] nudo senza ?? — impossibile scegliere
 *                                            il dep corretto automaticamente.
 */

import * as fs from "fs";
import * as path from "path";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

const IGNORE_DIRS = new Set([
  ".local",
  ".agents",
  "node_modules",
  "scripts",
  "__tests__",
]);
const SUPPRESSION = "check-inline-default-memo-deps: safe";

interface Fix {
  line: number;
  original: string;
  fixed: string;
  kind: "auto" | "manual";
  note?: string;
}

interface FileResult {
  filePath: string;
  fixes: Fix[];
}

// ─── Regex patterns ────────────────────────────────────────────────────────

// Matches a [...] block that contains [] or {} inside it.
// Same as gate: [^\[\]]* avoids crossing nested brackets.
const RE_BRACKET_WITH_INLINE =
  /\[(?:[^\[\]]*?)(?:\[\]|\{\})(?:[^\[\]]*?)\]/g;

// Is this a useMemo/useCallback opener on the same line?
const RE_HOOK_SAME_LINE = /\b(useMemo|useCallback)\s*\(/;
const RE_HOOK_OPEN = /\b(useMemo|useCallback)\s*\(/;

// Replace `something ?? []` or `something ?? {}` with just `something`
// inside the deps array.  We capture the expression before `??` carefully:
//   - optional chaining allowed: `a?.b ?? []`
//   - multi-level: `a?.b?.c ?? []`
//   - simple identifier: `items ?? {}`
// We do NOT match a standalone `[]` or `{}` without a `??` prefix.
const RE_NULLISH_WITH_LITERAL =
  /([\w?.][\w?.[\]]*)\s*\?\?\s*(?:\[\]|\{\})/g;

// A completely bare [] or {} (not preceded by ??)
const RE_BARE_LITERAL = /(?<![?.])\b(?<!\?\?)\s*(\[\]|\{\})\s*/;

// ─── Core logic ────────────────────────────────────────────────────────────

function fixDepsArray(depsMatch: string): {
  result: string;
  changed: boolean;
  hadBare: boolean;
} {
  let hadBare = false;

  // Replace `expr ?? []` and `expr ?? {}` with just `expr`
  RE_NULLISH_WITH_LITERAL.lastIndex = 0;
  const result = depsMatch.replace(
    RE_NULLISH_WITH_LITERAL,
    (_full, expr) => expr
  );

  const changed = result !== depsMatch;

  // Check if any bare [] or {} remain (couldn't be auto-fixed)
  if (RE_BRACKET_WITH_INLINE.test(result)) {
    hadBare = true;
  }
  RE_BRACKET_WITH_INLINE.lastIndex = 0;

  return { result, changed, hadBare };
}

function processFile(filePath: string): Fix[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const fixes: Fix[] = [];

  // ── PASS 1: per-line checks (Mode A & B) ─────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line;

    // Quick pre-filter
    if (
      (!stripped.includes("[]") && !stripped.includes("{}")) ||
      !stripped.includes("[")
    )
      continue;

    // Skip suppressed lines
    if (stripped.includes(SUPPRESSION)) continue;
    if (i > 0 && lines[i - 1].includes(SUPPRESSION)) continue;

    RE_BRACKET_WITH_INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = RE_BRACKET_WITH_INLINE.exec(stripped)) !== null) {
      const matchStart = match.start !== undefined ? match.index : match.index;
      const prefix = stripped.slice(0, matchStart);

      // ── MODE A: single-liner ──────────────────────────────────────────
      // useMemo/useCallback on same line; deps [...] must follow a comma.
      if (RE_HOOK_SAME_LINE.test(stripped)) {
        if (!/,\s*$/.test(prefix)) {
          continue; // not in deps position
        }
      }
      // ── MODE B: multi-liner ───────────────────────────────────────────
      // Deps array is on its own line (leading only whitespace before '[').
      else if (prefix.trim() === "") {
        let nearestHook: string | null = null;
        const blockStart = Math.max(0, i - 80);
        for (let j = i - 1; j >= blockStart; j--) {
          const m = RE_HOOK_OPEN.exec(lines[j]);
          if (m) {
            nearestHook = m[1];
            break;
          }
        }
        if (nearestHook !== "useMemo" && nearestHook !== "useCallback") {
          continue;
        }
      } else {
        continue; // not a deps position
      }

      // ── Apply fix ────────────────────────────────────────────────────
      const depsOriginal = match[0];
      const { result: depsFixed, changed, hadBare } = fixDepsArray(depsOriginal);

      if (changed) {
        const fixedLine = stripped.replace(depsOriginal, depsFixed);
        fixes.push({
          line: i + 1,
          original: stripped,
          fixed: fixedLine,
          kind: "auto",
        });
        // Update line in-place for multi-pass (same line rarely has 2 violations)
        lines[i] = fixedLine;
      }

      if (hadBare) {
        fixes.push({
          line: i + 1,
          original: stripped,
          fixed: stripped, // unchanged
          kind: "manual",
          note: "[] o {} nudo nei deps senza ?? — richiede fix manuale: scegli il dep corretto.",
        });
      }

      break; // one violation per line (same as gate)
    }
  }

  // ── PASS 2: Mode C — multi-line deps array interior lines ────────────────
  // Catches ?? [] / ?? {} on interior lines of a multi-line deps array where
  // the opening [ was on an earlier line (so Pass 1 never inspects that
  // content):
  //
  //   Mode C1 — hook + ", [" on same line, closing ] on later line:
  //     useMemo(() => x ?? [], [
  //       dep ?? [],          ← interior line, not caught by Pass 1
  //       otherDep,
  //     ]);
  //
  //   Mode C2 — standalone "[" line (Mode B), but with unclosed bracket:
  //     useMemo(
  //       () => x ?? [],
  //       [
  //         dep ?? [],        ← interior line, not caught by Pass 1
  //         count ?? {},
  //       ]
  //     );
  const RE_DEPS_OPEN_C1 = /,\s*\[\s*(?:\/\/[^\n]*)?\s*$/;
  // Bare [] or {} NOT preceded by a word character (excludes `Type[]` suffixes)
  const RE_BARE_INTERIOR = /(?<!\w)(\[\]|\{\})/;

  let ci = 0;
  while (ci < lines.length) {
    const cl = lines[ci];

    // Mode C1: hook opener on same line AND line ends with ", ["
    const isC1 = RE_HOOK_OPEN.test(cl) && RE_DEPS_OPEN_C1.test(cl);

    // Mode C2: line starts with "[" only (Mode B pattern) AND the nearest
    // preceding non-blank line ends with "," AND there is a useMemo/useCallback
    // somewhere above (same look-back window as Pass 1 Mode B).
    let isC2 = false;
    if (!isC1) {
      const lstripped = cl.trimStart();
      if (lstripped.startsWith("[")) {
        const indentPrefix = cl.slice(0, cl.length - lstripped.length);
        if (indentPrefix.trim() === "") {
          // Find nearest preceding non-blank line
          let prevNonBlank = "";
          for (let bj = ci - 1; bj >= Math.max(0, ci - 81); bj--) {
            const ps = lines[bj].trimEnd();
            if (ps.trim()) {
              prevNonBlank = ps;
              break;
            }
          }
          // Strip trailing inline comment then check it ends with ","
          const prevCode = prevNonBlank.replace(/\s*\/\/.*$/, "").trimEnd();
          if (prevCode.endsWith(",")) {
            for (let bj = ci - 1; bj >= Math.max(0, ci - 81); bj--) {
              if (RE_HOOK_OPEN.test(lines[bj])) {
                isC2 = true;
                break;
              }
            }
          }
        }
      }
    }

    if (!isC1 && !isC2) {
      ci++;
      continue;
    }

    // Count bracket depth left open after the opening line.
    // If depth <= 0, the brackets are already balanced on this line and
    // there are no interior lines to inspect (already handled by Pass 1).
    let depth = 0;
    for (const ch of cl) {
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }

    if (depth <= 0) {
      ci++;
      continue;
    }

    // Scan interior lines until the deps array closes.
    let j = ci + 1;
    while (j < lines.length && depth > 0) {
      const inner = lines[j];

      // Suppression check (same as Pass 1)
      let suppressed = inner.includes(SUPPRESSION);
      if (!suppressed && j > 0) suppressed = lines[j - 1].includes(SUPPRESSION);

      if (!suppressed) {
        // Apply nullish-with-literal replacement to the interior line content.
        RE_NULLISH_WITH_LITERAL.lastIndex = 0;
        const fixedInner = inner.replace(
          RE_NULLISH_WITH_LITERAL,
          (_full, expr) => expr
        );

        if (fixedInner !== inner) {
          fixes.push({
            line: j + 1,
            original: inner,
            fixed: fixedInner,
            kind: "auto",
          });
          lines[j] = fixedInner;

          // After auto-fix, check if a bare [] or {} still remains
          if (RE_BARE_INTERIOR.test(fixedInner)) {
            fixes.push({
              line: j + 1,
              original: fixedInner,
              fixed: fixedInner,
              kind: "manual",
              note: "[] o {} nudo nei deps senza ?? — richiede fix manuale: scegli il dep corretto.",
            });
          }
        } else if (RE_BARE_INTERIOR.test(inner)) {
          // Bare [] or {} with no ?? prefix — cannot be auto-fixed
          fixes.push({
            line: j + 1,
            original: inner,
            fixed: inner,
            kind: "manual",
            note: "[] o {} nudo nei deps senza ?? — richiede fix manuale: scegli il dep corretto.",
          });
        }
      }

      // Update bracket depth character by character
      for (const ch of inner) {
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        if (depth <= 0) break;
      }

      j++;
    }

    ci = j; // resume after the closing ] of this deps array
  }

  if (APPLY && fixes.some((f) => f.kind === "auto")) {
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  }

  return fixes;
}

// ─── Baseline updater ──────────────────────────────────────────────────────

const BASELINE_FILE = path.join(process.cwd(), ".large-files-baseline");

function updateBaseline(filePath: string): void {
  if (!fs.existsSync(BASELINE_FILE)) return;
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const lineCount = fs.readFileSync(filePath, "utf8").split("\n").length;
  const baseline = fs.readFileSync(BASELINE_FILE, "utf8");
  const pattern = new RegExp(`(LEGACY\\s+${rel.replace(/\./g, "\\.")}\\s+)\\d+`);
  if (pattern.test(baseline)) {
    const updated = baseline.replace(pattern, `$1${lineCount}`);
    fs.writeFileSync(BASELINE_FILE, updated, "utf8");
    console.log(`  📏 baseline aggiornata: ${rel} → ${lineCount}`);
  }
}

// ─── File walker ───────────────────────────────────────────────────────────

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir);

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (IGNORE_DIRS.has(name)) continue;

    const full = path.join(dir, name);
    // Use stat (follows symlinks) rather than lstat so symlinked files/dirs are included
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (stat.isFile()) {
      if (
        (name.endsWith(".ts") || name.endsWith(".tsx")) &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".test.tsx") &&
        !name.endsWith(".spec.ts") &&
        !name.endsWith(".spec.tsx") &&
        !name.endsWith(".styles.ts") &&
        !name.endsWith(".styles.tsx")
      ) {
        results.push(full);
      }
    }
  }

  return results.sort();
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const cwd = process.cwd();
  const files = walkFiles(cwd);

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  Fix inline [] / {} nei deps di useMemo / useCallback");
  console.log(
    `  Modalità: ${APPLY ? "✏️  APPLY (scrive le modifiche)" : "🔍 DRY-RUN (nessuna scrittura)"}`
  );
  console.log("════════════════════════════════════════════════════════\n");

  const allResults: FileResult[] = [];
  let totalAuto = 0;
  let totalManual = 0;

  for (const file of files) {
    const fixes = processFile(file);
    if (fixes.length > 0) {
      const rel = path.relative(cwd, file);
      allResults.push({ filePath: rel, fixes });
      const autoCount = fixes.filter((f) => f.kind === "auto").length;
      totalAuto += autoCount;
      totalManual += fixes.filter((f) => f.kind === "manual").length;
      if (APPLY && autoCount > 0) {
        updateBaseline(file);
      }
    } else if (VERBOSE) {
      console.log(`  ✅ ${path.relative(cwd, file)} — nessuna violazione`);
    }
  }

  if (allResults.length === 0) {
    console.log(
      "  ✅ Nessuna violazione trovata — tutti i deps sono già corretti.\n"
    );
    console.log("════════════════════════════════════════════════════════\n");
    return;
  }

  for (const { filePath, fixes } of allResults) {
    console.log(`📄 ${filePath}`);
    for (const fix of fixes) {
      if (fix.kind === "auto") {
        console.log(`   riga ${fix.line}:`);
        console.log(`     PRIMA:  ${fix.original.trim()}`);
        console.log(
          `     DOPO:   ${fix.fixed.trim()}${APPLY ? " ✅ scritto" : " (dry-run)"}`
        );
      } else {
        console.log(`   riga ${fix.line}: ⚠️  FIX MANUALE RICHIESTO`);
        console.log(`     ${fix.note}`);
        console.log(`     ${fix.original.trim()}`);
      }
    }
    console.log();
  }

  console.log("────────────────────────────────────────────────────────");
  if (totalAuto > 0) {
    console.log(
      `  🔧 ${totalAuto} fix automatici ${APPLY ? "applicati" : "disponibili (usa --apply per scrivere)"}`
    );
  }
  if (totalManual > 0) {
    console.log(
      `  ⚠️  ${totalManual} pattern richiedono fix manuale ([] nudo senza ??)`
    );
  }
  if (!APPLY && totalAuto > 0) {
    console.log(
      "\n  Per applicare le correzioni automatiche:"
    );
    console.log(
      "    npx tsx scripts/fix-inline-default-memo-deps.ts --apply"
    );
  }
  console.log("════════════════════════════════════════════════════════\n");

  // Exit 1 se rimangono violazioni manuali dopo il run, o in dry-run con auto-fix disponibili
  if (totalManual > 0 || (!APPLY && totalAuto > 0)) {
    process.exit(1);
  }
}

main();
