/**
 * Groq TPD (Token-Per-Day) soft-cap guard.
 *
 * Mantiene un contatore in-memory dei token usati su Groq oggi.
 * Il contatore è persistito atomicamente su app_settings (key groq_tpd_YYYY-MM-DD)
 * tramite un SQL upsert che esegue l'incremento in un'unica operazione
 * (nessun read-modify-write, safe rispetto a chiamate concorrenti).
 *
 * Al boot il valore corrente viene letto dal DB tramite loadGroqTpdFromDb().
 * Il refresh periodico (TTL 60s) è monotono: non riduce mai il contatore
 * in-memory anche se il DB mostra un valore inferiore (protezione da
 * out-of-order o lag).
 *
 * Soglia configurabile: app_settings key "groq_tpd_soft_cap", JSONB { cap: N }.
 * Default 160 000 token (80% del limite free tier 200k/giorno).
 */
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";

const TPD_KEY_PREFIX = "groq_tpd_";
const SOFT_CAP_KEY = "groq_tpd_soft_cap";
export const DEFAULT_SOFT_CAP = 150_000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function tpdKey(day: string): string {
  return `${TPD_KEY_PREFIX}${day}`;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let state: { day: string; tokens: number } = { day: "", tokens: 0 };
let softCap = DEFAULT_SOFT_CAP;

// Timestamp dell'ultimo caricamento dal DB (per TTL refresh ogni 60s).
let lastDbLoad = 0;
let refreshInFlight = false;
const DB_REFRESH_INTERVAL_MS = 60_000;

// ─── Atomic SQL increment ─────────────────────────────────────────────────────
// Un singolo upsert che fa tokens = existing + delta in una sola operazione DB.
// Ritorna il nuovo totale come riportato dal DB.
async function atomicIncrementTokens(key: string, delta: number): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (${key}, jsonb_build_object('tokens', ${delta}::int), NOW())
    ON CONFLICT (key) DO UPDATE SET
      value_json = jsonb_set(
        COALESCE(app_settings.value_json, '{"tokens":0}'::jsonb),
        '{tokens}',
        to_jsonb(COALESCE((app_settings.value_json->>'tokens')::int, 0) + ${delta}::int)
      ),
      updated_at = NOW()
    RETURNING (value_json->>'tokens')::int AS tokens
  `);
  return Number((result.rows[0] as Record<string, unknown>)?.tokens ?? delta);
}

// ─── Boot init (chiamare in initProviderHealth dopo le migration) ─────────────

export async function loadGroqTpdFromDb(): Promise<void> {
  const day = todayUtc();
  try {
    const [row, capRow] = await Promise.all([
      storage.getAppSetting(tpdKey(day)),
      storage.getAppSetting(SOFT_CAP_KEY),
    ]);
    const dbTokens = (row?.valueJson as { tokens?: number } | null)?.tokens ?? 0;
    // Monotono: il refresh dal DB non riduce mai il contatore in-memory.
    // In caso di out-of-order transient, manteniamo il massimo.
    const currentInMemory = state.day === day ? state.tokens : 0;
    state = { day, tokens: Math.max(dbTokens, currentInMemory) };
    const capVal = capRow?.valueJson as { cap?: number } | null;
    softCap = capVal?.cap ?? DEFAULT_SOFT_CAP;
    lastDbLoad = Date.now();
    console.log(`[groq-quota] TPD caricato dal DB: ${state.tokens}/${softCap} token (${day})`);
  } catch (err) {
    console.warn("[groq-quota] loadGroqTpdFromDb error:", (err as Error).message);
  }
}

// Ricalibra i contatori dal DB in background (TTL 60s).
// Il refresh è monotono: non può mai abbassare il contatore in-memory.
function maybeRefreshFromDb(): void {
  if (refreshInFlight) return;
  if (Date.now() - lastDbLoad < DB_REFRESH_INTERVAL_MS) return;
  refreshInFlight = true;
  loadGroqTpdFromDb()
    .catch(() => {})
    .finally(() => { refreshInFlight = false; });
}

// ─── Sync check (usato da isAvailable in provider.ts) ────────────────────────

export function isGroqTpdExceededSync(): boolean {
  const day = todayUtc();
  if (state.day !== day) {
    // Nuovo giorno → reset ottimistico
    state = { day, tokens: 0 };
  }
  // Trigger background refresh se stale (TTL 60s) — non blocca il check.
  maybeRefreshFromDb();
  return state.tokens >= softCap;
}

// ─── Record tokens dopo chiamata Groq riuscita ───────────────────────────────

export function recordGroqTokens(tokens: number): void {
  if (tokens <= 0) return;
  const day = todayUtc();
  // Aggiorna in-memory immediatamente (ottimistico) per un check successivo rapido.
  if (state.day !== day) {
    state = { day, tokens };
  } else {
    state.tokens += tokens;
  }
  const justExceeded = state.tokens - tokens < softCap && state.tokens >= softCap;
  if (justExceeded) {
    console.warn(
      `[ai-provider] Groq TPD soft-cap raggiunto (${state.tokens}/${softCap}) — skip a Gemini`,
    );
  }
  // Persist atomico in background: nessun read-modify-write, il DB fa l'incremento.
  // Il valore restituito dal DB sincronizza lo state con la realtà atomica.
  atomicIncrementTokens(tpdKey(day), tokens)
    .then((dbTotal) => {
      // Monotono: aggiorna in-memory solo se il DB riporta un totale maggiore.
      if (state.day === day && dbTotal > state.tokens) {
        state.tokens = dbTotal;
      }
    })
    .catch((e) => console.warn("[groq-quota] persist error:", (e as Error).message));
}

// ─── Admin: lettura stato corrente ───────────────────────────────────────────

export function getGroqTpdStatus(): { used: number; cap: number; pct: number; exceeded: boolean } {
  const day = todayUtc();
  const used = state.day === day ? state.tokens : 0;
  return {
    used,
    cap: softCap,
    pct: softCap > 0 ? used / softCap : 0,
    exceeded: used >= softCap,
  };
}

// ─── Admin: aggiornamento soglia ─────────────────────────────────────────────

export async function setGroqTpdSoftCap(cap: number): Promise<void> {
  softCap = cap;
  await storage.upsertAppSetting(SOFT_CAP_KEY, undefined, { cap });
}

// ─── Admin: reset quota giornaliera ──────────────────────────────────────────
// Azzera il contatore in-memory e cancella la riga DB per oggi,
// permettendo di risincronizzare manualmente il contatore con la realtà Groq.

export async function resetGroqTpd(): Promise<{ day: string; previousTokens: number }> {
  const day = todayUtc();
  const previousTokens = state.day === day ? state.tokens : 0;
  state = { day, tokens: 0 };
  lastDbLoad = Date.now();
  try {
    await db.execute(sql`
      DELETE FROM app_settings WHERE key = ${tpdKey(day)}
    `);
  } catch (err) {
    console.warn("[groq-quota] resetGroqTpd DB error (in-memory reset ok):", (err as Error).message);
  }
  console.log(`[groq-quota] quota reset manuale: ${previousTokens} → 0 token (${day})`);
  return { day, previousTokens };
}
