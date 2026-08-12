// Task #5334 — Retention delle immagini caricate in chat con l'AI Assistant
// (Bowie). Ogni immagine inviata da un rider viene salvata su object storage
// sotto private/assistant-images/<ts-rand.ext> (server/routes/ai-assistant-images.ts)
// e non veniva mai rimossa: crescita illimitata (costo storage + clutter).
//
// Segue lo stesso pattern degli altri job di retention (log-retention.ts):
// finestra configurabile via AppSetting (default 30gg), eseguito sullo stesso
// ciclo schedulato ogni 5 giorni del log retention job.
//
// A differenza delle righe DB, qui non c'è una colonna "createdAt" da
// interrogare: object storage espone createdTime per singolo file, quindi la
// pulizia lista il prefix ed elimina i file più vecchi della soglia.
import { listObjects, deleteObject } from "../objectStorage";
import { storage } from "../storage";

const PREFIX = "private/assistant-images/";
const RETENTION_KEY = "assistant_images_retention_days";
const DEFAULT_RETENTION_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function getRetentionDays(): Promise<number> {
  try {
    const setting = await storage.getAppSetting(RETENTION_KEY);
    if (setting?.value) {
      const parsed = parseInt(setting.value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // usa il default
  }
  return DEFAULT_RETENTION_DAYS;
}

export async function purgeOldAssistantImages(): Promise<number> {
  const retentionDays = await getRetentionDays();
  const cutoff = Date.now() - retentionDays * ONE_DAY_MS;

  let files;
  try {
    files = await listObjects(PREFIX);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/R2_ENDPOINT|R2_PUBLIC_BASE_URL|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/.test(message)) {
      console.info("[ASSISTANT-IMAGES-RETENTION] R2 non configurato — retention immagini disabilitata in questo ambiente");
    } else {
      console.warn("[ASSISTANT-IMAGES-RETENTION] Errore listObjects:", err);
    }
    return 0;
  }

  const stale = files.filter((f) => {
    const t = Date.parse(f.createdTime);
    return !isNaN(t) && t < cutoff;
  });

  if (stale.length === 0) return 0;

  let deleted = 0;
  for (const f of stale) {
    try {
      await deleteObject(f.name);
      deleted++;
    } catch (err) {
      console.warn(`[ASSISTANT-IMAGES-RETENTION] Errore eliminando ${f.name}:`, err);
    }
  }

  console.log(
    `[ASSISTANT-IMAGES-RETENTION] Rimosse ${deleted}/${stale.length} immagini più vecchie di ${retentionDays}gg`,
  );
  return deleted;
}
