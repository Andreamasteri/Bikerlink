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
 * Inferenza automatica del dep nudo (senza ??):
 *   useMemo(() => x ?? [], [[]])         →  useMemo(() => x ?? [], [x])
 *   useMemo(() => data.filter(...), [[]]) →  useMemo(() => data.filter(...), [data])
 *
 *   Quando il letterale nudo [] o {} è l'UNICO elemento dei deps, proviamo a
 *   dedurre il dep corretto dal corpo della callback:
 *     1. se il corpo contiene `EXPR ?? []` (o `?? {}`) → il dep è EXPR;
 *     2. altrimenti, se nel corpo c'è UN solo identificatore libero → quello.
 *   Se l'inferenza è univoca applichiamo il fix e lo logghiamo come "auto".
 *
 * Pattern NON gestiti automaticamente (richiede fix manuale):
 *   useMemo(() => ..., [[], otherDep])   ← [] nudo NON unico — impossibile
 *                                            scegliere il dep corretto.
 *   useMemo(() => a + b, [[]])           ← più candidati nel corpo — ambiguo.
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

// ─── Dep inference (bare [] / {} without ??) ─────────────────────────────────

// Reserved words / JS keywords that are never a hook dependency.
const RESERVED_WORDS = new Set([
  "return", "if", "else", "true", "false", "null", "undefined", "new",
  "typeof", "void", "await", "async", "function", "const", "let", "var",
  "in", "of", "instanceof", "this", "delete", "yield", "do", "while", "for",
  "switch", "case", "break", "continue", "default", "throw", "try", "catch",
  "finally", "class", "extends", "super", "NaN", "Infinity", "as", "from",
  // TS-only keywords that may appear as inline param annotations (e.g.
  // `(x: any) =>`). They are never real runtime variables, so excluding them
  // keeps inline-typed callbacks inferrable.
  "any", "unknown", "never",
]);

// Well-known globals that are never a hook dependency.
const GLOBALS = new Set([
  "Object", "Array", "Math", "JSON", "String", "Number", "Boolean", "Date",
  "console", "Map", "Set", "WeakMap", "WeakSet", "Promise", "RegExp", "Symbol",
  "BigInt", "Error", "parseInt", "parseFloat", "isNaN", "isFinite", "Intl",
  "encodeURIComponent", "decodeURIComponent", "globalThis", "window", "document",
]);

