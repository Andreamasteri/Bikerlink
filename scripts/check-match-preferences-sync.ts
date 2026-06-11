/**
 * Task #2527 — Controllo sync match_preferences ↔ registry ↔ UI.
 *
 * Confronta:
 *  1. Colonne fisiche in `match_preferences` (drizzle schema → snake_case)
 *  2. `MATCHING_REGISTRY.prefColumn` (snake_case)
 *  3. `MATCH_PREF_ITEMS` keys in `lib/match-pref-items.ts` (camelCase → snake)
 *
 * Esce con exit code != 0 se trova divergenze (CI gating).
 * Usage: `npx tsx scripts/check-match-preferences-sync.ts`
 */
import { matchPreferences } from "../shared/db/matching";
import { MATCHING_REGISTRY, getRegistryPrefColumns } from "../shared/matching-registry";
import { MATCH_PREF_ITEMS } from "../lib/match-pref-items";

const SOFT_EXCLUDED = new Set([
  "id", "user_id", "updated_at",
  "direct_match", "top_matches_only", "weekly_recap",
  "enableRLS",
]);

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (l) => "_" + l.toLowerCase());
}

/**
 * Mappa camelCase TS key → snake_case nome colonna SQL (così come dichiarato
 * in drizzle). Necessario perché alcune proprietà TS hanno typo storico
 * "zavarrina" mentre la colonna DB è "zavorrina".
 */
function getCamelToSnakeMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(matchPreferences)) {
    const col = v as { name?: string };
    if (col && typeof col.name === "string") {
      map.set(k, col.name);
    } else {
      map.set(k, camelToSnake(k));
    }
  }
  return map;
}

function getSchemaColumns(): string[] {
  return [...getCamelToSnakeMap().values()].filter((c) => !SOFT_EXCLUDED.has(c));
}

function getUiColumns(camelToSnakeMap: Map<string, string>): string[] {
  // Risolve ogni chiave UI nella colonna SQL effettiva via drizzle map,
  // così evitiamo falsi positivi su typo storici (zavarrina vs zavorrina).
  return MATCH_PREF_ITEMS
    .map((it) => camelToSnakeMap.get(String(it.key)) ?? camelToSnake(String(it.key)))
    .filter((c) => !SOFT_EXCLUDED.has(c));
}

function main(): number {
  const camelToSnakeMap = getCamelToSnakeMap();
  const registryCols = new Set(getRegistryPrefColumns());
  const schemaCols = new Set(getSchemaColumns());
  const uiCols = new Set(getUiColumns(camelToSnakeMap));
  const affinityOnly = new Set(
    MATCHING_REGISTRY.filter((t) => t.table === null).map((t) => t.prefColumn)
  );

  const errors: string[] = [];

  // (1) Registry colonne con table != null devono esistere in schema fisico.
  const missingFromSchema = [...registryCols].filter(
    (c) => !schemaCols.has(c) && !affinityOnly.has(c)
  );
  if (missingFromSchema.length > 0) {
    errors.push(
      `[ERROR] Colonne registry mancanti in match_preferences (schema): ${missingFromSchema.join(", ")}`
    );
  }

  // (2) Schema deve essere coperto dal registry (warning).
  const extraInSchema = [...schemaCols].filter((c) => !registryCols.has(c));
  if (extraInSchema.length > 0) {
    console.warn(
      `[WARN] Colonne schema senza entry nel registry: ${extraInSchema.join(", ")}`
    );
  }

  // (3) UI deve essere sottoinsieme del registry (ogni voce UI ha una entry).
  const uiMissingFromRegistry = [...uiCols].filter((c) => !registryCols.has(c));
  if (uiMissingFromRegistry.length > 0) {
    errors.push(
      `[ERROR] Voci UI senza entry nel registry: ${uiMissingFromRegistry.join(", ")}`
    );
  }

  // (4) Registry deve essere coperto dall'UI (warning informativo).
  // Le voci affinity-only (table === null) non richiedono un controllo UI.
  const registryMissingFromUi = [...registryCols].filter(
    (c) => !uiCols.has(c) && !affinityOnly.has(c)
  );
  if (registryMissingFromUi.length > 0) {
    console.warn(
      `[WARN] Entry registry non esposte in MATCH_PREF_ITEMS: ${registryMissingFromUi.join(", ")}`
    );
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    return 1;
  }
  console.log(
    `[OK] match_preferences sync: registry=${registryCols.size}, schema=${schemaCols.size}, ui=${uiCols.size}`
  );
  return 0;
}

process.exit(main());
