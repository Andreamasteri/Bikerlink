#!/usr/bin/env npx tsx
/**
 * audit-package-updates.ts
 *
 * Recupera automaticamente changelog, bugfix e breaking-change dai repository
 * GitHub ufficiali ogni volta che vengono aggiornati pacchetti npm.
 *
 * Usage:
 *   npx tsx scripts/audit-package-updates.ts
 *     → legge il diff HEAD~1..HEAD di package.json (auto-detect)
 *
 *   npx tsx scripts/audit-package-updates.ts --from HEAD~3 --to HEAD
 *     → range di commit personalizzato
 *
 *   npx tsx scripts/audit-package-updates.ts --packages "expo@56.0.8>56.0.9,expo-router@56.2.8>56.2.9"
 *     → lista manuale (utile se package.json non è ancora committato)
 *
 * Output:
 *   .local/package-update-notes/YYYY-MM-DD.md
 */

import * as fs from "fs";
import * as path from "path";
import {
  type AuditResult,
  detectChangedPackages,
  fetchGitHubFile,
  fetchGitHubRelease,
  fetchIntermediateMajorReleases,
  formatReport,
  getRepoInfo,
  parseChangelogSections,
  parseManualPackages,
  extractRelevantSections,
} from "./audit-package-updates-lib";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const token = process.env.GITHUB_TOKEN;

  const manualIdx = args.indexOf("--packages");
  const fromIdx = args.indexOf("--from");
  const toIdx = args.indexOf("--to");

  const packages =
    manualIdx !== -1
      ? parseManualPackages(args[manualIdx + 1])
      : detectChangedPackages(
          fromIdx !== -1 ? args[fromIdx + 1] : "HEAD~1",
          toIdx !== -1 ? args[toIdx + 1] : "HEAD"
        );

  if (packages.length === 0) {
    console.log("✓ Nessun pacchetto modificato rilevato nel range specificato.");
    process.exit(0);
  }

  console.log(`\n🔍 Analizzando ${packages.length} pacchetti aggiornati...\n`);
  for (const p of packages) {
    console.log(`  ${p.name}: ${p.from} → ${p.to}`);
  }
  console.log("");

  const results: AuditResult[] = [];

  for (const pkg of packages) {
    process.stdout.write(`  📦 ${pkg.name} ... `);
    const info = getRepoInfo(pkg.name);

    if (!info) {
      console.log("repo non nel registry");
      results.push({ pkg, sections: [], noRepo: true });
      continue;
    }

    try {
      const content = await fetchGitHubFile(info, token);

      if (!content) {
        const [releaseNote, intermediateNotes] = await Promise.all([
          fetchGitHubRelease(info, pkg.to, token),
          fetchIntermediateMajorReleases(info, pkg.from, pkg.to, token),
        ]);
        const combined = [intermediateNotes, releaseNote].filter(Boolean).join("\n\n---\n\n") || null;
        if (combined) {
          const hasMajorNotes = !!intermediateNotes;
          console.log(`⬜ nessun CHANGELOG, release note trovata${hasMajorNotes ? " (+ major releases)" : ""}`);
          results.push({ pkg, sections: [], releaseNote: combined });
        } else {
          console.log("errore: CHANGELOG non trovato e nessuna release note");
          results.push({ pkg, sections: [], error: "CHANGELOG non trovato e nessuna release note disponibile" });
        }
        continue;
      }

      const allSections = parseChangelogSections(content);
      const relevant = extractRelevantSections(allSections, pkg.from, pkg.to);

      let releaseNote: string | null = null;
      if (relevant.length === 0) {
        const [toRelease, intermediateNotes] = await Promise.all([
          fetchGitHubRelease(info, pkg.to, token),
          fetchIntermediateMajorReleases(info, pkg.from, pkg.to, token),
        ]);
        releaseNote = [intermediateNotes, toRelease].filter(Boolean).join("\n\n---\n\n") || null;
      }

      const flags = [
        relevant.some((s) => s.hasBreaking) ? "⚠️ BREAKING" : "",
        relevant.some((s) => s.hasFix) ? "🔧 fix" : "",
        relevant.length === 0 ? "⬜ nessuna entry" : `${relevant.length} sezioni`,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(flags);

      results.push({ pkg, sections: relevant, releaseNote });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`errore: ${msg}`);
      results.push({ pkg, sections: [], error: msg });
    }
  }

  const now = new Date();
  const runDate = now.toISOString().split("T")[0];
  const report = formatReport(results, runDate);

  const outDir = path.join(process.cwd(), ".local/package-update-notes");
  fs.mkdirSync(outDir, { recursive: true });

  let fileName = `${runDate}.md`;
  if (fs.existsSync(path.join(outDir, fileName))) {
    const ts = now.toISOString().replace(/[:.]/g, "-").split("T")[1].split("-").slice(0, 3).join("");
    fileName = `${runDate}-${ts}.md`;
  }

  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, report, "utf-8");

  console.log(`\n✅ Report salvato in: ${outPath.replace(process.cwd() + "/", "")}`);

  const breaking = results.filter((r) => r.sections.some((s) => s.hasBreaking));
  if (breaking.length > 0) {
    console.log(`\n⚠️  Breaking changes in: ${breaking.map((r) => r.pkg.name).join(", ")}`);
    console.log("   Consulta il report prima di deployare.");
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