// Split a string on top-level commas (ignoring commas nested in (), [], {}).
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "{" || ch === "(") depth++;
    else if (ch === "]" || ch === "}" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Strip line comments (// ...) and block comments (/* ... */) from a snippet.
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

// Blank out string and template literals so their text content is never
// mistaken for an identifier. Template interpolations (${...}) are blanked
// too — this is intentionally conservative: if a real dep only appears inside
// a template, inference yields nothing and we fall back to manual rather than
// risk a wrong auto-fix.
function stripStringsAndTemplates(s: string): string {
  return s
    .replace(/`(?:\\.|[^`\\])*`/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ");
}

// Remove object-literal property KEYS (e.g. `foo` in `{ foo: 1 }`) so they are
// not counted as identifiers. Only keys in "key position" — preceded by `{` or
// `,` and followed by `:` — are dropped; this leaves ternary branches
// (`cond ? x : y`), shorthand props (`{ data }` → real ref), and computed keys
// (`{ [key]: 1 }` → real ref) untouched.
function stripObjectKeys(s: string): string {
  return s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, "$1$3");
}

// Full sanitization applied before scanning a callback body for identifiers
// or `??` patterns: drop comments, string/template literals, and object keys.
function sanitizeBody(s: string): string {
  return stripObjectKeys(stripStringsAndTemplates(stripComments(s)));
}

// Extract the free identifiers referenced in a callback body, excluding
// reserved words, well-known globals, member-access property names, and
// parameters declared by arrow/function expressions inside the body.
function extractCandidates(body: string): string[] {
  const src = sanitizeBody(body);
  const params = new Set<string>();

  // Parenthesized params:  (a, b) =>   /   (x: Type) =>   /   ({ a, b }) =>
  const reParen = /\(([^()]*)\)\s*=>/g;
  let pm: RegExpExecArray | null;
  while ((pm = reParen.exec(src)) !== null) {
    for (const raw of pm[1].split(",")) {
      const cleaned = raw
        .replace(/[:=].*$/, "") // drop type annotation / default value
        .replace(/[{}[\]().]/g, " ");
      for (const n of cleaned.split(/\s+/)) {
        if (/^[A-Za-z_$][\w$]*$/.test(n)) params.add(n);
      }
    }
  }
  // Bare single param:  x =>
  const reBare = /(?:^|[^\w$.)])([A-Za-z_$][\w$]*)\s*=>/g;
  while ((pm = reBare.exec(src)) !== null) {
    params.add(pm[1]);
  }

  // Locals declared INSIDE the callback body are not valid outer dependencies.
  // We only ever read the BINDING TARGET (left of `=`), never the initializer,
  // so an outer ref used in an initializer (e.g. `const x = data`) is still a
  // candidate. Over-exclusion here is the safe direction (→ manual fallback).
  const addIdents = (chunk: string) => {
    for (const n of chunk.replace(/[{}[\]().]/g, " ").split(/[\s,:]+/)) {
      const name = n.replace(/[:=].*$/, "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) params.add(name);
    }
  };
  // const/let/var <target>  — target is a name, {…} or […].
  const reDecl =
    /\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)/g;
  while ((pm = reDecl.exec(src)) !== null) addIdents(pm[1]);
  // function / class declarations and catch params.
  const reNamed =
    /\b(?:function\s*\*?\s*|class\s+)([A-Za-z_$][\w$]*)|\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g;
  while ((pm = reNamed.exec(src)) !== null) {
    if (pm[1]) params.add(pm[1]);
    if (pm[2]) params.add(pm[2]);
  }

  // Identifiers not preceded by a word char, `$` or `.` (so member-access
  // property names like `b` in `a.b` are excluded).
  const reIdent = /(?<![\w$.])([A-Za-z_$][\w$]*)/g;
  const candidates = new Set<string>();
  while ((pm = reIdent.exec(src)) !== null) {
    const id = pm[1];
    if (RESERVED_WORDS.has(id) || GLOBALS.has(id) || params.has(id)) continue;
    candidates.add(id);
  }
  return [...candidates];
}

// Given a callback body and the kind of bare literal in the deps ("[]" or
// "{}"), infer the single correct dependency. Returns the inferred expression
// or null when the inference is ambiguous.
function inferDep(body: string, literal: "[]" | "{}"): string | null {
  const src = sanitizeBody(body);

  // Strategy 1 (precise): the body contains `EXPR ?? []` / `EXPR ?? {}`.
  // The dep is EXPR (captures member paths like `data?.items`).
  const reNullish =
    literal === "[]"
      ? /([\w?.][\w?.[\]]*)\s*\?\?\s*\[\]/g
      : /([\w?.][\w?.[\]]*)\s*\?\?\s*\{\}/g;
  const exprs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = reNullish.exec(src)) !== null) {
    exprs.add(m[1]);
  }
  if (exprs.size === 1) return [...exprs][0];
  if (exprs.size > 1) return null; // multiple distinct exprs → ambiguous

  // Strategy 2 (general): exactly one free identifier in the body.
  const cands = extractCandidates(src);
  if (cands.length === 1) return cands[0];
  return null;
}

// If the deps array's SOLE element is a bare [] or {}, try to infer the dep
// from the callback body. Returns { literal, inferred } or null.
function inferSoleBareDep(
  depsArrayString: string,
  body: string
): { literal: "[]" | "{}"; inferred: string } | null {
  const inner = depsArrayString
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  const elements = splitTopLevel(inner)
    .map((e) => stripComments(e).trim())
    .filter((e) => e.length > 0);
  if (elements.length !== 1) return null;
  const literal = elements[0];
  if (literal !== "[]" && literal !== "{}") return null;
  const inferred = inferDep(body, literal);
  if (!inferred) return null;
  return { literal, inferred };
}

// Extract the callback body text between a hook opener `(` and the deps array.
// Works across a single line (hookLine === depsLine) or multiple lines.
function extractCallbackBody(
  lines: string[],
  hookLine: number,
  depsLine: number,
  depsCol: number
): string {
  const opener = RE_HOOK_OPEN.exec(lines[hookLine]);
  if (!opener) return "";
  const parenCol = opener.index + opener[0].length - 1; // position of '('
  let segment: string;
  if (hookLine === depsLine) {
    segment = lines[hookLine].slice(parenCol + 1, depsCol);
  } else {
    const parts: string[] = [lines[hookLine].slice(parenCol + 1)];
    for (let k = hookLine + 1; k < depsLine; k++) parts.push(lines[k]);
    parts.push(lines[depsLine].slice(0, depsCol));
    segment = parts.join("\n");
  }
  return segment.replace(/,\s*$/, "").trim();
}

// Walk from a '[' at (lineIdx, col) to its matching ']', returning the bracket
// span text (joined across lines) and the closing line index.
function extractBracketSpan(
  lines: string[],
  lineIdx: number,
  col: number
): { text: string; endLine: number } {
  let depth = 0;
  let out = "";
  for (let li = lineIdx; li < lines.length; li++) {
    const text = lines[li];
    const start = li === lineIdx ? col : 0;
    for (let k = start; k < text.length; k++) {
      const ch = text[k];
      out += ch;
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return { text: out, endLine: li };
      }
    }
    out += "\n";
  }
  return { text: out, endLine: lines.length - 1 };
}

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
        if (fix.note) console.log(`     🧠 ${fix.note}`);
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
