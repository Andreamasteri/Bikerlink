/**
 * Nadir — endpoint admin (Task #75, step 1 & 5).
 *
 * Montato sotto /api/admin/nadir (vedi admin.ts). Espone:
 *   GET  /manual   → { text }                        (legge il manuale)
 *   PUT  /manual   → { text }                         (salva il manuale)
 *   GET  /status   → stato aggregato per il pannello  (reindex, salute, conteggi)
 *   POST /reindex  → reindicizza ORA + sonda salute   (trigger manuale)
 *   POST /search   → ricerca semantica di prova       (debug/test)
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response";
import {
  getNadirManual,
  saveNadirManual,
  getNadirStatus,
  reindexNadir,
  runNadirSearchHealthProbe,
  searchNadir,
  NADIR_LOG_PREFIX,
} from "../../ai/nadir";
import {
  getNadirManualTranslations,
  saveNadirManualTranslation,
  hashManualText,
} from "../../ai/nadir/manual";
import { translateManualToLanguage } from "../../ai/assistant/horus-scanner-finalize";
import {
  TRANSLATABLE_APP_LANGUAGES,
  APP_LANGUAGE_NAMES,
  SOURCE_APP_LANGUAGE,
  isAppLanguageCode,
  type AppLanguageCode,
} from "@shared/languages";

const router = Router();

const manualSchema = z.object({
  text: z.string().max(200_000),
});

const searchSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().int().min(1).max(10).optional(),
});

router.get("/manual", async (_req: Request, res: Response) => {
  try {
    const text = await getNadirManual();
    return sendSuccess(res, { text });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore lettura manuale Nadir");
  }
});

router.put("/manual", async (req: Request, res: Response) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Body non valido");
  try {
    const saved = await saveNadirManual(parsed.data.text);
    return sendSuccess(res, { text: saved, length: saved.length });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore salvataggio manuale Nadir");
  }
});

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await getNadirStatus();
    return sendSuccess(res, status as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore stato Nadir");
  }
});

router.post("/reindex", async (_req: Request, res: Response) => {
  try {
    console.log(`${NADIR_LOG_PREFIX} reindicizzazione manuale richiesta da admin`);
    // Reindicizza (tollerante) e poi esercita la ricerca (allarme reale se rotta).
    const indexStatus = await reindexNadir("manual");
    const searchHealth = await runNadirSearchHealthProbe("manual");
    return sendSuccess(res, { indexStatus, searchHealth });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore reindicizzazione Nadir");
  }
});

/**
 * Task #113 — Stato per-lingua delle traduzioni del manuale (senza il testo,
 * per un pannello leggero): esiste, quando è stata generata, se è stantia
 * rispetto all'italiano corrente (stesso controllo sourceHash usato in lettura).
 */
router.get("/manual/translations", async (_req: Request, res: Response) => {
  try {
    const [italian, translations] = await Promise.all([getNadirManual(), getNadirManualTranslations()]);
    const currentHash = hashManualText(italian);
    const languages = TRANSLATABLE_APP_LANGUAGES.map((lang) => {
      const entry = translations[lang];
      return {
        lang,
        name: APP_LANGUAGE_NAMES[lang],
        exists: !!entry,
        translatedAt: entry?.translatedAt ?? null,
        length: entry?.text?.length ?? 0,
        stale: !!entry && entry.sourceHash !== currentHash,
      };
    });
    return sendSuccess(res, { sourceLang: SOURCE_APP_LANGUAGE, languages });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore stato traduzioni manuale Nadir");
  }
});

/** Task #113 — Testo di una traduzione, per spot-check qualità dal pannello. */
router.get("/manual/translations/:lang", async (req: Request, res: Response) => {
  const lang = req.params.lang;
  if (!isAppLanguageCode(lang) || lang === SOURCE_APP_LANGUAGE) {
    return sendError(res, 400, "Lingua non valida (usa GET /manual per l'italiano)");
  }
  try {
    const [italian, translations] = await Promise.all([getNadirManual(), getNadirManualTranslations()]);
    const entry = translations[lang];
    if (!entry) return sendError(res, 404, "Nessuna traduzione ancora generata per questa lingua");
    const currentHash = hashManualText(italian);
    return sendSuccess(res, {
      lang,
      text: entry.text,
      translatedAt: entry.translatedAt,
      stale: entry.sourceHash !== currentHash,
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore lettura traduzione manuale Nadir");
  }
});

/**
 * Task #113 — Ritraduce SOLO la lingua richiesta a partire dal manuale
 * italiano corrente, senza rilanciare l'intera scansione completa di Horus.
 * Rigenera anche l'indice Nadir a fine ritraduzione (best-effort, non blocca
 * la risposta se fallisce: il testo tradotto resta comunque salvato).
 */
router.post("/manual/translations/:lang/retranslate", async (req: Request, res: Response) => {
  const lang = req.params.lang;
  if (!isAppLanguageCode(lang) || lang === SOURCE_APP_LANGUAGE) {
    return sendError(res, 400, "Lingua non valida (l'italiano è la sorgente, non una traduzione)");
  }
  try {
    const italian = await getNadirManual();
    if (!italian.trim()) return sendError(res, 400, "Manuale italiano vuoto: niente da tradurre");
    console.log(`${NADIR_LOG_PREFIX} ritraduzione manuale richiesta da admin per lingua=${lang}`);
    const translated = await translateManualToLanguage(italian, lang as AppLanguageCode);
    if (!translated) {
      return sendError(res, 502, "Traduzione fallita (nessun blocco tradotto con successo)");
    }
    const translatedAt = new Date().toISOString();
    const sourceHash = hashManualText(italian);
    await saveNadirManualTranslation(lang as AppLanguageCode, { text: translated, translatedAt, sourceHash });
    const indexStatus = await reindexNadir("manual").catch((e) => {
      console.warn(`${NADIR_LOG_PREFIX} reindicizzazione post-ritraduzione fallita (traduzione salvata comunque):`, (e as Error).message);
      return null;
    });
    return sendSuccess(res, { lang, translatedAt, length: translated.length, indexStatus });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore ritraduzione manuale Nadir");
  }
});

router.post("/search", async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Body non valido");
  try {
    // Route montata dietro _requireAdmin: contesto admin → può cercare tra le
    // conversazioni di tutti gli utenti (includeAllUsers).
    const result = await searchNadir(parsed.data.query, parsed.data.limit ?? 5, {
      includeAllUsers: true,
    });
    return sendSuccess(res, result as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore ricerca Nadir");
  }
});

export default router;
