#!/usr/bin/env node
/**
 * Repairs incorrectly _-prefixed named imports in multi-line import blocks.
 * These were created by the previous fix-unused-vars script which couldn't
 * detect that a line was inside a multi-line import statement.
 * 
 * Strategy: find lines inside import blocks that look like `  _Foo,` or
 * `  _foo,` and remove them entirely from the import (they were flagged as
 * unused by ESLint, so removing is the correct fix).
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/runner/workspace';

// Run tsc --noEmit and capture JSON-like output with errors
// We'll parse the typecheck text output to get broken files
const typecheckOutput = execSync(
  'npx tsc --noEmit --project tsconfig.json 2>&1; npx tsc --noEmit --project server/tsconfig.json 2>&1',
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
);

// Parse TS2724 errors: "has no exported member named '_Foo'"
const errors = new Map(); // filePath -> Set<prefixedName>
const errorRe = /^(.+?)\((\d+),(\d+)\): error TS2724: .* named '(_\w+)'/gm;
let m;
while ((m = errorRe.exec(typecheckOutput)) !== null) {
  const [, file, line, col, name] = m;
  const key = file.replace(/\\/g, '/');
  if (!errors.has(key)) errors.set(key, new Set());
  errors.get(key).add(name);
}

console.log(`Found ${errors.size} files with _-prefixed import errors`);

let totalFixed = 0;

for (const [filePath, names] of errors) {
  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    console.warn(`  Could not read ${filePath}`);
    continue;
  }
  
  let changed = 0;
  let result = src;
  
  for (const name of names) {
    // The incorrectly prefixed name appears in an import block like:
    //   _Foo,           (with optional trailing comma)
    //   _Foo            (last item, no comma)
    //   _foo as Bar,    (with alias)
    // We need to remove it from the import statement
    
    const patterns = [
      // Line by itself (with indentation): "  _Name," or "  _Name"
      new RegExp(`^[ \\t]+${name}(?:\\s+as\\s+\\w+)?[ \\t]*,?\\r?\\n`, 'gm'),
      // Inline after comma: ", _Name" 
      new RegExp(`,\\s*${name}(?:\\s+as\\s+\\w+)?`, 'g'),
      // Before comma: "_Name, "
      new RegExp(`${name}(?:\\s+as\\s+\\w+)?\\s*,\\s*`, 'g'),
    ];
    
    let prev = result;
    for (const p of patterns) {
      result = result.replace(p, '');
      if (result !== prev) { changed++; prev = result; break; }
    }
  }
  
  // Clean up empty import braces: "import { } from" → remove line
  result = result.replace(/^import\s+(?:type\s+)?\{\s*\}\s+from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '');
  
  // Clean up trailing commas before closing brace: "  Foo,\n}" → "  Foo\n}"
  result = result.replace(/,(\s*\})/g, '$1');
  
  if (result !== src) {
    writeFileSync(filePath, result, 'utf8');
    totalFixed++;
    console.log(`  Fixed ${names.size} in ${filePath.replace(ROOT + '/', '')}`);
  }
}

console.log(`\nTotal: ${totalFixed} files fixed`);
