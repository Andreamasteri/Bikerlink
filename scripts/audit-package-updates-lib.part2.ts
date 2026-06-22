import { PackageDiff, ChangelogSection } from "./audit-package-updates-lib";

export interface AuditResult {
  pkg: PackageDiff;
  sections: ChangelogSection[];
  releaseNote?: string | null;
  error?: string;
  noRepo?: boolean;
}

export function formatReport(results: AuditResult[], runDate: string): string {
  const lines: string[] = [
    `# Package Update Audit — ${runDate}`,
    "",
    `Generato automaticamente da \`scripts/audit-package-updates.ts\``,
    "",
  ];

  const anyBreaking = results.some((r) => r.sections.some((s) => s.hasBreaking));
  lines.push("## Riepilogo");
  lines.push("");
  lines.push("| Pacchetto | Da | A | Breaking | Fix | Note |");
  lines.push("|-----------|----|----|:--------:|:---:|------|");

  for (const r of results) {
    const breaking = r.sections.some((s) => s.hasBreaking) ? "⚠️ SÌ" : "—";
    const fix = r.sections.some((s) => s.hasFix) ? "✓" : "—";
    const note = r.noRepo
      ? "nessun repo nel registry"
      : r.error
      ? `errore: ${r.error}`
      : r.sections.length === 0
      ? "sezioni non trovate nel CHANGELOG"
      : `${r.sections.length} versioni`;
    lines.push(`| \`${r.pkg.name}\` | ${r.pkg.from} | ${r.pkg.to} | ${breaking} | ${fix} | ${note} |`);
  }

  if (anyBreaking) {
    lines.push("");
    lines.push("> ⚠️ **Attenzione: breaking changes rilevati.** Controlla le sezioni evidenziate sotto.");
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Dettaglio per pacchetto");
  lines.push("");

  for (const r of results) {
    lines.push(`### \`${r.pkg.name}\` — ${r.pkg.from} → ${r.pkg.to}`);
    lines.push("");

    if (r.noRepo) {
      lines.push("_Repo GitHub non nel registry. Verifica manualmente su [npmjs.com](https://www.npmjs.com/package/" + r.pkg.name + ")_");
      lines.push("");
      continue;
    }

    if (r.error) {
      lines.push(`_Errore nel recupero changelog: ${r.error}_`);
      lines.push("");
      continue;
    }

    if (r.sections.length === 0) {
      if (r.releaseNote) {
        lines.push("_Sezione CHANGELOG non trovata, ma GitHub Release disponibile:_");
        lines.push("");
        lines.push(r.releaseNote.trim());
      } else {
        lines.push("_Nessuna entry trovata nel CHANGELOG per questa versione._");
      }
      lines.push("");
      continue;
    }

    for (const sec of r.sections) {
      const dateStr = sec.date ? ` — ${sec.date}` : "";
      const flags = [
        sec.hasBreaking ? "⚠️ BREAKING" : "",
        sec.hasFix ? "🔧 fix" : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`#### v${sec.version}${dateStr} ${flags}`);
      lines.push("");
      lines.push(sec.content.trim());
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("_Fine report_");
  return lines.join("\n");
}
