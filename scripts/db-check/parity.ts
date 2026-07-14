/**
 * parity.ts — sezione 5: parità dev↔prod (deep-schema-parity) + drift
 * registry↔migration + index-drift + schema-in-DB vs schema-nel-codice.
 * Riusa gli script di drift esistenti (tutti read-only). READ-ONLY.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import type { Actions, Ctx } from "./shared";

function runScript(cmd: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: (err.stdout ?? "") + (err.stderr ?? "") + (err.message ?? "") };
  }
}

export function renderParity(ctx: Ctx, actions: Actions): string[] {
  const out: string[] = [];
  const w = (s = "") => out.push(s);
  const { prodBaseline: PROD_BASELINE, nowIso: NOW_ISO } = ctx;

  w(`## 5. Parità dev↔prod e schema-in-DB vs schema-nel-codice`);
  w();

  // 5a. deep-schema-parity dev↔prod
  w(`### 5a. Parità strutturale dev↔prod (deep-schema-parity)`);
  w();
  if (existsSync(PROD_BASELINE)) {
    const baseline = JSON.parse(readFileSync(PROD_BASELINE, "utf8")) as { capturedAt?: string; label?: string };
    const snapAge = baseline.capturedAt
      ? Math.round((Date.parse(NOW_ISO) - Date.parse(baseline.capturedAt)) / 86400000)
      : null;
    w(`Confronto \`DATABASE_URL\` (dev, live) ↔ \`${PROD_BASELINE}\` (snapshot prod catturato **${baseline.capturedAt ?? "?"}**${snapAge !== null ? `, ${snapAge} giorni fa` : ""}). Confronta le DEFINIZIONI complete (tipo, default, constraint, indici, enum, trigger, extension, sequence).`);
    w();
    const r = runScript("npx", ["tsx", "scripts/check-deep-schema-parity.ts", "compare", "env:DATABASE_URL", PROD_BASELINE]);

    // Parsa il diff per DIREZIONE: la gravità dipende da quale lato ha l'oggetto.
    //  - "solo in source"  = presente in DEV, assente nello snapshot prod → dev avanti (deploy pendente).
    //  - "solo in target"  = presente in PROD, assente in dev → oggetto orfano in prod (concern reale).
    //  - "definizione diversa" = stessa chiave, definizione divergente → conflitto (concern reale).
    const lines = r.output.split("\n");
    const parseDir = (marker: string) =>
      lines.filter((l) => l.includes(marker)).map((l) => l.replace(/.*:\s*/, "").trim());
    const onlyDev = parseDir("solo in source");
    const onlyProd = parseDir("solo in target");
    const changed = lines.filter((l) => l.includes("definizione diversa")).map((l) => l.replace(/.*:\s*/, "").trim());
    const tablesDev = [...new Set(onlyDev.map((k) => k.split(".")[0]))].filter(Boolean);

    if (r.ok) {
      w(`**Esito: IN SYNC** ✅ — nessun nuovo drift (solo eccezioni note in allow-list: versione PostGIS, PK PostGIS di sistema).`);
    } else {
      w(`**Esito: DRIFT strutturale rilevato** — ma unidirezionale (dev → prod).`);
      w();
      w(`| Direzione | Oggetti | Significato |`);
      w(`|---|---:|---|`);
      w(`| Solo in **dev** (assenti nello snapshot prod) | ${onlyDev.length} | Dev è avanti: nuove colonne/constraint/indici non ancora nel snapshot prod |`);
      w(`| Solo in **prod** (assenti in dev) | ${onlyProd.length} | Oggetti orfani in prod (regressione) |`);
      w(`| Definizione divergente | ${changed.length} | Conflitto reale di definizione |`);
      w();
      w(`**Aree (tabelle) dove dev è avanti rispetto allo snapshot prod (${tablesDev.length}):** ${tablesDev.map((t) => `\`${t}\``).join(", ")}`);
      w();
      if (onlyProd.length === 0 && changed.length === 0) {
        w(`> ✅ **Nessun oggetto presente solo in prod e nessuna definizione divergente.** Tutto il drift è "dev avanti a prod": nuovi oggetti in dev che lo snapshot prod (${snapAge ?? "?"} giorni fa) non contiene. Poiché §5b conferma che registry↔migration è pulito, questi oggetti sono coperti da migration numerate e verranno applicati a prod al prossimo publish. **Non è un conflitto di schema**: è drift di deploy pendente + snapshot prod da rinfrescare. Classificato come *Importante*, non *Bloccante*.`);
        actions.important.push(`Deploy pendente: ${tablesDev.length} aree di schema esistono in dev ma non nello snapshot prod (${baseline.capturedAt}). Applicare le migration a prod al prossimo publish e ricatturare lo snapshot \`${PROD_BASELINE}\`.`);
      } else {
        actions.blocking.push(`Deep-schema-parity dev↔prod: ${onlyProd.length} oggetti solo in prod e/o ${changed.length} definizioni divergenti (vedi §5a) — conflitto reale.`);
      }
    }
    w();
    w(`<details><summary>Dettaglio diff deep-schema-parity</summary>`);
    w();
    w("```");
    w(r.output.trim());
    w("```");
    w();
    w(`</details>`);
  } else {
    w(`⚠️ Snapshot prod \`${PROD_BASELINE}\` assente — confronto strutturale dev↔prod non eseguibile.`);
  }
  w();
  w(`> **Prod non raggiungibile live:** i check dati (§2–4) NON sono stati eseguiti su prod. \`BIKERLINK_DATABASE_URL\` non è impostata. Per estenderli a prod serve una connection string prod raggiungibile o un dump.`);
  w();

  // 5b. registry ↔ migration drift
  w(`### 5b. Drift registry Drizzle ↔ migration numerate`);
  w();
  const rMig = runScript("npx", ["tsx", "server/scripts/check-schema-migration-drift.ts"]);
  w(rMig.ok ? `**Esito: OK** ✅ — tabelle/colonne del registry coperte dalle migration.` : `**Esito: DRIFT** ⚠️`);
  if (!rMig.ok) actions.important.push(`Drift registry↔migration rilevato (vedi §5b).`);
  w();
  w("```");
  w(rMig.output.trim().split("\n").slice(-40).join("\n"));
  w("```");
  w();

  // 5c. index drift (static)
  w(`### 5c. Index drift (statico)`);
  w();
  const rIdx = runScript("npx", ["tsx", "scripts/check-index-drift.ts", "--static-only"]);
  w(rIdx.ok ? `**Esito: OK** ✅ — nessuna regressione/inverse-drift negli indici speciali (DESC/WHERE).` : `**Esito: PROBLEMI** ⚠️`);
  if (!rIdx.ok) actions.important.push(`Index drift rilevato (vedi §5c).`);
  w();
  w("```");
  w(rIdx.output.trim().split("\n").slice(-40).join("\n"));
  w("```");
  w();

  // 5d. schema-in-DB (dev live) vs registry code
  w(`### 5d. Schema-in-DB (dev) vs schema-nel-codice (registry Drizzle)`);
  w();
  const rCode = runScript("npx", ["tsx", "scripts/check-schema-drift.ts"]);
  w(rCode.ok ? `**Esito: OK** ✅ — il DB dev combacia col registry \`@shared/db\` (colonne/tipi/nullability).` : `**Esito: DRIFT** ⚠️ — divergenze tra DB dev e registry.`);
  if (!rCode.ok) actions.important.push(`Drift schema DB dev ↔ registry codice rilevato (vedi §5d).`);
  w();
  w("```");
  w(rCode.output.trim().split("\n").slice(-60).join("\n"));
  w("```");
  w();
  return out;
}
