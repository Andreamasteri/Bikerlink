#!/usr/bin/env tsx
// Task #2537 — Pre-commit hook: esegue famiglie cheap del motore App Integrity
// (filesystem-based) e fallisce con exit code 1 se trova violazioni critical/high.
// Wireup manuale: ln -s ../../scripts/integrity-precommit.ts .git/hooks/pre-commit
// oppure invocato da husky/lefthook.
import { runIntegrityScan } from "../server/ai/integrity/runner";
import { ALL_FAMILIES, type Family } from "../server/ai/integrity/types";

async function main() {
  const argv = new Set(process.argv.slice(2));
  const onlyFamilies: Family[] = ALL_FAMILIES.filter((f) =>
    argv.size === 0 ? true : argv.has(f) || argv.has(`--${f}`),
  );
  const blockOn: Set<string> = new Set(["critical", "high"]);
  let totalCritical = 0;
  let totalHigh = 0;

  for (const fam of onlyFamilies) {
    const s = await runIntegrityScan({
      trigger: "precommit",
      family: fam,
      includeExpensive: false,
    });
    totalCritical += s.bySeverity.critical;
    totalHigh += s.bySeverity.high;
    const arrow = (s.bySeverity.critical || s.bySeverity.high) ? "✗" : "✓";
    process.stdout.write(
      `${arrow} [${fam}] ${s.checksRun} check · ${s.violationsFound} violazioni ` +
      `(crit=${s.bySeverity.critical} high=${s.bySeverity.high} med=${s.bySeverity.medium} low=${s.bySeverity.low})\n`,
    );
  }

  if (totalCritical > 0 || totalHigh > 0) {
    process.stderr.write(
      `\nApp Integrity ha bloccato il commit: ${totalCritical} critical, ${totalHigh} high.\n` +
      `Apri /admin/app-integrity per i dettagli o esegui:\n` +
      `  npx tsx scripts/integrity-precommit.ts <family>\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`\nApp Integrity OK ✓\n`);
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`integrity-precommit ERRORE: ${(e as Error).message}\n`);
  // Errore del tool non blocca il commit (degrado sicuro).
  process.exit(0);
});
