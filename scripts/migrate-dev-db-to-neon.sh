#!/usr/bin/env bash
# migrate-dev-db-to-neon.sh
# Migra dati selettivi dal Replit managed Postgres → Neon dev branch.
# Sorgente: variabili PGHOST/PGDATABASE/PGUSER/PGPASSWORD/PGPORT (Replit)
# Destinazione: DATABASE_URL_DEV (Neon dev branch)
#
# NOTA: Neon non consente session_replication_role=replica né disable-triggers
# senza privilegi superuser. La strategia è:
#  - TRUNCATE all tables in one CASCADE statement (owner può farlo senza superuser)
#  - pg_dump --data-only senza --disable-triggers (COPY senza wrapper ALTER TABLE)
#  - Caricamento in ordine FK (padri prima dei figli) → i constraint sono soddisfatti
set -euo pipefail

# ── Validazione variabili ────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL_DEV:-}" ]]; then
  echo "❌ DATABASE_URL_DEV non impostata. Esporta il secret prima di eseguire."
  exit 1
fi

for var in PGHOST PGDATABASE PGUSER PGPASSWORD PGPORT; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ Variabile $var non impostata. Assicurati di eseguire nell'ambiente Replit."
    exit 1
  fi
done

DST="$DATABASE_URL_DEV"

# Tabelle in ordine FK: padri prima dei figli (usato per import e per la verifica)
TABLES=(
  schema_migrations
  tag_categories
  tags
  easter_eggs
  translation_keys
  text_aliases
  match_rules
  match_thresholds
  moderation_thresholds
  dr_correction_global
  ai_usage_budget
  app_settings
  ota_releases
  invitation_codes
  moto_clubs
  users
  user_profiles
  user_motorcycles
  moto_club_members
)

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Migrazione Replit Postgres → Neon dev branch                ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Sorgente: $PGHOST/$PGDATABASE"
echo "Destinazione: $(echo "$DST" | sed 's|://[^@]*@|://***@|')"
echo ""

# ── Funzione: conta righe su DB destinazione ─────────────────────────────────
count_dst() {
  local table="$1"
  psql "$DST" -tAq -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo "ERR"
}

# ── Funzione: conta righe su DB sorgente ─────────────────────────────────────
count_src() {
  local table="$1"
  PGPASSWORD="$PGPASSWORD" psql \
    -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -tAq -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo "ERR"
}

# ── TRUNCATE unico con CASCADE ───────────────────────────────────────────────
# Postgres gestisce internamente l'ordine FK con CASCADE.
# Non richiede superuser — è sufficiente essere proprietari delle tabelle.
echo ">>> Svuoto le tabelle destinazione (TRUNCATE CASCADE)..."

# Costruisci la lista di tabelle quotate per la clausola TRUNCATE
TRUNCATE_LIST=$(printf '"%s", ' "${TABLES[@]}" | sed 's/, $//')

psql "$DST" -c "TRUNCATE TABLE ${TRUNCATE_LIST} CASCADE;" \
  && echo "    ✓ TRUNCATE completato" \
  || { echo "❌ TRUNCATE fallito"; exit 1; }

echo ""

# ── Migrazione tabella per tabella ───────────────────────────────────────────
for table in "${TABLES[@]}"; do
  echo "─── Tabella: $table ────────────────────────────────────────────────"

  src_count=$(count_src "$table")
  echo "    Sorgente: $src_count righe"

  if [[ "$src_count" == "ERR" ]]; then
    echo "❌ Impossibile leggere la sorgente per $table"
    exit 1
  fi

  if [[ "$src_count" == "0" ]]; then
    echo "    ⚠️  Tabella vuota in sorgente — skip"
    echo ""
    continue
  fi

  # pg_dump --data-only senza --disable-triggers
  # (Neon non consente ALTER TABLE DISABLE TRIGGER ALL da utenti non superuser)
  # Il caricamento in ordine FK garantisce che i constraint siano soddisfatti.
  PGPASSWORD="$PGPASSWORD" pg_dump \
    -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --data-only \
    --table="$table" \
  | psql "$DST" --single-transaction \
  && echo "    ✓ Import OK" \
  || { echo "❌ Import FALLITO per tabella: $table"; exit 1; }

  dst_count=$(count_dst "$table")
  echo "    Destinazione dopo: $dst_count righe"

  if [[ "$dst_count" == "ERR" ]]; then
    echo "❌ Impossibile verificare il conteggio post-import per $table"
    exit 1
  fi

  if [[ "$dst_count" -lt "$src_count" ]]; then
    echo "⚠️  ATTENZIONE: righe importate ($dst_count) < sorgente ($src_count) per $table"
  fi

  echo ""
done

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Migrazione completata con successo!                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Riepilogo conteggi finali sul Neon dev:"
for table in "${TABLES[@]}"; do
  cnt=$(count_dst "$table")
  printf "  %-35s %s righe\n" "$table" "$cnt"
done
