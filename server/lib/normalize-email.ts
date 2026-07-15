/**
 * Task #13 — normalizza un'email opzionale (business/officina) prima di
 * scriverla: trim + lowercase, stringa vuota → null. Deve restare in lockstep
 * con l'indice UNIQUE parziale su LOWER(email) (migrations/0142_*.sql e
 * shared/db/business.ts / shared/db/workshops.ts) — se qui non si normalizza
 * "Foo@Bar.com" e "foo@bar.com" finiscono su righe diverse in memoria ma
 * collidono al primo UPDATE, o viceversa restano "duplicati" logici che il
 * DB non intercetta perché la colonna raw differisce solo per maiuscole.
 */
export function normalizeOptionalEmail(email: string | null | undefined): string | null {
  if (email === undefined || email === null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}
