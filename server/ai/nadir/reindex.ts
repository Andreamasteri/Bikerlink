/**
 * Nadir — reindicizzazione notturna + sonda di salute ricerca (Task #75, step 2 & 3).
 *
 * Step 2 (reindicizzazione) è TOLLERANTE ai fallimenti: se una sorgente non si
 * riesce a reindicizzare, si logga e si tiene servendo il vecchio indice (le vecchie
 * righe + il vecchio manifest restano). L'esito dell'ultima corsa è persistito.
 *
 * Step 3 (sonda di salute) è DISTINTO: dopo la reindicizzazione esegue una VERA
 * ricerca sull'indice appena costruito; se fallisce alza un allarme admin reale
 * (riusando la stessa plumbing del watchdog) e traccia da quante notti consecutive
 * la ricerca è rotta. Questo è il caso "search itself is broken", diverso dal
 * fallimento tollerato della reindicizzazione.
 */
import { desc, and, eq, notInArray } from "drizzle-orm";
import { db, withDbRetry } from "../../db";
import { storage } from "../../storage";
import { aiConversationTurns, roadHazardComments, embeddings } from "@shared/db";
import { upsertEmbedding, getOpenAiCircuitBreakerStatus } from "../../embeddings";
import { getLastUsedModelTag } from "../../embeddings/client";
import { redactPII } from "../moderation/redact";
import { writeWatchdogLog } from "../watchdog/log";
import { sendSystemAlertPushToAdmins } from "../../push-notifications";
import { getAllNadirManualVersions, chunkManual } from "./manual";
import { type AppLanguageCode } from "@shared/languages";
import { searchNadir, loadFragmentManifest, type NadirFragmentManifest } from "./search";
import {
  CONVERSATION_WINDOW,
  COMMENT_WINDOW,
  MANUAL_CHUNK_SIZE,
  MANUAL_MAX_CHUNKS,
  MIN_FRAGMENT_CHARS,
  NADIR_COMMENT_ENTITY_TYPE,
  NADIR_CONVERSATION_ENTITY_TYPE,
  NADIR_FIELD,
  NADIR_FRAGMENTS_KEY,
  NADIR_INDEX_STATUS_KEY,
  NADIR_LOG_PREFIX,
  NADIR_MANUAL_ENTITY_TYPE,
  NADIR_SEARCH_HEALTH_KEY,
  type NadirOrigin,
} from "./constants";

export interface NadirIndexStatus {
  lastRunAt: string;
  trigger: "nightly" | "manual";
  ok: boolean;
  durationMs: number;
  model: string;
  counts: { manual: number; conversation: number; comment: number };
  errors: string[];
  /**
   * Task #108 — true quando questo run ha girato (in tutto o in parte) in
   * modalità "solo fallback locale" perché il circuit breaker OpenAI era
   * aperto (quota esaurita rilevata durante il run). Il modello locale resta
   * comunque valido per la ricerca — questo è solo un segnale di visibilità
   * admin (la qualità degli embedding OpenAI non è disponibile finché la
   * quota non si libera).
   */
  openAiFallbackActive: boolean;
  openAiFallbackReason: string | null;
}

export interface NadirSearchHealth {
  lastCheckAt: string;
  ok: boolean;
  /** Notti consecutive con ricerca rotta (0 = sana). */
  consecutiveFailedNights: number;
  probeQuery: string | null;
  hits: number;
  error: string | null;
}

// ── Reindicizzazione di una singola sorgente ──────────────────────────────────

