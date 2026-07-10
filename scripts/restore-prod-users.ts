/**
 * Ripristina dal backup PROD (29 maggio 2026) SOLO gli utenti reali
 * (is_fake !== true) e i relativi user_profiles (posizioni).
 *
 * Sorgente: .local/backups/prod_20260529_094757/
 * Target:   DATABASE_URL (impostare PROD_DATABASE_URL se si vuole forzare prod)
 *
 * Uso:
 *   npx tsx scripts/restore-prod-users.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../server/db";
import { users, userProfiles } from "../shared/db";
import { sql } from "drizzle-orm";

const BACKUP_DIR = resolve(process.cwd(), ".local/backups/prod_20260529_094757");

interface BackupUser {
  id: string;
  nickname: string;
  email: string;
  phone?: string | null;
  password: string;
  user_type?: string | null;
  sex?: string | null;
  couple_sex_config?: string | null;
  role?: string | null;
  status?: string | null;
  birth_year?: number | null;
  region?: string | null;
  avatar_url?: string | null;
  email_verified?: boolean | null;
  eula_accepted?: boolean | null;
  privacy_accepted?: boolean | null;
  consent_accepted_at?: string | null;
  deletion_requested_at?: string | null;
  deletion_scheduled_for?: string | null;
  invitation_code?: string | null;
  is_fake?: boolean | null;
  is_primal?: boolean | null;
  is_system?: boolean | null;
  country?: string | null;
  spoken_languages?: string[] | null;
  auto_join_clubs?: boolean | null;
  ghost_mode?: boolean | null;
  floating_widget_enabled?: boolean | null;
  last_login_at?: string | null;
  last_logout_at?: string | null;
  last_app_close_at?: string | null;
  last_app_version?: string | null;
  last_platform?: string | null;
  last_device_model?: string | null;
  first_login_at?: string | null;
  first_login_lat?: number | null;
  first_login_lng?: number | null;
  last_seen_match_at?: string | null;
  map_tester?: boolean | null;
  suspended_until?: string | null;
  shadow_banned_at?: string | null;
  shadow_ban_reason?: string | null;
  shadow_banned_until?: string | null;
  admin_prefs?: Record<string, unknown> | null;
  assistant_prefs?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface BackupProfile {
  id: string;
  user_id: string;
  is_available?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  max_pickup_distance?: number | null;
  bio?: string | null;
  total_km?: number | null;
  total_rides?: number | null;
  easter_eggs_collected?: number | null;
  search_preference?: string | null;
  admin_override_until?: string | null;
  preferred_map_style?: string | null;
  email_chat_notifications?: boolean | null;
  hide_from_map?: boolean | null;
  position_fuzz?: boolean | null;
  position_fuzz_km?: number | null;
  fake_home_enabled?: boolean | null;
  home_latitude?: number | null;
  home_longitude?: number | null;
  fake_home_latitude?: number | null;
  fake_home_longitude?: number | null;
  fake_home_radius?: number | null;
  coordinates_updated_at?: string | null;
  gps_precision?: string | null;
  units_preference?: Record<string, unknown> | null;
  offline_position_randomize?: boolean | null;
  fake_work_enabled?: boolean | null;
  work_latitude?: number | null;
  work_longitude?: number | null;
  fake_work_latitude?: number | null;
  fake_work_longitude?: number | null;
  fake_work_radius?: number | null;
  fake_whatever_enabled?: boolean | null;
  whatever_latitude?: number | null;
  whatever_longitude?: number | null;
  fake_whatever_latitude?: number | null;
  fake_whatever_longitude?: number | null;
  fake_whatever_radius?: number | null;
  last_offline_lat?: number | null;
  last_offline_lng?: number | null;
  map_filters?: Record<string, unknown> | null;
  notification_preferences?: Record<string, unknown> | null;
  push_notifications_enabled?: boolean | null;
  hide_online_status?: boolean | null;
  hide_last_seen?: boolean | null;
  hide_distance?: boolean | null;
  music_taste_text?: string | null;
  fixed_position_enabled?: boolean | null;
  fixed_position_lat?: number | null;
  fixed_position_lng?: number | null;
  updated_at?: string | null;
}

function readNdjson<T>(filename: string): T[] {
  const text = readFileSync(resolve(BACKUP_DIR, filename), "utf-8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      try {
        return JSON.parse(line) as T;
      } catch (e) {
        throw new Error(`Invalid JSON on ${filename}:${idx + 1}: ${(e as Error).message}`);
      }
    });
}

async function main() {
  const targetDb = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  console.log(`[restore] Sorgente: ${BACKUP_DIR}`);
  console.log(`[restore] Target DB: ${targetDb ? targetDb.replace(/\/\/.*@/, "//***@") : "NON CONFIGURATO"}`);

  if (!targetDb) {
    throw new Error("DATABASE_URL o PROD_DATABASE_URL non configurato");
  }

  const rawUsers = readNdjson<BackupUser>("users.ndjson");
  const rawProfiles = readNdjson<BackupProfile>("user_profiles.ndjson");

  const realUsers = rawUsers.filter((u) => u.is_fake !== true);
  const realUserIds = new Set(realUsers.map((u) => u.id));
  const realProfiles = rawProfiles.filter((p) => realUserIds.has(p.user_id));

  console.log(`[restore] Users totali: ${rawUsers.length}`);
  console.log(`[restore] Users reali: ${realUsers.length}`);
  console.log(`[restore] Profili reali: ${realProfiles.length}`);
  console.log(
    `[restore] Profili reali con coordinate: ${realProfiles.filter((p) => p.latitude != null && p.longitude != null).length}`
  );

  if (realUsers.length === 0) {
    console.log("[restore] Nessun utente reale da importare. Esco.");
    return;
  }

  // Mappa i profili per user_id per coerenza
  const profileByUserId = new Map(realProfiles.map((p) => [p.user_id, p]));
  const usersWithoutProfile = realUsers.filter((u) => !profileByUserId.has(u.id));
  if (usersWithoutProfile.length > 0) {
    console.warn(`[restore] Attenzione: ${usersWithoutProfile.length} utenti reali senza profilo.`);
  }

  const BATCH_SIZE = 100;

  // 1. Inserisce users
  let insertedUsers = 0;
  for (let i = 0; i < realUsers.length; i += BATCH_SIZE) {
    const batch = realUsers.slice(i, i + BATCH_SIZE).map((u) => ({
      id: u.id,
      nickname: u.nickname,
      email: u.email,
      phone: u.phone ?? null,
      password: u.password,
      userType: u.user_type ?? "biker",
      sex: u.sex ?? null,
      coupleSexConfig: u.couple_sex_config ?? null,
      role: u.role ?? "user",
      status: u.status ?? "active",
      birthYear: u.birth_year ?? null,
      region: u.region ?? null,
      avatarUrl: u.avatar_url ?? null,
      emailVerified: u.email_verified ?? false,
      eulaAccepted: u.eula_accepted ?? false,
      privacyAccepted: u.privacy_accepted ?? false,
      consentAcceptedAt: u.consent_accepted_at ? new Date(u.consent_accepted_at) : null,
      deletionRequestedAt: u.deletion_requested_at ? new Date(u.deletion_requested_at) : null,
      deletionScheduledFor: u.deletion_scheduled_for ? new Date(u.deletion_scheduled_for) : null,
      invitationCode: u.invitation_code ?? null,
      isFake: u.is_fake ?? false,
      isPrimal: u.is_primal ?? false,
      isSystem: u.is_system ?? false,
      country: u.country ?? null,
      spokenLanguages: u.spoken_languages ?? [],
      autoJoinClubs: u.auto_join_clubs ?? true,
      ghostMode: u.ghost_mode ?? false,
      floatingWidgetEnabled: u.floating_widget_enabled ?? true,
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : null,
      lastLogoutAt: u.last_logout_at ? new Date(u.last_logout_at) : null,
      lastAppCloseAt: u.last_app_close_at ? new Date(u.last_app_close_at) : null,
      lastAppVersion: u.last_app_version ?? null,
      lastPlatform: u.last_platform ?? null,
      lastDeviceModel: u.last_device_model ?? null,
      firstLoginAt: u.first_login_at ? new Date(u.first_login_at) : null,
      firstLoginLat: u.first_login_lat ?? null,
      firstLoginLng: u.first_login_lng ?? null,
      lastSeenMatchAt: u.last_seen_match_at ? new Date(u.last_seen_match_at) : null,
      mapTester: u.map_tester ?? false,
      suspendedUntil: u.suspended_until ? new Date(u.suspended_until) : null,
      shadowBannedAt: u.shadow_banned_at ? new Date(u.shadow_banned_at) : null,
      shadowBanReason: u.shadow_ban_reason ?? null,
      shadowBannedUntil: u.shadow_banned_until ? new Date(u.shadow_banned_until) : null,
      adminPrefs: u.admin_prefs ?? {},
      assistantPrefs: u.assistant_prefs ?? {},
      createdAt: u.created_at ? new Date(u.created_at) : new Date(),
      updatedAt: u.updated_at ? new Date(u.updated_at) : new Date(),
    }));

    const res = await db
      .insert(users)
      .values(batch)
      .onConflictDoNothing({ target: users.id });
    insertedUsers += res.rowCount ?? 0;
    console.log(`[restore] Users batch ${i / BATCH_SIZE + 1}: ${res.rowCount ?? 0} inseriti`);
  }

  // 2. Inserisce user_profiles
  let insertedProfiles = 0;
  for (let i = 0; i < realProfiles.length; i += BATCH_SIZE) {
    const batch = realProfiles.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      userId: p.user_id,
      isAvailable: p.is_available ?? false,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      maxPickupDistance: p.max_pickup_distance ?? 50,
      bio: p.bio ?? null,
      totalKm: p.total_km ?? 0,
      totalRides: p.total_rides ?? 0,
      easterEggsCollected: p.easter_eggs_collected ?? 0,
      searchPreference: p.search_preference ?? "both",
      adminOverrideUntil: p.admin_override_until ? new Date(p.admin_override_until) : null,
      preferredMapStyle: p.preferred_map_style ?? null,
      emailChatNotifications: p.email_chat_notifications ?? true,
      hideFromMap: p.hide_from_map ?? false,
      positionFuzz: p.position_fuzz ?? false,
      positionFuzzKm: p.position_fuzz_km ?? 1,
      fakeHomeEnabled: p.fake_home_enabled ?? false,
      homeLatitude: p.home_latitude ?? null,
      homeLongitude: p.home_longitude ?? null,
      fakeHomeLatitude: p.fake_home_latitude ?? null,
      fakeHomeLongitude: p.fake_home_longitude ?? null,
      fakeHomeRadius: p.fake_home_radius ?? 2,
      coordinatesUpdatedAt: p.coordinates_updated_at ? new Date(p.coordinates_updated_at) : null,
      gpsPrecision: p.gps_precision ?? "balanced",
      unitsPreference: p.units_preference ?? null,
      offlinePositionRandomize: p.offline_position_randomize ?? true,
      fakeWorkEnabled: p.fake_work_enabled ?? false,
      workLatitude: p.work_latitude ?? null,
      workLongitude: p.work_longitude ?? null,
      fakeWorkLatitude: p.fake_work_latitude ?? null,
      fakeWorkLongitude: p.fake_work_longitude ?? null,
      fakeWorkRadius: p.fake_work_radius ?? 2,
      fakeWhateverEnabled: p.fake_whatever_enabled ?? false,
      whateverLatitude: p.whatever_latitude ?? null,
      whateverLongitude: p.whatever_longitude ?? null,
      fakeWhateverLatitude: p.fake_whatever_latitude ?? null,
      fakeWhateverLongitude: p.fake_whatever_longitude ?? null,
      fakeWhateverRadius: p.fake_whatever_radius ?? 2,
      lastOfflineLat: p.last_offline_lat ?? null,
      lastOfflineLng: p.last_offline_lng ?? null,
      mapFilters: p.map_filters ?? null,
      notificationPreferences: p.notification_preferences ?? null,
      pushNotificationsEnabled: p.push_notifications_enabled ?? true,
      hideOnlineStatus: p.hide_online_status ?? false,
      hideLastSeen: p.hide_last_seen ?? false,
      hideDistance: p.hide_distance ?? false,
      musicTasteText: p.music_taste_text ?? null,
      fixedPositionEnabled: p.fixed_position_enabled ?? false,
      fixedPositionLat: p.fixed_position_lat ?? null,
      fixedPositionLng: p.fixed_position_lng ?? null,
      updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
    }));

    const res = await db
      .insert(userProfiles)
      .values(batch)
      .onConflictDoNothing({ target: userProfiles.id });
    insertedProfiles += res.rowCount ?? 0;
    console.log(`[restore] Profiles batch ${i / BATCH_SIZE + 1}: ${res.rowCount ?? 0} inseriti`);
  }

  console.log(`[restore] === RISULTATO ===`);
  console.log(`[restore] Utenti inseriti: ${insertedUsers} / ${realUsers.length}`);
  console.log(`[restore] Profili inseriti: ${insertedProfiles} / ${realProfiles.length}`);
  console.log(`[restore] Utenti con coordinate: ${realProfiles.filter((p) => p.latitude != null && p.longitude != null).length}`);
}

main()
  .then(() => {
    console.log("[restore] Completato.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[restore] ERRORE:", err);
    process.exit(1);
  });
