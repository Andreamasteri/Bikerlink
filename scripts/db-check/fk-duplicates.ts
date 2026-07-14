/**
 * fk-duplicates.ts — sezioni 2 (integrità FK) e 4 (duplicati candidate-unique).
 * READ-ONLY.
 */
import type { Pool } from "pg";
import type { Actions, Ctx } from "./shared";

export async function renderFk(pool: Pool, ctx: Ctx, actions: Actions): Promise<string[]> {
  const out: string[] = [];
  const w = (s = "") => out.push(s);

  w(`## 2. Integrità referenziale (FK)`);
  w();
  w(`Per ogni FK: conteggio delle righe figlio il cui valore (tupla, composite-safe) non-NULL non ha un parent corrispondente, con fino a 5 esempi.`);
  w();
  w(`> ⚠️ **Confidenza limitata:** le FK sulle tabelle con 0 righe (la maggioranza in dev) sono saltate — nessuna violazione possibile senza dati. Questo check è forte solo in un DB popolato (prod).`);
  w();

  const fkViolRows: string[] = [];
  for (const fk of ctx.fks) {
    const childRows = ctx.rowCounts.get(fk.child_table) ?? 0;
    if (childRows <= 0) continue;
    // composite-safe: tutte le colonne figlio non-NULL + NOT EXISTS su tutte le coppie
    const notNull = fk.child_cols.map((c) => `c."${c}" IS NOT NULL`).join(" AND ");
    const joinOn = fk.child_cols.map((c, i) => `p."${fk.parent_cols[i]}" = c."${c}"`).join(" AND ");
    const selCols = fk.child_cols.map((c) => `c."${c}"`).join(", ");
    let cnt = 0;
    let examples: string[] = [];
    try {
      const r = await pool.query<{ n: string }>(
        `SELECT count(*) n FROM "${fk.child_table}" c
         WHERE ${notNull}
           AND NOT EXISTS (SELECT 1 FROM "${fk.parent_table}" p WHERE ${joinOn})`,
      );
      cnt = Number(r.rows[0].n);
      if (cnt > 0) {
        const ex = await pool.query(
          `SELECT DISTINCT ${selCols} FROM "${fk.child_table}" c
           WHERE ${notNull}
             AND NOT EXISTS (SELECT 1 FROM "${fk.parent_table}" p WHERE ${joinOn}) LIMIT 5`,
        );
        examples = ex.rows.map((row) => Object.values(row as Record<string, unknown>).join("/"));
      }
    } catch (e) {
      fkViolRows.push(`| \`${fk.constraint_name}\` | \`${fk.child_table}(${fk.child_col})\` → \`${fk.parent_table}(${fk.parent_col})\` | errore: ${(e as Error).message} | |`);
      continue;
    }
    if (cnt > 0) {
      fkViolRows.push(
        `| \`${fk.constraint_name}\` | \`${fk.child_table}(${fk.child_col})\` → \`${fk.parent_table}(${fk.parent_col})\` | ${cnt} | ${examples.map((e) => "`" + e + "`").join(", ")} |`,
      );
      actions.blocking.push(`FK \`${fk.constraint_name}\` (\`${fk.child_table}(${fk.child_col})\`): ${cnt} righe orfane.`);
    }
  }
  if (fkViolRows.length) {
    w(`| Constraint | Relazione | Violazioni | Esempi (valori orfani) |`);
    w(`|---|---|---:|---|`);
    for (const r of fkViolRows) w(r);
  } else {
    w(`✅ **Nessuna violazione FK rilevata** sulle tabelle popolate (${ctx.fks.length} FK ispezionate; le tabelle con 0 righe sono saltate).`);
  }
  w();
  return out;
}

