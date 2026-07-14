import { Router, type Request, type Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { translationKeys } from "@shared/db";
import { translationKeySchema } from "@shared/db";
import { sendError } from "../../lib/api-response";
import {
  runAiCompletion,
  buildDoneMessage,
  AiProviderUnavailableError,
} from "./translations-ai";

const router = Router();

const VALID_LANGS = new Set(["it", "en", "de", "es", "fr", "el", "tr"]);
const ALL_LANGS = ["it", "en", "de", "es", "fr", "el", "tr"] as const;

const I18N_DIR = path.resolve(__dirname, "../../../lib/i18n");

function loadI18nFile(lang: string): Record<string, string> {
  const filePath = path.join(I18N_DIR, `${lang}.ts`);
  const content = fs.readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};
  const re = /"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const key = m[1];
    const rawVal = m[2];
    if (!key) continue;
    const value = rawVal
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    result[key] = value;
  }
  return result;
}

function derivePosition(key: string): string {
  const prefix = key.split(/[._]/)[0] ?? "";
  return prefix;
}

router.get("/table", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(translationKeys).orderBy(translationKeys.position, translationKeys.key);
    return res.json(rows);
  } catch (err) {
    console.error("[translations] GET /table error:", err);
    return sendError(res, 500, "Errore caricamento traduzioni");
  }
});

router.patch("/key", async (req: Request, res: Response) => {
  try {
    const parsed = translationKeySchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);

    const { key, lang, value } = parsed.data;

    if (!VALID_LANGS.has(lang)) {
      return sendError(res, 400, `Lingua non valida: ${lang}`);
    }

    const [updated] = await db
      .update(translationKeys)
      .set({ [lang]: value })
      .where(sql`${translationKeys.key} = ${key}`)
      .returning();

    if (!updated) return sendError(res, 404, `Chiave non trovata: ${key}`);

    return res.json(updated);
  } catch (err) {
    console.error("[translations] PATCH /key error:", err);
    return sendError(res, 500, "Errore salvataggio traduzione");
  }
});

router.post("/keys", async (req: Request, res: Response) => {
  try {
    const { key, position, it } = req.body as { key?: string; position?: string; it?: string };

    if (!key || typeof key !== "string" || !key.trim()) {
      return sendError(res, 400, "Il campo 'key' è obbligatorio");
    }
    if (!it || typeof it !== "string" || !it.trim()) {
      return sendError(res, 400, "Il valore italiano è obbligatorio");
    }

    const trimmedKey = key.trim();
    const trimmedPosition = (position ?? "").trim();
    const trimmedIt = it.trim();

    const [inserted] = await db
      .insert(translationKeys)
      .values({ key: trimmedKey, position: trimmedPosition, it: trimmedIt })
      .returning();

    return res.status(201).json(inserted);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return sendError(res, 409, "Chiave già esistente");
    }
    console.error("[translations] POST /keys error:", err);
    return sendError(res, 500, "Errore creazione chiave");
  }
});

router.delete("/keys/:key", async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    if (!key) return sendError(res, 400, "Chiave mancante");

    const [deleted] = await db
      .delete(translationKeys)
      .where(sql`${translationKeys.key} = ${key}`)
      .returning();

    if (!deleted) return sendError(res, 404, `Chiave non trovata: ${key}`);

    return res.json({ deleted: true, key: deleted.key });
  } catch (err) {
    console.error("[translations] DELETE /keys/:key error:", err);
    return sendError(res, 500, "Errore eliminazione chiave");
  }
});

