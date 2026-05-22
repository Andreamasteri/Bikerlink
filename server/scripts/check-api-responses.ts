#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";

const ROUTES_DIR = path.join(__dirname, "..", "routes");

interface Violation {
  file: string;
  line: number;
  content: string;
  rule: string;
}

const VIOLATION_RULES: Array<{ regex: RegExp; rule: string }> = [
  {
    regex: /res\.json\(\{\s*message\s*:/,
    rule: 'res.json({ message: ... }) — use sendSuccess(res, undefined, msg) or sendError(res, status, msg)',
  },
  {
    regex: /res\.json\(\{\s*ok\s*:/,
    rule: 'res.json({ ok: ... }) — use sendSuccess(res) or sendSuccess(res, data)',
  },
  {
    regex: /res\.json\(\{\s*success\s*:\s*(true|false)/,
    rule: 'Raw res.json({ success: bool }) without helper — use sendSuccess() or sendError()',
  },
  {
    regex: /res\.status\(\d+\)\.json\(\{\s*message\s*:/,
    rule: 'res.status(N).json({ message: ... }) — use sendError(res, status, message)',
  },
  {
    regex: /res\.status\(\d+\)\.json\(\{\s*ok\s*:/,
    rule: 'res.status(N).json({ ok: ... }) — use sendError(res, status, message)',
  },
];

const SKIP_FILES = [
  "custom-routes.ts",
];

function scanFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];
  const relPath = path.relative(process.cwd(), filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (trimmed.includes("sendSuccess(") || trimmed.includes("sendError(")) continue;

    for (const { regex, rule } of VIOLATION_RULES) {
      if (regex.test(line)) {
        violations.push({
          file: relPath,
          line: i + 1,
          content: line.trimEnd(),
          rule,
        });
        break;
      }
    }
  }

  return violations;
}

function scanDir(dir: string): Violation[] {
  const violations: Violation[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      violations.push(...scanDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !SKIP_FILES.includes(entry.name)) {
      violations.push(...scanFile(fullPath));
    }
  }

  return violations;
}

function main(): void {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error(`Routes directory not found: ${ROUTES_DIR}`);
    process.exit(2);
  }

  const violations = scanDir(ROUTES_DIR);

  if (violations.length === 0) {
    console.log("✅  All mutation responses conform to ApiResponse<T> format");
    process.exit(0);
  }

  console.error(`\n❌  Found ${violations.length} non-conforming API response(s):\n`);

  let currentFile = "";
  for (const v of violations) {
    if (v.file !== currentFile) {
      console.error(`  ${v.file}`);
      currentFile = v.file;
    }
    console.error(`    Line ${v.line}: ${v.rule}`);
    console.error(`      ${v.content.trim()}`);
  }

  console.error(
    "\nFix: replace each response with sendSuccess() or sendError() from server/lib/api-response.ts",
  );
  process.exit(1);
}

main();
