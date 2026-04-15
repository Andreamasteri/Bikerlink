/**
 * BikerLink — Verifica Statica Schema vs Migrazioni Phase 1
 *
 * Per ogni colonna definita nel Drizzle schema per le tabelle critiche,
 * verifica che esista una delle due condizioni:
 *   A) La colonna è nella BASELINE (presente nel DB dalla creazione iniziale del progetto)
 *   B) La colonna ha una istruzione ALTER TABLE … ADD COLUMN IF NOT EXISTS in server/index.ts
 *
 * Se una colonna NON è in baseline NÉ in Phase 1 → EXIT 1 (build bloccata).
 *
 * Opzionalmente (se DATABASE_URL disponibile) verifica anche che le colonne
 * esistano nel DB reale — solo a scopo informativo, non blocca la build.
 *
 * Exit 0 → tutto OK (build può partire)
 * Exit 1 → colonne senza copertura migrazione Phase 1 trovate (build bloccata)
 */

import { users, userProfiles, motoClubs } from "../shared/schema";
import * as fs from "fs";

// ── Baseline: colonne presenti nel DB dalla creazione iniziale del progetto ───
// Queste colonne non hanno (e non necessitano di) una migrazione Phase 1
// perché sono state create dall'ORM al lancio iniziale del progetto.
// Se aggiungi una nuova colonna alla baseline, spiega perché è "storica".
const BASELINE_COLUMNS: Record<string, Set<string>> = {
  users: new Set([
    "id",
    "nickname",
    "email",
    "phone",
    "password",
    "user_type",
    "sex",
    "couple_sex_config",
    "role",
    "status",
    "birth_year",
    "region",
    "avatar_url",
    "email_verified",
    "eula_accepted",
    "privacy_accepted",
    "consent_accepted_at",
    "deletion_requested_at",
    "deletion_scheduled_for",
    "invitation_code",
    "is_fake",
    "is_primal",
    "country",
    "spoken_languages",
    "auto_join_clubs",
    "last_login_at",
    "created_at",
    "updated_at",
  ]),
  user_profiles: new Set([
    "id",
    "user_id",
    "is_available",
    "latitude",
    "longitude",
    "max_pickup_distance",
    "bio",
    "total_km",
    "total_rides",
    "easter_eggs_collected",
    "search_preference",
    "email_chat_notifications",
    "hide_from_map",
    "position_fuzz",
    "position_fuzz_km",
    "coordinates_updated_at",
    "admin_override_until",
    "updated_at",
  ]),
  moto_clubs: new Set([
    "id",
    "name",
    "club_type",
    "brand_name",
    "model_name",
    "description",
    "logo_url",
    "is_approved",
    "activity_score",
    "conversation_id",
    "parent_club_id",
    "latitude",
    "longitude",
    "proposed_latitude",
    "proposed_longitude",
    "proposed_address",
    "proposed_by",
    "proposed_at",
    "created_by",
    "created_at",
    "updated_at",
  ]),
};

const TABLES_TO_CHECK = [
  { name: "users", schema: users },
  { name: "user_profiles", schema: userProfiles },
  { name: "moto_clubs", schema: motoClubs },
];

// ── Estrai nomi colonne DB dal table object Drizzle ───────────────────────────
function getSchemaColumns(table: any): string[] {
  return Object.values(table)
    .filter(
      (v: any) =>
        v &&
        typeof v === "object" &&
        typeof v.name === "string" &&
        v.name.length > 0 &&
        !v.name.includes("(")
    )
    .map((v: any) => v.name as string);
}

// ── Estrai colonne coperte da ALTER TABLE in server/index.ts ──────────────────
function getMigratedColumns(tableName: string): Set<string> {
  const content = fs.readFileSync("server/index.ts", "utf-8");
  const regex = new RegExp(
    `ALTER\\s+TABLE\\s+${tableName}\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+(\\w+)`,
    "gi"
  );
  const cols = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    cols.add(match[1].toLowerCase());
  }
  return cols;
}

// ── Verifica opzionale DB (informativa, non blocca build) ─────────────────────
async function checkDbColumns(
  tableName: string,
  schemaCols: string[]
): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  try {
    // Importazione dinamica per non bloccare se pg non disponibile
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const { rows } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
      [tableName]
    );
    await client.end();
    const dbCols = new Set(rows.map((r: any) => r.column_name as string));
    const missingFromDb = schemaCols.filter((c) => !dbCols.has(c));
    if (missingFromDb.length > 0) {
      console.warn(
        `  ⚠  DB INFO: tabella "${tableName}" — colonne mancanti dal DB dev:`
      );
      for (const col of missingFromDb) {
        console.warn(`       • ${col}  ← eseguire db:push`);
      }
    }
  } catch {
    // Silenzioso: il DB check è opzionale
  }
}

async function main() {
  let hasErrors = false;

  for (const { name, schema } of TABLES_TO_CHECK) {
    const schemaCols = getSchemaColumns(schema);
    const migratedCols = getMigratedColumns(name);
    const baseline = BASELINE_COLUMNS[name] ?? new Set<string>();

    const uncovered: string[] = [];

    for (const col of schemaCols) {
      if (baseline.has(col)) continue; // colonna storica — OK
      if (migratedCols.has(col)) continue; // coperta da Phase 1 — OK
      uncovered.push(col); // né baseline né migrazione — PROBLEMA
    }

    if (uncovered.length > 0) {
      console.error(
        `\n  ✖  ERRORE — tabella "${name}" — colonne SENZA migrazione Phase 1:`
      );
      for (const col of uncovered) {
        console.error(`       • ${col}`);
      }
      console.error(
        `     → Aggiungere in server/index.ts (Phase 1):`
      );
      for (const col of uncovered) {
        console.error(
          `       await db.execute(sql\`ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS ${col} <TIPO>\`);`
        );
      }
      hasErrors = true;
    }

    // Verifica opzionale DB (non influenza exit code)
    await checkDbColumns(name, schemaCols);
  }

  if (hasErrors) {
    console.error(
      "\n  ✖  BUILD BLOCCATA — aggiungere le migrazioni Phase 1 mancanti in server/index.ts"
    );
    process.exit(1);
  }

  console.log(
    "\n  ✔  Schema verificato — tutte le colonne critiche hanno copertura migrazione."
  );
}

main();
