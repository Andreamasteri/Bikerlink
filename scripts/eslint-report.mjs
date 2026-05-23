import { ESLint } from "eslint";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

function header(title) {
  const line = "─".repeat(60);
  console.log(`\n${BOLD}${BLUE}${line}${RESET}`);
  console.log(`${BOLD}${BLUE}  ${title}${RESET}`);
  console.log(`${BOLD}${BLUE}${line}${RESET}`);
}

async function main() {
  const eslint = new ESLint({
    cwd: ROOT,
    fix: false,
  });

  const eslintFix = new ESLint({
    cwd: ROOT,
    fix: true,
    fixTypes: ["problem", "suggestion", "layout"],
  });

  // ── FASE 1: LETTURA FILE ─────────────────────────────────────
  header("FASE 1 · LETTURA FILE");

  const filePaths = await eslint.lintFiles(["**/*.{ts,tsx}"]);
  const lintedFiles = filePaths.filter((r) => r.source !== undefined || r.messages.length > 0 || r.filePath);

  console.log(`\n${CYAN}File analizzati: ${lintedFiles.length}${RESET}\n`);
  for (const result of lintedFiles) {
    const rel = path.relative(ROOT, result.filePath);
    const status =
      result.errorCount > 0
        ? `${RED}✖ ${result.errorCount}err${RESET}`
        : result.warningCount > 0
        ? `${YELLOW}⚠ ${result.warningCount}warn${RESET}`
        : `${GREEN}✓${RESET}`;
    console.log(`  ${DIM}${rel}${RESET}  ${status}`);
  }

  // ── FASE 2: ANALISI PROBLEMI ────────────────────────────────
  header("FASE 2 · ANALISI PROBLEMI");

  const withIssues = lintedFiles.filter(
    (r) => r.errorCount > 0 || r.warningCount > 0
  );

  if (withIssues.length === 0) {
    console.log(`\n${GREEN}${BOLD}Nessun problema trovato!${RESET}\n`);
  } else {
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalFixable = 0;

    for (const result of withIssues) {
      const rel = path.relative(ROOT, result.filePath);
      console.log(`\n${BOLD}${rel}${RESET}`);

      for (const msg of result.messages) {
        const loc = `${DIM}${msg.line}:${msg.column}${RESET}`;
        const severity =
          msg.severity === 2
            ? `${RED}errore${RESET}`
            : `${YELLOW}avviso${RESET}`;
        const fixable = msg.fix ? ` ${GREEN}[auto-fix disponibile]${RESET}` : "";
        const rule = msg.ruleId ? `${DIM}(${msg.ruleId})${RESET}` : "";
        console.log(`  ${loc}  ${severity}  ${msg.message} ${rule}${fixable}`);

        if (msg.severity === 2) totalErrors++;
        else totalWarnings++;
        if (msg.fix) totalFixable++;
      }
    }

    console.log(
      `\n${BOLD}Riepilogo:${RESET}  ${RED}${totalErrors} errori${RESET}  ${YELLOW}${totalWarnings} avvisi${RESET}  ${GREEN}${totalFixable} auto-fixabili${RESET}`
    );
  }

  // ── FASE 3: CORREZIONI PROPOSTE ─────────────────────────────
  header("FASE 3 · CORREZIONI PROPOSTE (dry-run)");

  const fixResults = await eslintFix.lintFiles(["**/*.{ts,tsx}"]);
  const withFixes = fixResults.filter((r) => r.output !== undefined);

  if (withFixes.length === 0) {
    console.log(`\n${GREEN}Nessuna correzione automatica disponibile.${RESET}\n`);
  } else {
    console.log(
      `\n${CYAN}${withFixes.length} file hanno correzioni applicabili automaticamente:${RESET}\n`
    );

    for (const result of withFixes) {
      const rel = path.relative(ROOT, result.filePath);
      const fixableCount = result.messages.filter((m) => m.fix).length;
      const fixedCount = result.fixableErrorCount + result.fixableWarningCount;
      console.log(
        `  ${BOLD}${rel}${RESET}  →  ${GREEN}${fixedCount} correzioni pronte${RESET}`
      );

      for (const msg of result.messages) {
        if (msg.fix) {
          const loc = `${DIM}${msg.line}:${msg.column}${RESET}`;
          console.log(
            `    ${loc}  ${CYAN}fix:${RESET} ${msg.message} ${DIM}(${msg.ruleId})${RESET}`
          );
        }
      }
    }

    console.log(
      `\n${DIM}Per applicare le correzioni automatiche esegui:${RESET}`
    );
    console.log(
      `  ${BOLD}npx eslint . --ext .ts,.tsx --fix${RESET}\n`
    );
  }

  // ── EXIT CODE ────────────────────────────────────────────────
  const totalErrors = lintedFiles.reduce((s, r) => s + r.errorCount, 0);
  const totalWarnings = lintedFiles.reduce((s, r) => s + r.warningCount, 0);

  header("RISULTATO FINALE");
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(`\n${GREEN}${BOLD}✓ Tutto pulito!${RESET}\n`);
    process.exit(0);
  } else {
    console.log(
      `\n${totalErrors > 0 ? RED : YELLOW}${BOLD}${totalErrors} errori, ${totalWarnings} avvisi totali${RESET}\n`
    );
    process.exit(totalErrors > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(`${RED}Errore ESLint:${RESET}`, err.message);
  process.exit(1);
});
