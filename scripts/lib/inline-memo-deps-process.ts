/**
 * inline-memo-deps-process.ts
 *
 * Core di scansione/fix per scripts/fix-inline-default-memo-deps.ts:
 * fixDepsArray + processFile. Estratto dal fixer per restare sotto il
 * limite 600 righe per file. Nessuna logica modificata: solo relocazione +
 * `apply` passato come parametro (prima leggeva la const globale APPLY).
 */

import * as fs from "fs";
import {
  Fix,
  SUPPRESSION,
  RE_BRACKET_WITH_INLINE,
  RE_HOOK_SAME_LINE,
  RE_HOOK_OPEN,
  RE_NULLISH_WITH_LITERAL,
  inferSoleBareDep,
  extractCallbackBody,
  extractBracketSpan,
} from "./inline-memo-deps-infer";

// ─── Core logic ────────────────────────────────────────────────────────────

export function fixDepsArray(depsMatch: string): {
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

  // Check if any bare [] or {} remain (couldn't be auto-fixed).
  // Reset lastIndex first: RE_BRACKET_WITH_INLINE is a global regex and the
  // caller's exec() loop leaves lastIndex advanced, which would make this
  // .test() start mid-string and miss the literal.
  RE_BRACKET_WITH_INLINE.lastIndex = 0;
  if (RE_BRACKET_WITH_INLINE.test(result)) {
    hadBare = true;
  }
  RE_BRACKET_WITH_INLINE.lastIndex = 0;

  return { result, changed, hadBare };
}

export function processFile(filePath: string, apply: boolean): Fix[] {
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
      const matchStart = match.index;
      const prefix = stripped.slice(0, matchStart);
      let hookLineIdx = i; // line where the nearest hook opener lives

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
            hookLineIdx = j;
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
      let { result: depsFixed, changed, hadBare } = fixDepsArray(depsOriginal);

      // ── Try to infer a sole bare [] / {} dep from the callback body ────
      let inferNote: string | undefined;
      if (hadBare) {
        const body = extractCallbackBody(lines, hookLineIdx, i, matchStart);
        const inferred = inferSoleBareDep(depsFixed, body);
        if (inferred) {
          // Replace the lone bare literal with the inferred dependency.
          depsFixed = depsFixed.replace(/\[\]|\{\}/, inferred.inferred);
          changed = true;
          hadBare = false;
          inferNote = `dep inferito dal corpo della callback: ${inferred.inferred}`;
        }
      }

      if (changed) {
        const fixedLine = stripped.replace(depsOriginal, depsFixed);
        fixes.push({
          line: i + 1,
          original: stripped,
          fixed: fixedLine,
          kind: "auto",
          note: inferNote,
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
  //
  //   Mode C3 — block-body callback whose closing "}" and deps "[" share the
  //   same line, while the hook name is on an earlier line:
  //     useMemo(() => {
  //       return something;
  //     }, [                  ← matches RE_DEPS_OPEN_C3, no hook on this line
  //       dep1,
  //       dep2 ?? [],         ← interior line, not caught by Pass 1
  //     ]);
  const RE_DEPS_OPEN_C1 = /,\s*\[\s*(?:\/\/[^\n]*)?\s*$/;
  // Mode C3: block-body callback closes on the same line as the deps opener.
  // Example: "  }, [" or "  },  [  // comment".  The closing "}" belongs to the
  // callback body; the hook opener is on an earlier line (ruling out C1).
  const RE_DEPS_OPEN_C3 = /\}\s*,?\s*\[\s*(?:\/\/[^\n]*)?\s*$/;
  // Bare [] or {} NOT preceded by a word character (excludes `Type[]` suffixes)
  const RE_BARE_INTERIOR = /(?<!\w)(\[\]|\{\})/;

  let ci = 0;
  while (ci < lines.length) {
    const cl = lines[ci];

    // Track where the hook opener lives and where the deps '[' starts, so we
    // can extract the callback body for sole bare-literal inference.
    let depsHookLine = -1;
    let depsOpenCol = -1;

    // Mode C1: hook opener on same line AND line ends with ", ["
    const isC1 = RE_HOOK_OPEN.test(cl) && RE_DEPS_OPEN_C1.test(cl);
    if (isC1) {
      depsHookLine = ci;
      const mm = RE_DEPS_OPEN_C1.exec(cl);
      if (mm) depsOpenCol = mm.index + mm[0].indexOf("[");
    }

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
                depsHookLine = bj;
                depsOpenCol = indentPrefix.length;
                break;
              }
            }
          }
        }
      }
    }

    // Mode C3: "}, [" pattern — block-body callback whose closing brace and
    // deps bracket share this line, but the hook name is on an earlier line.
    let isC3 = false;
    if (!isC1 && !isC2) {
      if (RE_DEPS_OPEN_C3.test(cl) && !RE_HOOK_OPEN.test(cl)) {
        for (let bj = ci - 1; bj >= Math.max(0, ci - 81); bj--) {
          if (RE_HOOK_OPEN.test(lines[bj])) {
            isC3 = true;
            depsHookLine = bj;
            const mm = RE_DEPS_OPEN_C3.exec(cl);
            if (mm) depsOpenCol = mm.index + mm[0].indexOf("[");
            break;
          }
        }
      }
    }

    if (!isC1 && !isC2 && !isC3) {
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

    // ── Sole bare-literal inference for the whole multi-line deps array ────
    // If the deps array's only element is a bare [] / {}, try to infer the
    // correct dep from the callback body (applied below on the interior line).
    let inferredSole: string | null = null;
    if (depsHookLine >= 0 && depsOpenCol >= 0) {
      const span = extractBracketSpan(lines, ci, depsOpenCol);
      const body = extractCallbackBody(lines, depsHookLine, ci, depsOpenCol);
      const inferred = inferSoleBareDep(span.text, body);
      if (inferred) inferredSole = inferred.inferred;
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
          if (inferredSole) {
            // Sole bare [] / {} dep — inferred from the callback body.
            const fixedBare = inner.replace(/\[\]|\{\}/, inferredSole);
            fixes.push({
              line: j + 1,
              original: inner,
              fixed: fixedBare,
              kind: "auto",
              note: `dep inferito dal corpo della callback: ${inferredSole}`,
            });
            lines[j] = fixedBare;
          } else {
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

  if (apply && fixes.some((f) => f.kind === "auto")) {
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  }

  return fixes;
}
