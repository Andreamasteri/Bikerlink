/**
 * inventory.ts — sezioni 0 (contesto) e 1 (inventario schema) del report. READ-ONLY.
 */
import { md, type Actions, type Ctx } from "./shared";

export function renderContext(ctx: Ctx): string[] {
  const out: string[] = [];
  const w = (s = "") => out.push(s);

  w(`# BikerLink — Report di coerenza DB (dev vs prod)`);
  w();
  w(`> **Generato:** ${ctx.nowIso}`);
  w(`> **Modalità:** sola lettura — nessuna modifica applicata al database.`);
  w(`> **Script sorgente:** \`scripts/generate-db-check-report.ts\` (rieseguibile).`);
  w();
  w(`Questo report fotografa lo stato del **DB di sviluppo** (interrogato live via \`DATABASE_URL\`) e lo confronta strutturalmente con il **DB di produzione** tramite lo snapshot offline \`${ctx.prodBaseline}\` (la prod non è raggiungibile con una connection string diretta dalla sandbox Replit). I check di integrità/logici/range girano sul DB dev live.`);
  w();

  w(`## 0. Contesto`);
  w();
  w(`| Metrica | Valore |`);
  w(`|---|---|`);
  w(`| Tabelle (public) | ${ctx.tblCount} |`);
  w(`| Colonne totali | ${ctx.colCount} |`);
  w(`| Tabelle con almeno 1 riga | ${ctx.populated.length} / ${ctx.tblCount} |`);
  w(`| Righe totali (dev) | ${ctx.totalRows} |`);
  w();
  w(`> ⚠️ **Il DB di sviluppo è quasi vuoto.** La maggior parte delle tabelle ha 0 righe. Molti check dati (FK orfane, range, duplicati) restituiscono quindi 0 violazioni per **assenza di dati**, non necessariamente per correttezza garantita in prod. La sezione strutturale (5) è la più significativa in questo contesto.`);
  w();
  if (ctx.populated.length) {
    w(`Tabelle popolate in dev:`);
    w();
    w(`| Tabella | Righe |`);
    w(`|---|---:|`);
    for (const [t, n] of [...ctx.populated].sort((a, b) => b[1] - a[1])) {
      w(`| \`${t}\` | ${n} |`);
    }
    w();
  }
  return out;
}

export function renderInventory(ctx: Ctx, actions: Actions): string[] {
  const out: string[] = [];
  const w = (s = "") => out.push(s);

  w(`## 1. Inventario schema (DB dev)`);
  w();
  w(`| Categoria | Conteggio |`);
  w(`|---|---:|`);
  w(`| Tabelle | ${ctx.tblCount} |`);
  w(`| Colonne | ${ctx.colCount} |`);
  w(`| Tabelle con PRIMARY KEY | ${ctx.pkTables.size} |`);
  w(`| UNIQUE constraint | ${ctx.uniques.length} |`);
  w(`| Indici UNIQUE | ${ctx.uniqueIdx.length} |`);
  w(`| FOREIGN KEY | ${ctx.fks.length} |`);
  w(`| CHECK constraint | ${ctx.checks.length} |`);
  w();

  const tablesNoPk = ctx.tableNames.filter((t) => !ctx.pkTables.has(t));
  if (tablesNoPk.length) {
    w(`**Tabelle senza PRIMARY KEY (${tablesNoPk.length}):** ${tablesNoPk.map((t) => `\`${t}\``).join(", ")}`);
    w();
    for (const t of tablesNoPk) {
      if (["spatial_ref_sys", "geography_columns", "geometry_columns"].includes(t)) continue;
      actions.cosmetic.push(`Tabella \`${t}\` priva di PRIMARY KEY — verificare se intenzionale.`);
    }
  }

  w(`<details><summary>CHECK constraint presenti (${ctx.checks.length})</summary>`);
  w();
  for (const c of ctx.checks) w(`- \`${c.tbl}.${c.conname}\`: \`${c.def}\``);
  w();
  w(`</details>`);
  w();
  w(`> Nota: lo schema fa affidamento quasi esclusivamente su tipi/NOT NULL e sulla logica applicativa; i vincoli \`CHECK\` a livello DB sono solo ${ctx.checks.length} (di cui 2 duplicati su \`user_sessions.exit_type\` e 1 di sistema PostGIS). I set-valore per gli enum-stato sono imposti dal codice, non dal DB — vedi checklist (f).`);
  w();

  w(`<details><summary>Inventario colonne per tabella (${ctx.tblCount} tabelle)</summary>`);
  w();
  for (const t of ctx.tableNames) {
    const cols = ctx.colsByTable.get(t) ?? [];
    w(`**\`${t}\`** — ${cols.length} colonne, ${ctx.rowCounts.get(t)} righe${ctx.pkTables.has(t) ? "" : " · ⚠️ no PK"}`);
    w();
    w(`| Colonna | Tipo | Null | Default |`);
    w(`|---|---|---|---|`);
    for (const c of cols) {
      const typ = c.character_maximum_length
        ? `${c.data_type}(${c.character_maximum_length})`
        : c.data_type;
      w(`| ${md(c.column_name)} | ${md(typ)} | ${c.is_nullable} | ${c.column_default ? md(String(c.column_default).slice(0, 40)) : ""} |`);
    }
    w();
  }
  w(`</details>`);
  w();
  return out;
}
