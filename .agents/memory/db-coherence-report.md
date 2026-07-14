---
name: DB coherence report (dev vs prod)
description: How the read-only dev↔prod DB consistency report is generated and why its data-level findings are low-signal.
---

# Report di coerenza DB (dev vs prod)

Generatore: `scripts/generate-db-check-report.ts` (orchestratore) + moduli in `scripts/db-check/` (shared/inventory/checklist/fk-duplicates/parity). Output: `docs/bikerlink-db-check-report.md`. Rieseguibile, **read-only** (solo SELECT + shell-out agli script di drift esistenti).

## Perché i check DATI sono a bassa confidenza
Il **DB dev è quasi vuoto**: ~166 tabelle ma solo una manciata popolate (users, user_profiles, moto_club_members, log/watchdog). Quindi FK-orfane, range, timestamp, duplicati tornano "0 violazioni" per **assenza di dati**, non per correttezza garantita in prod. Ogni sezione dati porta un avviso "Confidenza limitata" esplicito.

**Why:** interpretare "0 violazioni in dev" come "prod è pulito" è l'errore da evitare. La parte forte del report è §5 (strutturale).

## Prod non raggiungibile da connection string
Dalla sandbox Replit la prod **non** è raggiungibile via connection string (`BIKERLINK_DATABASE_URL` non impostata). Il confronto dev↔prod è **solo strutturale**, via lo snapshot offline `server/data/deep-schema-parity.prod.json`. Per estendere i check DATI a prod serve un dump o accesso prod (→ follow-up).

## Drift dev↔prod: direzione = gravità
Il parser di §5a classifica per direzione: "solo in source" = dev avanti (deploy pendente), "solo in target" = orfano in prod (regressione reale), "definizione diversa" = conflitto. Se TUTTO è dev-ahead e §5b (registry↔migration) è pulito → **Importante, non Bloccante**: le migration numerate lo applicheranno a prod al publish; va solo rinfrescato lo snapshot.

**How to apply:** quando rigeneri il report, se compaiono oggetti "solo in target" o "definizione diversa" → diventa Bloccante e va investigato.

## Copertura UNIQUE: single vs composita
La sezione duplicati distingue UNIQUE single-column (duplicati impossibili) da UNIQUE composita (es. `tags(category_id, slug)` → duplicati sul singolo `slug` LECITI, non violazioni). Non segnalare come anomalia un duplicato coperto da unique composta.

## Vincoli operativi
- FK introspection via `pg_catalog` (`conkey`/`confkey`) per essere **composite-FK safe**; `array_agg(attname::text)` obbligatorio (node-pg non parsa `name[]`).
- Il generatore va splittato ≤600 righe (ratchet gate scansiona anche `scripts/`).
