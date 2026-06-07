// Guardia: due file in migrations/ NON devono condividere lo stesso prefisso
// numerico (es. 0072_a.sql + 0072_b.sql). Il runner traccia per filename
// completo quindi non si blocca, ma due file con lo stesso numero rendono
// l'ordine di applicazione ambiguo (l'ordinamento ricade sul resto del nome) e
// ad alto rischio se una migration dipende dall'altra.
//
// Modulo PURO (nessun import di ./db) così può essere usato sia dal runner al
// boot (server/migrate.ts) sia da uno script di validazione CI senza aprire una
// connessione al DB né richiedere DATABASE_URL.

/**
 * Baseline dei gruppi duplicati STORICI già applicati in produzione.
 *
 * Chiave   = prefisso numerico (es. "0067")
 * Valore   = insieme ESATTO dei filename attesi per quel prefisso
 *
 * La guardia tratta un gruppo come "noto" SOLO se il set di file presenti su
 * disco corrisponde esattamente a questo insieme. Se un file viene aggiunto o
 * rimosso (es. 0067_qualcosa_nuovo.sql) il gruppo non combacia più → viene
 * trattato come un NUOVO duplicato e blocca il boot / la CI.
 *
 * NON rinominare i file elencati qui: sono già tracciati in schema_migrations
 * per filename completo; rinominarli causerebbe ri-applicazione o orfanizzazione
 * della riga di tracking. Un task dedicato (#3407) pianifica la procedura
 * sicura di bonifica con migration transazionale.
 */
export const KNOWN_DUPLICATE_FILE_SETS: ReadonlyMap<string, ReadonlySet<string>> = new Map<
  string,
  ReadonlySet<string>
>([
  [
    "0067",
    new Set([
      "0067_ai_call_logs_and_memory.sql",
      "0067_db_integrity_cascade_orphan_fix.sql",
      "0067_gist_index_user_profiles_geom.sql",
    ]),
  ],
  [
    "0072",
    new Set([
      "0072_ride_telemetry_indexes.sql",
      "0072_users_marketing_consent.sql",
    ]),
  ],
]);

/** Estrae il prefisso numerico iniziale (cifre prima del primo "_"). */
export function migrationPrefix(filename: string): string | null {
  const m = filename.match(/^(\d+)_/);
  return m ? m[1] : null;
}

/**
 * Raggruppa i file per prefisso numerico e restituisce solo i prefissi con più
 * di un file. Chiave = prefisso, valore = lista ordinata dei filename.
 */
export function findDuplicateMigrationPrefixes(
  files: readonly string[],
): Map<string, string[]> {
  const byPrefix = new Map<string, string[]>();
  for (const f of files) {
    const prefix = migrationPrefix(f);
    if (!prefix) continue;
    const arr = byPrefix.get(prefix) ?? [];
    arr.push(f);
    byPrefix.set(prefix, arr);
  }
  const dups = new Map<string, string[]>();
  for (const [prefix, group] of byPrefix) {
    if (group.length > 1) dups.set(prefix, [...group].sort());
  }
  return dups;
}

/**
 * Ritorna true se il gruppo di file per un dato prefisso corrisponde
 * ESATTAMENTE all'insieme storico noto (né file in più, né file in meno).
 */
function isExactKnownGroup(prefix: string, group: readonly string[]): boolean {
  const known = KNOWN_DUPLICATE_FILE_SETS.get(prefix);
  if (!known) return false;
  if (group.length !== known.size) return false;
  return group.every((f) => known.has(f));
}

/**
 * Verifica i duplicati e lancia se ne trova di NUOVI o di parzialmente
 * variati rispetto alla baseline.
 *
 * - Gruppo esattamente uguale alla baseline → warning (già applicato, sicuro).
 * - Gruppo diverso dalla baseline (file extra/mancanti) → errore, anche se il
 *   prefisso era in baseline (es. aggiunta di 0067_nuovo.sql).
 * - Gruppo mai visto in baseline → errore.
 *
 * @throws Error se esiste almeno un duplicato non riconducibile alla baseline.
 */
export function assertNoDuplicateMigrationPrefixes(files: readonly string[]): void {
  const dups = findDuplicateMigrationPrefixes(files);

  const newDups: Array<[string, string[]]> = [];
  for (const [prefix, group] of dups) {
    if (isExactKnownGroup(prefix, group)) {
      console.warn(
        `[migrate] prefisso duplicato noto ${prefix} (baseline esatta, già applicato): ${group.join(", ")}`,
      );
    } else {
      newDups.push([prefix, group]);
    }
  }

  if (newDups.length === 0) return;

  const detail = newDups
    .map(([prefix, group]) => `  • ${prefix}: ${group.join(", ")}`)
    .join("\n");
  throw new Error(
    "[migrate] Prefisso numerico di migrazione duplicato — ordine di applicazione ambiguo:\n" +
      detail +
      "\nRinomina uno dei file al prossimo numero libero (NNNN_*.sql). " +
      "Regola di naming: vedi migrations/README.md.",
  );
}
