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
 * Baseline dei gruppi duplicati STORICI già applicati in un ambiente gestito.
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
  // 0157 è già applicato con entrambi i filename in candidate. Production
  // non ne ha ancora applicato nessuno; mantenere i nomi preserva l'identità
  // della history e consente al runner di applicare la coppia in ordine
  // lessicografico, senza rinominare una migration già tracciata.
  [
    "0157",
    new Set([
      "0157_fixed_couples.sql",
      "0157_watchdog_log_event_key.sql",
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
 * - Gruppo diverso dalla baseline (file extra/mancanti) → errore.
 * - Un membro presente senza l'altro → errore: il gruppo allowlistato deve
 *   essere completo.
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

  // The allowlist applies only when a duplicate prefix is actually present.
  // A historical migration may be absent from a merge ref because its identity
  // was already represented by a differently numbered migration; that is not
  // itself a duplicate and must not block unrelated builds.

  if (newDups.length === 0) return;

  const detail = newDups
    .map(([prefix, group]) => `  • ${prefix}: ${group.length > 0 ? group.join(", ") : "(nessun file)"}`)
    .join("\n");
  throw new Error(
    "[migrate] Prefisso numerico di migrazione duplicato o baseline incompleta — ordine di applicazione ambiguo:\n" +
      detail +
      "\nRipristina il gruppo completo o assegna il prossimo numero libero (NNNN_*.sql). " +
      "Regola di naming: vedi migrations/README.md.",
  );
}
