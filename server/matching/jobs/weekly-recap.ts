/**
 * Weekly Recap Job — BikerLink
 *
 * Ogni lunedì alle 9:00 (Europe/Rome) genera, per ogni utente attivo (con almeno
 * una sessione GPS negli ultimi 14 giorni), un recap con i top 5 match prodotti
 * negli ultimi 7 giorni ordinati per dynamicScore, più alcune statistiche
 * personali. Salva la riga in `weekly_recaps` e invia una push singola.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  users,
  weeklyRecaps,
  matchPreferences,
  routes as routesTable,
  userProfiles,
  bikerBikerMatches,
} from "@shared/db";
import { sendWeeklyRecapPushNotifications } from "../../push-notifications";

const TZ = "Europe/Rome";

export interface WeeklyRecapTopMatch {
  matchId: string;
  otherUserId: string;
  otherNickname: string | null;
  otherAvatar: string | null;
  motorcycleBrand: string;
  isSupermatch: boolean;
  score: number;
  createdAt: string;
}

export interface WeeklyRecapStats {
  totalKm: number;
  totalHours: number;
  totalRoutes: number;
  totalMatches: number;
}

/**
 * Calcola l'inizio settimana corrente (lunedì 00:00 Europe/Rome) come UTC Date.
 */
export function getWeekStartUtc(now: Date = new Date()): Date {
  // Calcolo manuale Europe/Rome usando Intl per ottenere il "wall time" italiano
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIdx = Math.max(0, weekdays.indexOf(parts.weekday ?? "Mon"));
  const daysSinceMonday = (dayIdx + 6) % 7;

  // Costruisci una data ISO con il wall time italiano corrente
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const local = new Date(isoLocal + "Z"); // interpretato come UTC ma rappresenta il wall time IT
  // Sottrai i giorni passati da lunedì e azzera l'orario al wall time
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  local.setUTCHours(0, 0, 0, 0);
  // Convertilo in vero UTC sottraendo l'offset IT effettivo a quell'istante
  // L'offset IT (in minuti) può essere CET (+60) o CEST (+120). Calcolalo
  // formattando di nuovo l'istante e confrontando con UTC.
  const offsetMinutes = computeRomeOffsetMinutes(local);
  return new Date(local.getTime() - offsetMinutes * 60_000);
}

function computeRomeOffsetMinutes(dateInRomeWall: Date): number {
  // Stima offset usando differenza tra wall time letto da Rome e UTC dell'istante
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // Cerchiamo l'offset attorno alla data: prova +60 e +120 e prendi quello che
  // produce lo stesso wall time italiano una volta riconvertito
  for (const candidate of [60, 120]) {
    const utc = new Date(dateInRomeWall.getTime() - candidate * 60_000);
    const parts = Object.fromEntries(fmt.formatToParts(utc).map((p) => [p.type, p.value]));
    if (
      Number(parts.year) === dateInRomeWall.getUTCFullYear() &&
      Number(parts.month) === dateInRomeWall.getUTCMonth() + 1 &&
      Number(parts.day) === dateInRomeWall.getUTCDate() &&
      Number(parts.hour) === dateInRomeWall.getUTCHours()
    ) {
      return candidate;
    }
  }
  return 60;
}

export interface WeeklyRecapResult {
  usersProcessed: number;
  recapsCreated: number;
  pushSent: number;
}

