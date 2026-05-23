#!/usr/bin/env node
/**
 * Auto-fix @typescript-eslint/no-unused-vars warnings:
 *  1. Remove unused named imports from import statements
 *  2. Prefix unused catch-clause variables with _
 *  3. Prefix unused function parameters with _
 *  4. Prefix unused local variables (assigned but never used) with _
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = '/home/runner/workspace';

// --- helpers ---

function removeNamedImport(line, name) {
  // Remove a single named import from an import line or inline import list
  // Handles: import { A, B, C } from '...' → remove B → import { A, C } from '...'
  // Also handles: import type { A } from '...'
  const patterns = [
    // comma before: ", name" or ", name as X"
    new RegExp(`,\\s*${name}(\\s+as\\s+\\w+)?(?=\\s*[,}])`, 'g'),
    // comma after: "name," or "name as X,"
    new RegExp(`${name}(\\s+as\\s+\\w+)?\\s*,\\s*`, 'g'),
    // only item: "{ name }" → remove entire braces group
    new RegExp(`\\{\\s*${name}(\\s+as\\s+\\w+)?\\s*\\}`, 'g'),
  ];
  let result = line;
  for (const p of patterns) {
    result = result.replace(p, (m, g1, offset, str) => {
      if (p === patterns[2]) return '{}';
      return '';
    });
  }
  return result;
}

function applyFixes(filePath, warnings) {
  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    return 0;
  }
  const lines = src.split('\n');
  let changed = 0;

  // Sort warnings by line descending so line numbers stay valid as we edit
  const sorted = [...warnings].sort((a, b) => b.line - a.line || b.col - a.col);

  for (const w of sorted) {
    const li = w.line - 1; // 0-indexed
    if (li < 0 || li >= lines.length) continue;
    const line = lines[li];
    const msg = w.msg;

    // Extract variable name from message
    const nameMatch = msg.match(/'(\w+)'/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    // ── Case 1: Unused import ──────────────────────────────────────────────
    // Message: "'X' is defined but never used."
    if (msg.includes('is defined but never used')) {
      const isImportLine = /^\s*import\s/.test(line);

      if (isImportLine) {
        // Remove the named import from the import statement
        // (may span multiple lines; for simplicity handle single-line imports first)
        const fixed = removeNamedImport(line, name);
        // If the import now has empty braces {} or only "import type {} from", remove the line
        if (/^\s*import\s+(type\s+)?\{\s*\}\s+from\s+/.test(fixed) || fixed.trim() === '') {
          lines.splice(li, 1);
        } else {
          lines[li] = fixed;
        }
        changed++;
      } else {
        // It's a variable/function defined in the file (not an import)
        // Prefix with _ if not already prefixed
        if (!name.startsWith('_')) {
          // Only prefix if it appears exactly in this line
          const prefixed = lines[li].replace(
            new RegExp(`\\b${name}\\b`),
            `_${name}`
          );
          if (prefixed !== lines[li]) {
            lines[li] = prefixed;
            changed++;
          }
        }
      }
    }

    // ── Case 2: Assigned but never used ───────────────────────────────────
    // Message: "'x' is assigned a value but never used."
    else if (msg.includes('is assigned a value but never used')) {
      if (!name.startsWith('_')) {
        // Prefix the variable name on this line
        const re = new RegExp(`\\b${name}\\b`);
        const prefixed = lines[li].replace(re, `_${name}`);
        if (prefixed !== lines[li]) {
          lines[li] = prefixed;
          changed++;
        }
      }
    }

    // ── Case 3: Unused caught error ────────────────────────────────────────
    // Message: "'error' is defined but never used. Allowed unused caught errors must match /^_/u"
    else if (msg.includes('Allowed unused caught errors must match')) {
      if (!name.startsWith('_')) {
        const re = new RegExp(`\\bcatch\\s*\\(\\s*${name}\\s*\\)`, 'g');
        const prefixed = lines[li].replace(re, `catch (_${name})`);
        if (prefixed !== lines[li]) {
          lines[li] = prefixed;
          changed++;
        } else {
          // also try just the variable name inside catch
          const re2 = new RegExp(`\\b${name}\\b`);
          const p2 = lines[li].replace(re2, `_${name}`);
          if (p2 !== lines[li]) { lines[li] = p2; changed++; }
        }
      }
    }

    // ── Case 4: Unused function parameter ─────────────────────────────────
    // Message: "'x' is defined but never used. Allowed unused args must match /^_/u"
    else if (msg.includes('Allowed unused args must match')) {
      if (!name.startsWith('_')) {
        // Prefix the parameter in the function signature
        const re = new RegExp(`\\b${name}\\b`);
        const prefixed = lines[li].replace(re, `_${name}`);
        if (prefixed !== lines[li]) {
          lines[li] = prefixed;
          changed++;
        }
      }
    }
  }

  if (changed > 0) {
    writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
  return changed;
}

// ── Main ──────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync('/tmp/unused-vars.json', 'utf8'));

let totalFiles = 0;
let totalChanges = 0;

for (const [relPath, warnings] of Object.entries(data)) {
  const absPath = `${ROOT}/${relPath}`;
  const n = applyFixes(absPath, warnings);
  if (n > 0) {
    totalFiles++;
    totalChanges += n;
    console.log(`  Fixed ${n} in ${relPath}`);
  }
}

console.log(`\nTotal: ${totalChanges} fixes in ${totalFiles} files`);
