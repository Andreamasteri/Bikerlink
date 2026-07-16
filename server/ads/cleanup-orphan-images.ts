// Modulo riusabile per la pulizia delle immagini pubblicitarie orfane su
// Object Storage (public/ads/). Estratto da scripts/cleanup-orphan-ad-images.ts
// così da poter essere richiamato sia dallo script una-tantum sia dal job
// periodico del watchdog (campaigns-self-check).
//
// Logica:
//  1. Elenca tutti i file sotto public/ads/ nel bucket.
//  2. Recupera tutte le campagne dal DB ed estrae i filename referenziati.
//  3. Elimina ogni file NON referenziato da nessuna campagna.
//
// SAFETY GUARD: se non ci sono filename referenziati (0 campagne con immagine)
// ma esistono file orfani, la sweep viene saltata. Un set di riferimenti vuoto
// è quasi sempre un blip temporaneo del DB: meglio lasciare qualche orfano che
// cancellare immagini reali irrecuperabili.

import { listObjects, deleteObject, BUCKET_CAMPAIGN } from "../objectStorage";
import { storage } from "../storage";

export interface OrphanCleanupResult {
  /** File totali trovati sotto public/ads/. */
  scanned: number;
  /** Filename referenziati da almeno una campagna nel DB. */
  referenced: number;
  /** File orfani (non referenziati) individuati. */
  orphans: number;
  /** File orfani effettivamente eliminati. */
  deleted: number;
  /** Errori durante l'eliminazione. */
  errors: number;
  /** True se la sweep è stata saltata dal safety guard (possibile blip DB). */
  skipped: boolean;
  /** True se eseguito in dry-run (nessuna eliminazione effettiva). */
  dryRun: boolean;
  /** Eventuale motivo dello skip (per logging/diagnostica). */
  reason?: string;
}

export interface OrphanCleanupOpts {
  /** Se true, non elimina nulla: calcola soltanto cosa verrebbe rimosso. */
  dryRun?: boolean;
  /** Logger opzionale (default: nessun log). Usato per output verboso. */
  log?: (msg: string) => void;
}

// Both the canonical new prefix and the legacy prefix are swept so that objects
// uploaded before and after the bucket-folder migration are managed consistently.
const PREFIXES = [BUCKET_CAMPAIGN, "public/ads/"] as const;

export async function cleanupOrphanAdImages(
  opts: OrphanCleanupOpts = {},
): Promise<OrphanCleanupResult> {
  const dryRun = opts.dryRun ?? false;
  const log = opts.log ?? (() => {});

  // 1. Lista tutti gli oggetti in entrambi i prefissi (Campaign/ads/ + public/ads/)
  const fileLists = await Promise.all(PREFIXES.map((p) => listObjects(p)));
  const files = fileLists.flat();
  log(`${files.length} file trovati (${PREFIXES.join(", ")})`);
  if (files.length === 0) {
    return { scanned: 0, referenced: 0, orphans: 0, deleted: 0, errors: 0, skipped: false, dryRun };
  }

  // 2. Recupera tutte le campagne dal DB ed estrai i filename referenziati
  //    (formato imageUrl: /api/ads/images/<filename>).
  const campaigns = await storage.getAllCampaigns();
  log(`${campaigns.length} campagne nel DB`);

  const referenced = new Set<string>();
  for (const c of campaigns) {
    if (!c.imageUrl) continue;
    const m = c.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
    const filename = m?.[1];
    if (filename && !filename.includes("..") && !filename.includes("/")) {
      referenced.add(filename);
    }
  }
  log(`${referenced.size} filename referenziati da campagne`);

  // 3. Identifica gli orfani. Ignora le sub-prefix (file con "/" dopo il prefix).
  const orphans = files.filter((f) => {
    const prefix = PREFIXES.find((p) => f.name.startsWith(p)) ?? PREFIXES[1];
    const filename = f.name.slice(prefix.length);
    return !!filename && !filename.includes("/") && !referenced.has(filename);
  });
  log(`${orphans.length} file orfani trovati`);

  // SAFETY GUARD: 0 riferimenti + orfani presenti = probabile blip DB → skip.
  if (referenced.size === 0 && orphans.length > 0) {
    const reason =
      `0 campagne con immagine nel DB ma ${orphans.length} file orfani: ` +
      `possibile blip DB temporaneo, sweep saltata per sicurezza.`;
    log(reason);
    return {
      scanned: files.length,
      referenced: 0,
      orphans: orphans.length,
      deleted: 0,
      errors: 0,
      skipped: true,
      dryRun,
      reason,
    };
  }

  // 4. Elimina gli orfani (salvo dry-run).
  let deleted = 0;
  let errors = 0;
  for (const f of orphans) {
    if (dryRun) {
      log(`[DRY-RUN] eliminerei: ${f.name} (${f.size} byte, creato ${f.createdTime})`);
      continue;
    }
    try {
      await deleteObject(f.name);
      deleted++;
      log(`eliminato: ${f.name}`);
    } catch (e) {
      errors++;
      log(`ERRORE eliminando ${f.name}: ${(e as Error)?.message}`);
    }
  }

  return {
    scanned: files.length,
    referenced: referenced.size,
    orphans: orphans.length,
    deleted,
    errors,
    skipped: false,
    dryRun,
  };
}