export async function runWeeklyRecapJob(now: Date = new Date()): Promise<WeeklyRecapResult> {
  const weekStart = getWeekStartUtc(now);
  const weekStartIso = weekStart.toISOString();
  const lookbackStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const activityCutoff = new Date(weekStart.getTime() - 14 * 24 * 60 * 60 * 1000);

  console.log(`[WeeklyRecap] Avvio job per settimana ${weekStartIso}`);

  // Utenti attivi: hanno almeno una route iniziata negli ultimi 14 giorni
  const activeUsers = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT r.user_id
    FROM ${routesTable} r
    WHERE r.started_at >= ${activityCutoff.toISOString()}
  `);

  const userIds = (activeUsers.rows ?? []).map((r) => r.user_id).filter(Boolean);
  if (userIds.length === 0) {
    console.log("[WeeklyRecap] Nessun utente attivo, esco");
    return { usersProcessed: 0, recapsCreated: 0, pushSent: 0 };
  }

  // Filtra utenti che hanno abilitato weeklyRecap (default true se nessuna riga prefs)
  const prefRows = await db.execute<{ user_id: string; weekly_recap: boolean }>(sql`
    SELECT user_id, weekly_recap FROM ${matchPreferences}
    WHERE user_id = ANY(${userIds}::text[])
  `);
  const optedOut = new Set(
    (prefRows.rows ?? []).filter((r) => r.weekly_recap === false).map((r) => r.user_id),
  );
  const eligibleUserIds = userIds.filter((id) => !optedOut.has(id));

  let recapsCreated = 0;
  const usersWithRecap: string[] = [];

  for (const userId of eligibleUserIds) {
    try {
      // Top 5 biker-biker match degli ultimi 7 giorni, ordinati per dynamicScore
      // (= base * exp(-ln2 * ageDays/halfLife)); usiamo half-life 7gg.
      const topRows = await db.execute<{
        match_id: string;
        other_id: string;
        nickname: string | null;
        avatar: string | null;
        motorcycle_brand: string;
        is_supermatch: boolean;
        created_at: string;
        score: number;
      }>(sql`
        SELECT
          m.id AS match_id,
          CASE WHEN m.biker1_id = ${userId} THEN m.biker2_id ELSE m.biker1_id END AS other_id,
          u.nickname,
          u.profile_picture_url AS avatar,
          m.motorcycle_brand,
          m.is_supermatch,
          m.created_at,
          (
            CASE WHEN m.is_supermatch THEN 2.0 ELSE 1.0 END
            * EXP(
                -0.6931471805599453
                * (EXTRACT(EPOCH FROM (NOW() - m.created_at)) / 86400.0)
                / 7.0
              )
          ) AS score
        FROM ${bikerBikerMatches} m
        JOIN ${users} u
          ON u.id = CASE WHEN m.biker1_id = ${userId} THEN m.biker2_id ELSE m.biker1_id END
        WHERE (m.biker1_id = ${userId} OR m.biker2_id = ${userId})
          AND m.created_at >= ${lookbackStart.toISOString()}
          AND m.created_at < ${weekStartIso}
          AND m.archived_at IS NULL
        ORDER BY score DESC
        LIMIT 5
      `);

      const topMatches: WeeklyRecapTopMatch[] = (topRows.rows ?? []).map((r) => ({
        matchId: r.match_id,
        otherUserId: r.other_id,
        otherNickname: r.nickname,
        otherAvatar: r.avatar,
        motorcycleBrand: r.motorcycle_brand,
        isSupermatch: Boolean(r.is_supermatch),
        score: Number(r.score),
        createdAt: new Date(r.created_at).toISOString(),
      }));

      // Statistiche personali settimana
      const statsRow = await db.execute<{
        total_km: number | null;
        total_seconds: number | null;
        total_routes: number | null;
        total_matches: number | null;
      }>(sql`
        SELECT
          COALESCE(SUM(r.total_distance_km), 0) AS total_km,
          COALESCE(SUM(r.duration_seconds), 0) AS total_seconds,
          COUNT(r.id) AS total_routes,
          (
            SELECT COUNT(*) FROM ${bikerBikerMatches} bm
            WHERE (bm.biker1_id = ${userId} OR bm.biker2_id = ${userId})
              AND bm.created_at >= ${lookbackStart.toISOString()}
              AND bm.created_at < ${weekStartIso}
          ) AS total_matches
        FROM ${routesTable} r
        WHERE r.user_id = ${userId}
          AND r.started_at >= ${lookbackStart.toISOString()}
          AND r.started_at < ${weekStartIso}
      `);

      const s = statsRow.rows?.[0];
      const stats: WeeklyRecapStats = {
        totalKm: Math.round(Number(s?.total_km ?? 0) * 10) / 10,
        totalHours: Math.round((Number(s?.total_seconds ?? 0) / 3600) * 10) / 10,
        totalRoutes: Number(s?.total_routes ?? 0),
        totalMatches: Number(s?.total_matches ?? 0),
      };

      // Salta utenti che non hanno né match né attività rilevante (nessun valore aggiunto)
      if (topMatches.length === 0 && stats.totalRoutes === 0 && stats.totalMatches === 0) {
        continue;
      }

      await db
        .insert(weeklyRecaps)
        .values({
          userId,
          weekStart,
          topMatches: topMatches as unknown as object,
          stats: stats as unknown as object,
        })
        .onConflictDoNothing({
          target: [weeklyRecaps.userId, weeklyRecaps.weekStart],
        });

      recapsCreated++;
      usersWithRecap.push(userId);
    } catch (err) {
      console.error(`[WeeklyRecap] Errore utente ${userId}:`, err);
    }
  }

  // Push notifications (rispetta la preferenza weeklyRecap + master toggle)
  let pushSent = 0;
  try {
    if (usersWithRecap.length > 0) {
      pushSent = await sendWeeklyRecapPushNotifications(usersWithRecap);
      // Aggiorna pushSentAt per i recap appena creati di questa settimana
      await db.execute(sql`
        UPDATE ${weeklyRecaps}
        SET push_sent_at = NOW()
        WHERE user_id = ANY(${usersWithRecap}::text[])
          AND week_start = ${weekStartIso}
          AND push_sent_at IS NULL
      `);
    }
  } catch (err) {
    console.error("[WeeklyRecap] Errore invio push:", err);
  }

  console.log(
    `[WeeklyRecap] Completato: ${recapsCreated} recap creati, ${pushSent} push inviate ` +
      `(eligibili=${eligibleUserIds.length}, attivi=${userIds.length})`,
  );
  return { usersProcessed: eligibleUserIds.length, recapsCreated, pushSent };
}

// Helper riusato anche dalla route /api/recap/current quando vogliamo
// pre-popolare i dati utente: nickname/avatar.
void userProfiles;
