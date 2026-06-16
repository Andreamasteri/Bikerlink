/**
 * Task #3393 — Telemetry Style Embedder
 *
 * Genera un embedding dello "stile di guida" di un utente a partire dal suo
 * `user_telemetry_profile` aggregato. Costruisce un testo descrittivo in
 * italiano (velocità, angolo di piega, fasce orarie, durata) e lo persiste in
 * `embeddings` con `entity_type='user'`, `field='telemetry_style'`.
 *
 * Gatekeeping: chiamare solo se `data_quality >= MIN_SESSIONS_FOR_EMBED` (=5).
 * Riutilizza la stessa pipeline embedding di bio/music (OpenAI con fallback
 * locale HF), incluso lo skip via sourceHash quando il testo non cambia.
 */

import type { UserTelemetryProfile } from "@shared/db";
import { upsertEmbedding } from "../embeddings/store";
import { limiters } from "../lib/throttle";

export const TELEMETRY_STYLE_FIELD = "telemetry_style";
export const MIN_SESSIONS_FOR_EMBED = 2;

/**
 * Etichette stile derivate dai bucket — usate sia nel testo descrittivo che
 * (dal runner) per popolare `styleLabels` dei match.
 */
export function styleLabelsFromProfile(p: {
  speedBucket: string;
  leanBucket: string;
  durationBucket: string;
  fractionMorning: number;
  fractionEvening: number;
}): string[] {
  const labels: string[] = [];

  switch (p.speedBucket) {
    case "slow": labels.push("calm_rider"); break;
    case "fast": labels.push("fast_rider"); break;
    case "sport": labels.push("sport_rider"); break;
    default: labels.push("steady_rider"); break;
  }

  switch (p.leanBucket) {
    case "sport": labels.push("dynamic_lean"); break;
    case "aggressive": labels.push("aggressive_lean"); break;
    default: labels.push("touring_lean"); break;
  }

  switch (p.durationBucket) {
    case "short": labels.push("short_rides"); break;
    case "long": labels.push("long_rides"); break;
    default: labels.push("medium_rides"); break;
  }

  if (p.fractionMorning >= 0.4) labels.push("morning_rider");
  if (p.fractionEvening >= 0.4) labels.push("evening_rider");

  return labels;
}

function speedDescriptor(bucket: string): string {
  switch (bucket) {
    case "slow": return "tranquilla";
    case "fast": return "veloce";
    case "sport": return "molto sportiva";
    default: return "regolare";
  }
}

function leanDescriptor(bucket: string): string {
  switch (bucket) {
    case "sport": return "dinamica";
    case "aggressive": return "aggressiva";
    default: return "da turismo";
  }
}

function durationDescriptor(bucket: string): string {
  switch (bucket) {
    case "short": return "uscite brevi";
    case "long": return "uscite lunghe";
    default: return "uscite di media durata";
  }
}

function timeDescriptor(fractionMorning: number, fractionEvening: number): string {
  if (fractionMorning >= 0.4 && fractionEvening >= 0.4) return "guida sia di mattina che di sera";
  if (fractionMorning >= 0.4) return "preferisce guidare di mattina";
  if (fractionEvening >= 0.4) return "preferisce guidare di sera";
  return "guida in fasce orarie miste";
}

/**
 * Costruisce il testo descrittivo dello stile di guida dal profilo aggregato.
 * Esportato per test e per debug/admin.
 */
export function buildTelemetryStyleText(p: UserTelemetryProfile): string {
  const round = (n: number, d = 0) => {
    const f = Math.pow(10, d);
    return Math.round((n ?? 0) * f) / f;
  };
  return [
    `Biker con guida ${speedDescriptor(p.speedBucket)} e piega ${leanDescriptor(p.leanBucket)}:`,
    `velocità media ${round(p.avgSpeedKmh)}km/h, picco (75° percentile) ${round(p.p75SpeedKmh)}km/h,`,
    `angolo di piega medio ${round(p.avgLeanAngle, 1)}°, max-lean medio ${round(p.maxLeanAvg, 1)}°,`,
    `durata media uscita ${round(p.avgDurationMin)}min (${durationDescriptor(p.durationBucket)}),`,
    `${timeDescriptor(p.fractionMorning, p.fractionEvening)}.`,
  ].join(" ");
}

/**
 * Genera (o riusa cache) l'embedding `telemetry_style` per l'utente e lo
 * salva in `embeddings`. Ritorna l'esito dell'upsert, o `null` se il profilo
 * non supera la soglia minima di sessioni.
 */
export async function generateTelemetryStyleEmbedding(
  profile: UserTelemetryProfile,
): Promise<{ cached: boolean; model: string } | null> {
  if (!profile?.userId) return null;
  if ((profile.dataQuality ?? 0) < MIN_SESSIONS_FOR_EMBED) return null;

  const text = buildTelemetryStyleText(profile);
  const result = await limiters.openai.schedule(() =>
    upsertEmbedding("user", profile.userId, TELEMETRY_STYLE_FIELD, text),
  );
  return { cached: result.cached, model: result.model };
}