export async function renderDuplicates(pool: Pool, ctx: Ctx, actions: Actions): Promise<string[]> {
  const out: string[] = [];
  const w = (s = "") => out.push(s);

  w(`## 4. Duplicati su colonne candidate-unique`);
  w();
  w(`Colonne semanticamente uniche (email, slug, nickname, ...) — verifica presenza di UNIQUE constraint/indice e rilevazione duplicati sui valori presenti.`);
  w();
  w(`> ⚠️ **Confidenza limitata:** la colonna "Copertura UNIQUE" (dai cataloghi) è affidabile a prescindere dai dati; la colonna "Duplicati" riflette solo i dati dev (scarsi) — l'assenza di duplicati in dev non implica assenza in prod.`);
  w();

  const candidate = (
    await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema='public'
         AND column_name IN ('email','slug','username','nickname','external_id','normalized_email')
       ORDER BY table_name, column_name`,
    )
  ).rows;

  // Copertura UNIQUE: distingui single-column da composita.
  //  - single-column → duplicati sul valore impossibili.
  //  - composita (es. (category_id, slug)) → duplicati sulla singola colonna LECITI.
  const singleColUnique = new Set<string>();
  const compositeCols = new Map<string, string>(); // table.col → definizione della UNIQUE composita
  const addUnique = (table: string, cols: string[]) => {
    for (const c of cols) {
      if (cols.length === 1) singleColUnique.add(`${table}.${c}`);
      else if (!singleColUnique.has(`${table}.${c}`)) compositeCols.set(`${table}.${c}`, `(${cols.join(", ")})`);
    }
  };
  for (const u of ctx.uniqueIdx) {
    const m = u.indexdef.match(/\(([^)]+)\)/);
    if (m) addUnique(u.tablename, m[1].split(",").map((s) => s.trim().replace(/"/g, "").split(" ")[0]));
  }
  const uCols = (
    await pool.query<{ table_name: string; constraint_name: string; column_name: string; op: number }>(
      `SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position op
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema
       WHERE tc.table_schema='public' AND tc.constraint_type='UNIQUE'
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
    )
  ).rows;
  const byConstraint = new Map<string, { table: string; cols: string[] }>();
  for (const u of uCols) {
    const ckey = `${u.table_name}::${u.constraint_name}`; // evita collisioni di nome tra tabelle
    if (!byConstraint.has(ckey)) byConstraint.set(ckey, { table: u.table_name, cols: [] });
    byConstraint.get(ckey)!.cols.push(u.column_name);
  }
  for (const { table, cols } of byConstraint.values()) addUnique(table, cols);

  const dupRows: string[] = [];
  for (const c of candidate) {
    const key = `${c.table_name}.${c.column_name}`;
    const single = singleColUnique.has(key);
    const composite = !single && compositeCols.has(key);
    const coveredLabel = single ? "✅ single-col" : composite ? `➖ composita ${compositeCols.get(key)}` : "⚠️ **nessuno**";
    let dupInfo = "—";
    if ((ctx.rowCounts.get(c.table_name) ?? 0) > 0) {
      const d = await pool.query<{ v: string; n: string }>(
        `SELECT "${c.column_name}" v, count(*) n FROM "${c.table_name}"
         WHERE "${c.column_name}" IS NOT NULL
         GROUP BY "${c.column_name}" HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 5`,
      );
      if (d.rows.length) {
        const vals = d.rows.map((r) => "`" + r.v + "`×" + r.n).join(", ");
        if (single) {
          dupInfo = vals; // non dovrebbe accadere
        } else if (composite) {
          dupInfo = `${vals} — atteso (unique composta ${compositeCols.get(key)})`;
        } else {
          dupInfo = vals;
          actions.important.push(`Duplicati reali su \`${key}\` (nessun UNIQUE constraint): ${vals}.`);
        }
      } else {
        dupInfo = "nessun duplicato";
      }
    }
    dupRows.push(`| \`${key}\` | ${coveredLabel} | ${dupInfo} |`);
    if (!single && !composite) {
      actions.cosmetic.push(`Colonna candidate-unique \`${key}\` priva di UNIQUE constraint a livello DB — valutare se aggiungerlo (o se i duplicati sono leciti).`);
    }
  }
  w(`| Colonna | Copertura UNIQUE (DB) | Duplicati (dev) |`);
  w(`|---|---|---|`);
  for (const r of dupRows) w(r);
  w();
  w(`> Legenda: **single-col** = UNIQUE su colonna singola (duplicati impossibili); **composita** = colonna parte di una UNIQUE multi-colonna (duplicati sul singolo valore leciti); **nessuno** = nessun vincolo di unicità a livello DB.`);
  w();
  return out;
}