interface SourceResult {
  entityType: string;
  origin: NadirOrigin;
  /** Nuove voci di manifest indicizzate con successo (vuoto se la sorgente ha fallito). */
  entries: NadirFragmentManifest;
  ok: boolean;
  error?: string;
  /**
   * Task #107 fix — indica se le tabelle `embeddings` per questo entityType
   * sono state EFFETTIVAMENTE scritte/pruned in questa corsa. Deve restare
   * DISACCOPPIATO da `ok`: il manuale multilingua può scrivere con successo
   * ALCUNE lingue/chunk e fallirne altri (ok=false) pur avendo mutato il DB
   * per quelle riuscite — `entries`/`mutated` riflettono lo stato REALE del
   * DB, `ok` è solo un flag di stato per gli allarmi admin. Se `mutated` è
   * assente si assume `= ok` (comportamento storico pre-Task#107: conversazioni
   * e commenti sono tutto-o-niente, quindi DB mutato SOLO quando ok=true).
   */
  mutated?: boolean;
}

/**
 * entityId dei chunk manuale: indice deterministico, prefissato con la lingua
 * (Task #107) così ogni versione tradotta occupa righe distinte nello stesso
 * entityType invece di collidere con l'italiano.
 */
function manualChunkId(lang: AppLanguageCode, i: number): string {
  return `${lang}-chunk-${i}`;
}

/** Elimina le righe di `entityType` il cui entityId NON è tra `keepIds`. */
async function pruneStale(entityType: string, keepIds: string[]): Promise<void> {
  if (keepIds.length === 0) {
    await withDbRetry(() =>
      db
        .delete(embeddings)
        .where(and(eq(embeddings.entityType, entityType), eq(embeddings.field, NADIR_FIELD))),
    );
    return;
  }
  // NB: usiamo il query builder (notInArray) invece di `<> ALL(${keepIds})`:
  // il template `sql` di drizzle espande un array JS in una lista di parametri
  // separati da virgola — legale per `IN (...)` ma NON per `ALL(...)`, che
  // richiede un vero array Postgres → altrimenti errore SQL a ogni prune.
  await withDbRetry(() =>
    db
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.entityType, entityType),
          eq(embeddings.field, NADIR_FIELD),
          notInArray(embeddings.entityId, keepIds),
        ),
      ),
  );
}

/**
 * Task #107 — Indicizza il manuale in TUTTE le lingue disponibili (italiano +
 * traduzioni), non solo l'italiano. Ogni lingua è chunked/embeddata separatamente
 * (stessi confini di paragrafo, testi diversi) e taggata con `lang` nel manifest,
 * così `searchNadir` può filtrare per la lingua del richiedente. Una lingua che
 * fallisce l'embedding non blocca le altre.
 */
