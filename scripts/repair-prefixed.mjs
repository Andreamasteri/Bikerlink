#!/usr/bin/env node
/**
 * Repairs two types of incorrect _-prefixing done by the previous script:
 *
 * 1. TS2724: "_Name" in import statements — remove from import block
 * 2. TS2339: "_name" used as destructured variable/parameter — restore to "name"
 */
import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';

const ROOT = '/home/runner/workspace';

function runTsc(project) {
  const r = spawnSync('npx', ['tsc', '--noEmit', '--project', project], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024
  });
  return (r.stdout || '') + (r.stderr || '');
}

// Collect errors from both tsconfig files
const output = runTsc('tsconfig.json') + '\n' + runTsc('server/tsconfig.json');

// ── Parse TS2724: import errors ─────────────────────────────────────────────
const import2724 = new Map(); // file → Set<prefixedName>
const re2724 = /^(.+?)\(\d+,\d+\): error TS2724: .* named '(_\w+)'/gm;
let m;
while ((m = re2724.exec(output)) !== null) {
  const file = m[1].trim();
  const name = m[2];
  if (!import2724.has(file)) import2724.set(file, new Set());
  import2724.get(file).add(name);
}

// ── Parse TS2339: property access errors ────────────────────────────────────
const prop2339 = []; // [{file, line, name}]
const re2339 = /^(.+?)\((\d+),\d+\): error TS2339: Property '(_\w+)' does not exist/gm;
while ((m = re2339.exec(output)) !== null) {
  prop2339.push({ file: m[1].trim(), line: parseInt(m[2], 10), name: m[3] });
}

console.log(`TS2724 (import) errors: ${import2724.size} files`);
console.log(`TS2339 (property) errors: ${prop2339.length} occurrences`);

// ── Fix TS2724: remove _Name from import blocks ──────────────────────────────
for (const [filePath, names] of import2724) {
  let src;
  try { src = readFileSync(filePath, 'utf8'); } catch { continue; }
  
  let result = src;
  for (const name of names) {
    // Match the name in a multi-line import block (as its own line)
    // or inline in single-line imports
    result = result
      // Own line: "  _Name," or "  _Name\n" (with optional trailing comma + space)
      .replace(new RegExp(`^[ \\t]+${name}(?:\\s+as\\s+\\w+)?[ \\t]*,?\\r?\\n`, 'gm'), '')
      // Comma before: ", _Name"
      .replace(new RegExp(`,\\s*${name}(?:\\s+as\\s+\\w+)?(?=\\s*[,}])`, 'g'), '')
      // Comma after: "_Name,"
      .replace(new RegExp(`${name}(?:\\s+as\\s+\\w+)?\\s*,\\s*`, 'g'), '');
  }
  
  // Clean up empty import braces
  result = result.replace(/^import\s+(?:type\s+)?\{\s*\}\s+from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '');
  // Clean up stray leading comma in import braces: "{ , Foo" → "{ Foo"  
  result = result.replace(/\{\s*,\s*/g, '{ ');
  // Clean up trailing comma before closing brace
  result = result.replace(/,(\s*\})/g, '$1');
  
  if (result !== src) {
    writeFileSync(filePath, result, 'utf8');
    console.log(`  [2724] Fixed ${names.size} imports in ${filePath.replace(ROOT + '/', '')}`);
  }
}

// ── Fix TS2339: restore _name → name in destructuring ────────────────────────
// Group by file for efficiency
const byFile = new Map();
for (const e of prop2339) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

for (const [filePath, errors] of byFile) {
  let src;
  try { src = readFileSync(filePath, 'utf8'); } catch { continue; }
  
  const lines = src.split('\n');
  let changed = 0;
  
  for (const { line: lineNum, name } of errors) {
    const li = lineNum - 1;
    if (li < 0 || li >= lines.length) continue;
    
    const originalName = name.slice(1); // strip leading _
    const line = lines[li];
    
    // Replace _name with name in this line
    // Be careful to match whole words only
    const re = new RegExp(`\\b${name}\\b`, 'g');
    const fixed = line.replace(re, originalName);
    if (fixed !== line) {
      lines[li] = fixed;
      changed++;
    }
  }
  
  if (changed > 0) {
    writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`  [2339] Restored ${changed} names in ${filePath.replace(ROOT + '/', '')}`);
  }
}

console.log('\nDone. Re-run typecheck to verify.');