router.post("/sync-from-files", async (_req: Request, res: Response) => {
  try {
    const langData: Record<string, Record<string, string>> = {};
    for (const lang of ALL_LANGS) {
      langData[lang] = loadI18nFile(lang);
    }

    const allKeys = [
      ...new Set(Object.values(langData).flatMap((d) => Object.keys(d))),
    ].sort();
    let inserted = 0;
    let updated = 0;

    const BATCH = 50;
    for (let i = 0; i < allKeys.length; i += BATCH) {
      const batch = allKeys.slice(i, i + BATCH);
      for (const key of batch) {
        const vals: Record<string, string> = {};
        for (const lang of ALL_LANGS) {
          vals[lang] = (langData[lang][key] ?? "").trim();
        }
        const position = derivePosition(key);

        const existing = await db
          .select()
          .from(translationKeys)
          .where(sql`${translationKeys.key} = ${key}`)
          .limit(1);

        if (existing.length === 0) {
          await db.insert(translationKeys).values({
            key,
            position,
            it: vals.it,
            en: vals.en,
            de: vals.de,
            es: vals.es,
            fr: vals.fr,
            el: vals.el,
            tr: vals.tr,
          });
          inserted++;
        } else {
          const row = existing[0];
          const keepPosition = row.position || position;
          const updateSet: Record<string, string> = { position: keepPosition };
          for (const lang of ALL_LANGS) {
            if (vals[lang]) {
              updateSet[lang] = vals[lang];
            } else {
              updateSet[lang] = (row[lang as keyof typeof row] as string) ?? "";
            }
          }
          await db
            .update(translationKeys)
            .set(updateSet)
            .where(sql`${translationKeys.key} = ${key}`);
          updated++;
        }
      }
    }

    console.log(`[translations] sync-from-files: ${inserted} inseriti, ${updated} aggiornati`);
    return res.json({
      ok: true,
      message: `Sincronizzazione completata: ${inserted} nuove chiavi, ${updated} aggiornate (totale ${allKeys.length})`,
      inserted,
      updated,
      total: allKeys.length,
    });
  } catch (err) {
    console.error("[translations] POST /sync-from-files error:", err);
    return sendError(res, 500, "Errore sincronizzazione da file");
  }
});

router.post("/ai-complete", async (req: Request, res: Response) => {
  const wantsStream = (req.headers.accept ?? "").includes("text/event-stream");

  if (wantsStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let aborted = false;
    const onAbort = () => { aborted = true; };
    // Task #43 — `res.on("close")`, mai `req.on("close")`: su Node 20 +
    // express.json() la IncomingMessage emette "close" (one-shot) non appena
    // il body della POST è stato consumato dal middleware, ben prima che
    // questo handler arrivi qui — un listener agganciato dopo non
    // scatterebbe mai sulla vera disconnessione del client. Vedi
    // .agents/memory/sse-abort-res-not-req.md.
    res.on("close", onAbort);

    const sseWrite = (event: string, data: unknown) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* connessione chiusa */ }
    };

    try {
      const result = await runAiCompletion({
        onStart: (info) => sseWrite("start", info),
        onBatch: (info) => sseWrite("batch", info),
        isAborted: () => aborted,
      });

      if (aborted || result.aborted) {
        try { res.end(); } catch { /* noop */ }
        return;
      }

      sseWrite("done", {
        ok: true,
        message: buildDoneMessage(result),
        summary: result.summary,
        totalProcessed: result.totalProcessed,
      });
    } catch (err) {
      const aiKeyMissing = err instanceof AiProviderUnavailableError;
      if (!aiKeyMissing) console.error("[translations] POST /ai-complete (SSE) error:", err);
      sseWrite("error", {
        message: aiKeyMissing
          ? (err as Error).message
          : "Errore completamento AI",
        aiKeyMissing,
      });
    } finally {
      try { res.end(); } catch { /* noop */ }
    }
    return;
  }

  try {
    const result = await runAiCompletion();
    return res.json({
      ok: true,
      message: buildDoneMessage(result),
      summary: result.summary,
    });
  } catch (err) {
    if (err instanceof AiProviderUnavailableError) {
      return sendError(res, 503, err.message);
    }
    console.error("[translations] POST /ai-complete error:", err);
    return sendError(res, 500, "Errore completamento AI");
  }
});

