/**
 * inline-memo-deps-infer.ts
 *
 * Helper puri (regex + inferenza del dep) usati da
 * scripts/fix-inline-default-memo-deps.ts.
 *
 * Estratto dal fixer per restare sotto il limite 600 righe per file.
 * Nessuna logica modificata: solo relocazione + export.
 */

export const SUPPRESSION = "check-inline-default-memo-deps: safe";

export interface Fix {
  line: number;
  original: string;
  fixed: string;
  kind: "auto" | "manual";
  note?: string;
}

export interface FileResult {
  filePath: string;
  fixes: Fix[];
}

// ─── Regex patterns ────────────────────────────────────────────────────────

// Matches a [...] block that contains [] or {} inside it.
// Same as gate: [^\[\]]* avoids crossing nested brackets.
export const RE_BRACKET_WITH_INLINE =
  /\[(?:[^\[\]]*?)(?:\[\]|\{\})(?:[^\[\]]*?)\]/g;

// Is this a useMemo/useCallback opener on the same line?
export const RE_HOOK_SAME_LINE = /\b(useMemo|useCallback)\s*\(/;
export const RE_HOOK_OPEN = /\b(useMemo|useCallback)\s*\(/;

// Replace `something ?? []` or `something ?? {}` with just `something`
// inside the deps array.  We capture the expression before `??` carefully:
//   - optional chaining allowed: `a?.b ?? []`
//   - multi-level: `a?.b?.c ?? []`
//   - simple identifier: `items ?? {}`
// We do NOT match a standalone `[]` or `{}` without a `??` prefix.
export const RE_NULLISH_WITH_LITERAL =
  /([\w?.][\w?.[\]]*)\s*\?\?\s*(?:\[\]|\{\})/g;

// A completely bare [] or {} (not preceded by ??)
export const RE_BARE_LITERAL = /(?<![?.])\b(?<!\?\?)\s*(\[\]|\{\})\s*/;

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
export function splitTopLevel(s: string): string[] {
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
export function stripComments(s: string): string {
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
export function extractCandidates(body: string): string[] {
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
export function inferDep(body: string, literal: "[]" | "{}"): string | null {
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

// If the deps array contains EXACTLY ONE bare [] or {} element — whether it is
// the sole dependency or sits alongside other real deps — try to infer the
// correct replacement for that element from the callback body. Returns
// { literal, inferred } or null when there is not exactly one bare element or
// the inference is ambiguous. Siblings are never inspected; the caller replaces
// only the bare literal, leaving the others untouched.
export function inferBareDep(
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
  const bareElements = elements.filter((e) => e === "[]" || e === "{}");
  // Conservative: only auto-fix when there is a single, unambiguous bare
  // literal. Two or more (e.g. [[], {}]) → we cannot map each to its dep.
  if (bareElements.length !== 1) return null;
  const literal = bareElements[0] as "[]" | "{}";
  const inferred = inferDep(body, literal);
  if (!inferred) return null;
  return { literal, inferred };
}

// Extract the callback body text between a hook opener `(` and the deps array.
// Works across a single line (hookLine === depsLine) or multiple lines.
export function extractCallbackBody(
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
export function extractBracketSpan(
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
