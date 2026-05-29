/**
 * BikerLink — Verifica Statica Schema vs Migrazioni Phase 1
 *
 * Per ogni colonna definita nel Drizzle schema per le tabelle critiche,
 * verifica che esista una delle due condizioni:
 *   A) La colonna è nella BASELINE (presente nel DB dalla creazione iniziale del progetto)
 *   B) La colonna ha una istruzione ALTER TABLE … ADD COLUMN IF NOT EXISTS in server/index.ts
 *
 * Se una colonna NON è in baseline NÉ coperta da Phase 1 → EXIT 1 (build bloccata).
 * Il controllo DB (informativo) è opzionale e non influenza l'exit code.
 *
 * Exit 0 → tutto OK (build può partire)
 * Exit 1 → colonne senza copertura Phase 1 trovate (build bloccata)
 */

import { users, userProfiles, motoClubs } from "../shared/db";
import * as fs from "fs";

// ── Baseline: colonne presenti nel DB dalla creazione iniziale del progetto ───
// Queste colonne non hanno (e non necessitano di) una migrazione Phase 1
// perché furono create dall'ORM al lancio iniziale del progetto.
// REGOLA: aggiungere qui solo colonne documentabilmente storiche;
//         qualsiasi altra nuova colonna deve avere una migrazione Phase 1.
const BASELINE_COLUMNS: Record<string, ReadonlySet<string>> = {
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
    // colonne aggiunte prima della baseline v54 (già presenti in prod)
    "suspended_until",
    "is_system",
    "ghost_mode",
    "map_tester",
    "floating_widget_enabled",
    "shadow_banned_at",
    "shadow_ban_reason",
    "shadow_banned_until",
    "last_logout_at",
    "last_app_close_at",
    "last_app_version",
    "last_platform",
    "last_device_model",
    "expo_push_token",
    "admin_prefs",
    "assistant_prefs",
    "first_login_at",
    "first_login_lat",
    "first_login_lng",
    "last_seen_match_at",
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
    // colonne aggiunte prima della baseline v54 (già presenti in prod)
    "preferred_map_style",
    "notification_preferences",
    "push_notifications_enabled",
    "hide_online_status",
    "hide_last_seen",
    "hide_distance",
    "fake_home_enabled",
    "home_latitude",
    "home_longitude",
    "fake_home_latitude",
    "fake_home_longitude",
    "fake_home_radius",
    "offline_position_randomize",
    "fake_work_enabled",
    "work_latitude",
    "work_longitude",
    "fake_work_latitude",
    "fake_work_longitude",
    "fake_work_radius",
    "fake_whatever_enabled",
    "whatever_latitude",
    "whatever_longitude",
    "fake_whatever_latitude",
    "fake_whatever_longitude",
    "fake_whatever_radius",
    "last_offline_lat",
    "last_offline_lng",
    "gps_precision",
    "units_preference",
    "map_filters",
    "music_taste_text",
    "geom",
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
    // colonne aggiunte prima della baseline v54 (già presenti in prod)
    "region",
    "country",
    "cover_url",
    "is_featured",
    "member_count",
  ]),
};

// ── Tipi per l'introspection Drizzle ─────────────────────────────────────────
interface DrizzleColumn {
  name: string;
}

function isDrizzleColumn(v: unknown): v is DrizzleColumn {
  return (
    typeof v === "object" &&
    v !== null &&
    "name" in v &&
    typeof (v as Record<string, unknown>).name === "string" &&
    ((v as DrizzleColumn).name.length > 0)
  );
}

const TABLES_TO_CHECK = [
  { name: "users", schema: users },
  { name: "user_profiles", schema: userProfiles },
  { name: "moto_clubs", schema: motoClubs },
] as const;

// ── Estrai nomi colonne DB dal table object Drizzle ───────────────────────────
function getSchemaColumns(table: Record<string, unknown>): string[] {
  return Object.values(table)
    .filter(isDrizzleColumn)
    .map((col) => col.name);
}

// ── Estrai colonne coperte da ALTER TABLE Phase 1 in server/index.ts ──────────
function getMigratedColumns(tableName: string): ReadonlySet<string> {
  const content = fs.readFileSync("server/index.ts", "utf-8");
  const regex = new RegExp(
    `ALTER\\s+TABLE\\s+${tableName}\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+(\\w+)`,
    "gi"
  );
  const cols = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    cols.add(match[1].toLowerCase());
  }
  return cols;
}

// ── Tipo per le righe information_schema.columns ──────────────────────────────
interface ColumnInfoRow {
  column_name: string;
}

// ── Verifica opzionale DB (informativa, non influenza exit code) ──────────────
async function checkDbColumnsInformational(
  tableName: string,
  schemaCols: readonly string[]
): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) return;
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const result = await client.query<ColumnInfoRow>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
      [tableName]
    );
    await client.end();
    const dbCols = new Set(result.rows.map((r) => r.column_name));
    const missingFromDb = schemaCols.filter((c) => !dbCols.has(c));
    if (missingFromDb.length > 0) {
      console.warn(
        `  ⚠  DB INFO: tabella "${tableName}" — colonne mancanti dal DB dev (applicare una migration SQL numerata):`
      );
      for (const col of missingFromDb) {
        console.warn(`       • ${col}`);
      }
    }
  } catch {
    // Silenzioso — il DB check è puramente informativo
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  let hasErrors = false;

  for (const { name, schema } of TABLES_TO_CHECK) {
    const schemaCols = getSchemaColumns(schema as unknown as Record<string, unknown>);
    const migratedCols = getMigratedColumns(name);
    const baseline = BASELINE_COLUMNS[name] ?? new Set<string>();

    const uncovered = schemaCols.filter(
      (col) => !baseline.has(col) && !migratedCols.has(col)
    );

    if (uncovered.length > 0) {
      console.error(
        `\n  ✖  ERRORE — tabella "${name}" — colonne SENZA migrazione Phase 1:`
      );
      for (const col of uncovered) {
        console.error(`       • ${col}`);
      }
      console.error(`     → Aggiungere in server/index.ts (Phase 1):`);
      for (const col of uncovered) {
        console.error(
          `       await db.execute(sql\`ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS ${col} <TIPO>\`);`
        );
      }
      hasErrors = true;
    }

    // Controllo DB opzionale — solo informativo
    await checkDbColumnsInformational(name, schemaCols);
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
