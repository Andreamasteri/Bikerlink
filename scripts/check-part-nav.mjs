#!/usr/bin/env node
/**
 * Standalone .partN navigation guard (no ESLint / no AST parser dependency).
 *
 * Replaces the former ESLint custom rule scripts/eslint-rules/no-part-nav.js,
 * which is no longer available now that the project lints with oxlint
 * (oxlint has no mature custom-JS-plugin support).
 *
 * scripts/post-merge.sh already runs a fast line-based grep pass that catches
 * the vast majority of cases, including single-line template literals like
 *   push(`/giri/${id}.part2`)
 * because the literal text ".part2" still appears on the same source line as
 * the call, even though the path is built dynamically.
 *
 * The one gap grep genuinely cannot see is a template literal whose ".partN"
 * segment is split across multiple lines, e.g.:
 *   push(`/giri/${id}
 *     .part2`);
 * This script closes that gap with a whole-file (not line-based) regex scan
 * for push/replace/navigate/href calls whose template-literal argument
 * contains ".partN" anywhere in its (possibly multi-line) text.
 *
 * This is intentionally NOT a full AST walk — it is a narrow, cheap
 * supplement to the grep gate, matching the task's "small standalone check"
 * scope. String-concatenation via an intermediate variable
 * (const seg = ".part2"; push(x + seg)) remains out of scope for static
 * analysis, same as it was under the old ESLint rule's documented limits.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const PART_RE = /\.part\d/;
// Matches: push(`...`)  replace(`...`)  navigate(`...`)  router.push(`...`)
// href={`...`}  href=`...`  — capturing the full backtick-delimited template.
const CALL_TEMPLATE_RE =
  /(?:\brouter\.(?:push|replace|navigate)|(?:^|[^a-zA-Z0-9_.])(?:push|replace|navigate)|href=\{?)\s*\(?\s*`([^`]*)`/gs;

function listFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function checkFile(file) {
  const content = readFileSync(file, "utf8");
  const hits = [];
  let match;
  CALL_TEMPLATE_RE.lastIndex = 0;
  while ((match = CALL_TEMPLATE_RE.exec(content)) !== null) {
    const templateBody = match[1];
    if (PART_RE.test(templateBody)) {
      const lineNumber = content.slice(0, match.index).split("\n").length;
      hits.push({ file, lineNumber, snippet: templateBody.replace(/\s+/g, " ").trim() });
    }
  }
  return hits;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => listFiles(path.join(ROOT, d)));
  const allHits = files.flatMap(checkFile);

  if (allHits.length > 0) {
    console.error("❌ ERRORE: trovate stringhe di navigazione (template literal) con path .part*");
    console.error("   I file .partN.tsx sono helper module (prefissati _) e non sono route Expo Router.");
    console.error("");
    for (const hit of allHits) {
      console.error(`   ${path.relative(ROOT, hit.file)}:${hit.lineNumber}  \`${hit.snippet}\``);
    }
    console.error("");
    console.error("   → Correggere i path di navigazione prima del merge.");
    process.exit(1);
  }

  console.log("✅ Nessun template-literal di navigazione multi-riga punta a path .part* (check-part-nav.mjs).");
  process.exit(0);
}

main();