async function reindexManual(): Promise<SourceResult> {
  const entries: NadirFragmentManifest = {};
  const errors: string[] = [];
  try {
    const versions = await getAllNadirManualVersions();
    const totalExpectedChunks: Array<{ lang: AppLanguageCode; i: number; text: string }> = [];
    for (const [lang, manual] of Object.entries(versions) as [AppLanguageCode, string][]) {
      const chunks = chunkManual(manual, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
      chunks.forEach((text, i) => {
        if (text.length >= MIN_FRAGMENT_CHARS) totalExpectedChunks.push({ lang, i, text });
      });
    }

    const keepIds: string[] = [];
    for (const { lang, i, text } of totalExpectedChunks) {
      const id = manualChunkId(lang, i);
      try {
        await upsertEmbedding(NADIR_MANUAL_ENTITY_TYPE, id, NADIR_FIELD, text);
        entries[`${NADIR_MANUAL_ENTITY_TYPE}:${id}`] = { origin: "manual", text, lang };
        keepIds.push(id);
      } catch (err) {
        errors.push(`${lang}:${i} — ${(err as Error)?.message ?? err}`);
      }
    }

    // Task #107 fix — pruneStale cancella dal DB qualunque id manuale NON in
    // keepIds: se TUTTI i chunk attesi sono falliti (keepIds vuoto ma c'era
    // contenuto da indicizzare), pruneStale cancellerebbe l'INTERO indice
    // manuale (tutte le lingue, comprese quelle indicizzate con successo in
    // corse precedenti) pur non avendo scritto nulla di nuovo. In quel caso
    // NON tocchiamo il DB affatto (mutated=false) e si continua a servire il
    // vecchio indice, esattamente come il comportamento pre-Task#107 quando
    // l'unica scrittura Ollama falliva prima di raggiungere pruneStale.
    const totalFailure = totalExpectedChunks.length > 0 && keepIds.length === 0;
    if (totalFailure) {
      return {
        entityType: NADIR_MANUAL_ENTITY_TYPE,
        origin: "manual",
        entries: {},
        ok: false,
        mutated: false,
        error: errors.slice(0, 5).join("; "),
      };
    }

    await pruneStale(NADIR_MANUAL_ENTITY_TYPE, keepIds);
    // Tollerante per-chunk/lingua: se ALMENO un chunk è stato indicizzato, il DB
    // è stato mutato e `entries` riflette ESATTAMENTE lo stato post-prune (quindi
    // va sempre pubblicato a manifest in reindexNadir, indipendentemente da `ok`).
    // `ok` resta un segnale di salute separato: false se qualche chunk/lingua è
    // fallito, per gli allarmi admin — ma non deve nascondere le lingue riuscite.
    return {
      entityType: NADIR_MANUAL_ENTITY_TYPE,
      origin: "manual",
      entries,
      ok: errors.length === 0,
      mutated: true,
      error: errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined,
    };
  } catch (err) {
    return {
      entityType: NADIR_MANUAL_ENTITY_TYPE,
      origin: "manual",
      entries: {},
      ok: false,
      mutated: false,
      error: (err as Error)?.message ?? String(err),
    };
  }
}

async function reindexConversations(): Promise<SourceResult> {
  const entries: NadirFragmentManifest = {};
  try {
    const rows = await withDbRetry(() =>
      db
        .select({
          id: aiConversationTurns.id,
          content: aiConversationTurns.content,
          userId: aiConversationTurns.userId,
        })
        .from(aiConversationTurns)
        .orderBy(desc(aiConversationTurns.createdAt))
        .limit(CONVERSATION_WINDOW),
    );
    const keepIds: string[] = [];
    for (const row of rows) {
      // SICUREZZA (Task #75): le conversazioni sono private per-utente. Persistiamo
      // `userId` nel manifest per scoping l'accesso in ricerca (vedi searchNadir) e
      // redigiamo la PII come difesa in profondità prima di indicizzare.
      const text = redactPII((row.content ?? "").trim()).trim();
      if (text.length < MIN_FRAGMENT_CHARS) continue;
      await upsertEmbedding(NADIR_CONVERSATION_ENTITY_TYPE, row.id, NADIR_FIELD, text);
      entries[`${NADIR_CONVERSATION_ENTITY_TYPE}:${row.id}`] = {
        origin: "conversation",
        text,
        userId: row.userId,
      };
      keepIds.push(row.id);
    }
    await pruneStale(NADIR_CONVERSATION_ENTITY_TYPE, keepIds);
    return { entityType: NADIR_CONVERSATION_ENTITY_TYPE, origin: "conversation", entries, ok: true };
  } catch (err) {
    return {
      entityType: NADIR_CONVERSATION_ENTITY_TYPE,
      origin: "conversation",
      entries: {},
      ok: false,
      error: (err as Error)?.message ?? String(err),
    };
  }
}

async function reindexComments(): Promise<SourceResult> {
  const entries: NadirFragmentManifest = {};
  try {
    const rows = await withDbRetry(() =>
      db
        .select({ id: roadHazardComments.id, text: roadHazardComments.text })
        .from(roadHazardComments)
        .orderBy(desc(roadHazardComments.createdAt))
        .limit(COMMENT_WINDOW),
    );
    const keepIds: string[] = [];
    for (const row of rows) {
      // I commenti hazard sono contenuto PUBBLICO (visibili a tutti sulla mappa),
      // quindi consultabili cross-utente per design; redigiamo comunque la PII come
      // difesa in profondità prima di indicizzare del testo libero utente.
      const text = redactPII((row.text ?? "").trim()).trim();
      if (text.length < MIN_FRAGMENT_CHARS) continue;
      await upsertEmbedding(NADIR_COMMENT_ENTITY_TYPE, row.id, NADIR_FIELD, text);
      entries[`${NADIR_COMMENT_ENTITY_TYPE}:${row.id}`] = { origin: "comment", text };
      keepIds.push(row.id);
    }
    await pruneStale(NADIR_COMMENT_ENTITY_TYPE, keepIds);
    return { entityType: NADIR_COMMENT_ENTITY_TYPE, origin: "comment", entries, ok: true };
  } catch (err) {
    return {
      entityType: NADIR_COMMENT_ENTITY_TYPE,
      origin: "comment",
      entries: {},
      ok: false,
      error: (err as Error)?.message ?? String(err),
    };
  }
}

/**
 * Reindicizza tutte le sorgenti Nadir. Tollerante: una sorgente che fallisce non
 * blocca le altre e lascia servendo il proprio vecchio indice. Persiste l'esito.
 */
export async function reindexNadir(trigger: "nightly" | "manual"): Promise<NadirIndexStatus> {
  const started = Date.now();
  console.log(`${NADIR_LOG_PREFIX} reindicizzazione avviata (trigger=${trigger})`);

  const oldManifest = await loadFragmentManifest().catch(() => ({} as NadirFragmentManifest));

  // Le sorgenti girano in sequenza per non contendere il pool DB durante il job.
  const results: SourceResult[] = [];
  results.push(await reindexManual());
  results.push(await reindexConversations());
  results.push(await reindexComments());

  // Manifest nuovo: parte dal vecchio (così le sorgenti FALLITE continuano a
  // servire il loro testo), poi per ogni sorgente RIUSCITA sostituisce le sue voci.
  const newManifest: NadirFragmentManifest = { ...oldManifest };
  const counts = { manual: 0, conversation: 0, comment: 0 };
  const errors: string[] = [];

  for (const r of results) {
    const prefix = `${r.entityType}:`;
    // Task #107 fix — `mutated` (default = `ok` per le sorgenti tutto-o-niente
    // conversazioni/commenti) dice se il DB `embeddings` è stato EFFETTIVAMENTE
    // riscritto/pruned in questa corsa. Il manifest DEVE sempre rispecchiare lo
    // stato reale del DB: pubblicarlo quando mutated=true (anche se `ok` è false
    // per un fallimento parziale, es. una lingua su sette del manuale), tenerlo
    // invariato quando mutated=false (nessuna scrittura è avvenuta, l'indice
    // vecchio è ancora quello servito dal DB).
    const mutated = r.mutated ?? r.ok;
    if (mutated) {
      // Rimuovi le vecchie voci di questa sorgente, aggiungi le nuove.
      for (const key of Object.keys(newManifest)) {
        if (key.startsWith(prefix)) delete newManifest[key];
      }
      Object.assign(newManifest, r.entries);
      counts[r.origin] = Object.keys(r.entries).length;
    } else {
      // Nessuna scrittura: conserva le vecchie voci (indice vecchio in servizio).
      counts[r.origin] = Object.keys(oldManifest).filter((k) => k.startsWith(prefix)).length;
    }
    if (!r.ok) {
      errors.push(`${r.origin}: ${r.error}`);
      console.warn(`${NADIR_LOG_PREFIX} sorgente "${r.origin}" ${mutated ? "con avvisi" : "fallita"} (tollerato):`, r.error);
    }
  }

  await storage.upsertAppSetting(NADIR_FRAGMENTS_KEY, undefined, newManifest);

  // Task #108 — visibilità admin: se il circuit breaker OpenAI si è aperto
  // durante QUESTO run (quota esaurita rilevata su uno dei chunk), il resto
  // del run è girato in fallback locale invece di ritentare OpenAI 3x per
  // ogni chunk successivo. Segnaliamolo esplicitamente nello stato persistito
  // e in log/push admin, invece di lasciarlo visibile solo come 40+ righe di
  // warning "OpenAI fallita, fallback locale" nei log grezzi.
  const breaker = getOpenAiCircuitBreakerStatus();
  const status: NadirIndexStatus = {
    lastRunAt: new Date().toISOString(),
    trigger,
    ok: errors.length === 0,
    durationMs: Date.now() - started,
    model: getLastUsedModelTag(),
    counts,
    errors,
    openAiFallbackActive: breaker.open,
    openAiFallbackReason: breaker.open ? breaker.reason : null,
  };
  await storage.upsertAppSetting(NADIR_INDEX_STATUS_KEY, undefined, status);
  console.log(
    `${NADIR_LOG_PREFIX} reindicizzazione completata — manual=${counts.manual} ` +
      `conversation=${counts.conversation} comment=${counts.comment} ` +
      `ok=${status.ok} durata=${status.durationMs}ms modello=${status.model}` +
      (status.openAiFallbackActive ? ` [OPENAI FALLBACK LOCALE ATTIVO: ${status.openAiFallbackReason}]` : ""),
  );

  if (status.openAiFallbackActive) {
    await writeWatchdogLog({
      kind: "alert",
      scope: "nadir.reindex",
      status: "warn",
      summary: `${NADIR_LOG_PREFIX} reindex (trigger=${trigger}) girato in fallback locale — quota OpenAI esaurita: ${status.openAiFallbackReason}`,
      details: { trigger, reason: status.openAiFallbackReason, reopenAt: breaker.reopenAt, counts },
    }).catch(() => {});
  }

  return status;
}

// ── Sonda di salute ricerca (step 3) ──────────────────────────────────────────

export async function getNadirSearchHealth(): Promise<NadirSearchHealth | null> {
  const row = await storage.getAppSetting(NADIR_SEARCH_HEALTH_KEY);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object") return raw as NadirSearchHealth;
  return null;
}

/**
 * Sceglie una query di sonda dal manifest: il testo di un frammento realmente
 * indicizzato. Cercarlo DEVE restituire almeno sé stesso con alta similarità:
 * se non accade (o la ricerca lancia), la ricerca è rotta.
 */
async function pickProbeQuery(): Promise<string | null> {
  const manifest = await loadFragmentManifest();
  const values = Object.values(manifest);
  if (values.length === 0) return null;
  // Preferisci un frammento del manuale (contenuto curato), altrimenti il primo.
  const manualEntry = values.find((v) => v.origin === "manual");
  const text = (manualEntry ?? values[0]).text;
  return text.slice(0, 200);
}

/**
 * Esegue una VERA ricerca sull'indice appena costruito. In caso di rottura alza
 * un allarme admin (plumbing watchdog) e incrementa lo streak di notti fallite.
 * In caso di successo azzera lo streak. Se non c'è nulla da indicizzare (manifest
 * vuoto), la sonda NON è un fallimento: non c'è indice da esercitare.
 */
/**
 * Esegue una VERA ricerca di controllo sull'indice.
 *
 * Il contatore `consecutiveFailedNights` avanza SOLO per le sonde notturne
 * (`trigger="nightly"`): è per definizione uno streak di *notti*. Una sonda
 * manuale (es. bottone "Reindicizza ora") registra comunque stato/errore e la
 * salute corrente, ma NON gonfia il conteggio delle notti né alza l'allarme di
 * staleness — evita che ripetuti test diurni facciano credere a più notti rotte.
 * Un successo azzera lo streak in ogni caso (la ricerca funziona di nuovo).
 */
export async function runNadirSearchHealthProbe(
  trigger: "nightly" | "manual" = "nightly",
): Promise<NadirSearchHealth> {
  const prev = await getNadirSearchHealth();
  const prevStreak = prev?.consecutiveFailedNights ?? 0;

  const probeQuery = await pickProbeQuery();
  if (!probeQuery) {
    const health: NadirSearchHealth = {
      lastCheckAt: new Date().toISOString(),
      ok: true,
      consecutiveFailedNights: 0,
      probeQuery: null,
      hits: 0,
      error: null,
    };
    await storage.upsertAppSetting(NADIR_SEARCH_HEALTH_KEY, undefined, health);
    console.log(`${NADIR_LOG_PREFIX} sonda salute: nessun frammento indicizzato, skip (non è un guasto)`);
    return health;
  }

  let ok = false;
  let hits = 0;
  let error: string | null = null;
  try {
    // Sonda di sistema: cerca tra tutte le sorgenti (includeAllUsers) per verificare
    // davvero l'indice, comprese le conversazioni private.
    const result = await searchNadir(probeQuery, 3, { includeAllUsers: true });
    hits = result.fragments.length;
    // Una self-search DEVE ritrovare almeno un frammento: 0 hits ⇒ indice/HNSW rotto.
    ok = hits > 0;
    if (!ok) error = "self-search ha restituito 0 frammenti sull'indice appena costruito";
  } catch (err) {
    ok = false;
    error = (err as Error)?.message ?? String(err);
  }

  // Successo → reset. Fallimento notturno → +1 notte. Fallimento manuale → streak invariato.
  const consecutiveFailedNights = ok
    ? 0
    : trigger === "nightly"
    ? prevStreak + 1
    : prevStreak;
  const health: NadirSearchHealth = {
    lastCheckAt: new Date().toISOString(),
    ok,
    consecutiveFailedNights,
    probeQuery: probeQuery.slice(0, 80),
    hits,
    error,
  };
  await storage.upsertAppSetting(NADIR_SEARCH_HEALTH_KEY, undefined, health);

  if (!ok) {
    console.error(
      `${NADIR_LOG_PREFIX} SONDA SALUTE RICERCA FALLITA (trigger=${trigger}, notti consecutive=${consecutiveFailedNights}): ${error}`,
    );
    // L'allarme di staleness è per le notti: solo il job notturno lo alza.
    if (trigger === "nightly") await raiseSearchHealthAlert(health);
  } else {
    console.log(`${NADIR_LOG_PREFIX} sonda salute ricerca OK (hits=${hits})`);
  }
  return health;
}

async function raiseSearchHealthAlert(health: NadirSearchHealth): Promise<void> {
  const nights = health.consecutiveFailedNights;
  const summary =
    `${NADIR_LOG_PREFIX} ricerca semantica ROTTA da ${nights} nott${nights === 1 ? "e" : "i"} ` +
    `consecutiv${nights === 1 ? "a" : "e"}: ${health.error ?? "sconosciuto"}`;
  // Plumbing watchdog: log persistito + push agli admin (stessa via degli altri alert).
  await writeWatchdogLog({
    kind: "alert",
    scope: "nadir.search_health",
    status: "error",
    summary,
    details: health,
  }).catch(() => {});
  await sendSystemAlertPushToAdmins(
    "🔎 Nadir: ricerca semantica rotta",
    `La self-search Nadir fallisce da ${nights} nott${nights === 1 ? "e" : "i"}. Controlla l'indice/embedding.`,
    { type: "nadir_search_broken", consecutiveFailedNights: nights },
  ).catch(() => {});
}

/**
 * Orchestratore del job notturno: reindicizza (tollerante) e poi esercita la
 * ricerca (allarme reale). I due passi sono deliberatamente distinti.
 */
export async function runNadirNightly(): Promise<void> {
  await reindexNadir("nightly").catch((e) =>
    console.warn(`${NADIR_LOG_PREFIX} reindicizzazione notturna errore (tollerato):`, e),
  );
  await runNadirSearchHealthProbe().catch((e) =>
    console.warn(`${NADIR_LOG_PREFIX} sonda salute errore:`, e),
  );
}