router.post("/apply-to-files", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(translationKeys).orderBy(translationKeys.key);

    const fileCounts: Record<string, number> = {};

    for (const lang of ALL_LANGS) {
      const filePath = path.join(I18N_DIR, `${lang}.ts`);
      const originalContent = fs.readFileSync(filePath, "utf8");

      const openBrace = originalContent.indexOf("{");
      const closeBrace = originalContent.lastIndexOf("};");
      if (openBrace === -1 || closeBrace === -1) {
        console.error(`[translations] apply-to-files: cannot find object bounds in ${lang}.ts`);
        continue;
      }

      const header = originalContent.slice(0, openBrace);
      const footer = originalContent.slice(closeBrace);

      const manualKeys = new Set<string>();
      const bodyLines = originalContent.slice(openBrace + 1, closeBrace).split("\n");
      let nextIsManual = false;
      const keyLineRe = /^\s*"([^"]+)":/;
      for (const bodyLine of bodyLines) {
        const trimmed = bodyLine.trim();
        if (trimmed === "// @manual") {
          nextIsManual = true;
        } else {
          const km = keyLineRe.exec(bodyLine);
          if (km) {
            if (nextIsManual) manualKeys.add(km[1]);
            nextIsManual = false;
          } else if (trimmed && !trimmed.startsWith("//")) {
            nextIsManual = false;
          }
        }
      }

      const lines: string[] = [];
      let count = 0;
      for (const row of rows) {
        const value = (row[lang as keyof typeof row] as string) ?? "";
        if (value.trim()) {
          const escaped = value
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r");
          if (manualKeys.has(row.key)) {
            lines.push(`  // @manual`);
          }
          lines.push(`  "${row.key}": "${escaped}",`);
          count++;
        }
      }

      const newContent = `${header}{\n${lines.join("\n")}\n${footer}`;
      fs.writeFileSync(filePath, newContent, "utf8");
      fileCounts[lang] = count;
    }

    const summary = ALL_LANGS.map((l) => `${l.toUpperCase()}: ${fileCounts[l] ?? 0}`).join(", ");
    console.log(`[translations] apply-to-files: ${summary} — riavvio in 1s`);

    res.json({
      ok: true,
      message: `File aggiornati (${summary}) — il backend si riavvierà automaticamente`,
      fileCounts,
    });

    setTimeout(() => {
      console.log("[translations] apply-to-files: processo terminato per reload i18n");
      process.exit(0);
    }, 1000);
  } catch (err) {
    console.error("[translations] POST /apply-to-files error:", err);
    return sendError(res, 500, "Errore scrittura file i18n");
  }
});

export async function seedTranslationKeys(): Promise<void> {
  const seed: Array<typeof translationKeys.$inferInsert> = [
    { key: "onboarding.welcome.title", position: "onboarding", it: "Benvenuto in BikerLink", en: "Welcome to BikerLink", de: "Willkommen bei BikerLink", es: "Bienvenido a BikerLink", fr: "Bienvenue sur BikerLink", el: "Καλώς ήρθατε στο BikerLink", tr: "BikerLink'e hoş geldiniz" },
    { key: "auth.login.title", position: "auth", it: "Accedi", en: "Sign In", de: "Anmelden", es: "Iniciar sesión", fr: "Se connecter", el: "Σύνδεση", tr: "Giriş Yap" },
    { key: "nav.home", position: "nav", it: "Home", en: "Home", de: "Startseite", es: "Inicio", fr: "Accueil", el: "Αρχική", tr: "Ana Sayfa" },
    { key: "common.save", position: "common", it: "Salva", en: "Save", de: "Speichern", es: "Guardar", fr: "Enregistrer", el: "Αποθήκευση", tr: "Kaydet" },
    { key: "common.cancel", position: "common", it: "Annulla", en: "Cancel", de: "Abbrechen", es: "Cancelar", fr: "Annuler", el: "Ακύρωση", tr: "İptal" },
  ];

  try {
    await db.insert(translationKeys).values(seed).onConflictDoNothing();
    console.log("[translations] Seed completato:", seed.length, "chiavi (o già presenti)");
  } catch (err) {
    console.error("[translations] Seed error:", err);
  }
}

export default router;
