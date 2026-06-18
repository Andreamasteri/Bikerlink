/**
 * Pulizia una-tantum delle immagini campagna orfane su Object Storage.
 *
 * Logica:
 *  1. Elenca tutti i file sotto public/ads/ nel bucket.
 *  2. Recupera tutte le campagne dal DB ed estrae i filename referenziati.
 *  3. Elimina ogni file NON referenziato da nessuna campagna.
 *
 * Esecuzione:
 *   npx tsx scripts/cleanup-orphan-ad-images.ts
 *
 * Flag:
 *   --dry-run   Stampa cosa verrebbe eliminato senza toccare nulla (default: false).
 */

import { listObjects, deleteObject } from "../server/objectStorage";
import { storage } from "../server/storage";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  console.log(`[cleanup-orphan-ad-images] avvio (dry-run=${DRY_RUN})`);

  // 1. Lista tutti gli oggetti in public/ads/
  const files = await listObjects("public/ads/");
  console.log(`[cleanup-orphan-ad-images] ${files.length} file trovati in public/ads/`);
  if (files.length === 0) {
    console.log("[cleanup-orphan-ad-images] nessun file da verificare — uscita.");
    return;
  }

  // 2. Recupera tutte le campagne dal DB
  const campaigns = await storage.getAllCampaigns();
  console.log(`[cleanup-orphan-ad-images] ${campaigns.length} campagne nel DB`);

  // Estrai i filename referenziati (formato imageUrl: /api/ads/images/<filename>)
  const referenced = new Set<string>();
  for (const c of campaigns) {
    if (!c.imageUrl) continue;
    const m = c.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
    if (m?.[1]) {
      referenced.add(m[1]);
    }
  }
  console.log(`[cleanup-orphan-ad-images] ${referenced.size} filename referenziati da campagne`);

  // 3. Identifica gli orfani
  // File in bucket: name = "public/ads/<filename>" (path completo)
  const orphans = files.filter((f) => {
    const filename = f.name.replace(/^public\/ads\//, "");
    return !referenced.has(filename);
  });

  console.log(`[cleanup-orphan-ad-images] ${orphans.length} file orfani trovati`);
  if (orphans.length === 0) {
    console.log("[cleanup-orphan-ad-images] nessun orfano — bucket già pulito.");
    return;
  }

  // 4. Elimina gli orfani
  let deleted = 0;
  let errors = 0;
  for (const f of orphans) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] eliminerei: ${f.name} (${f.size} byte, creato ${f.createdTime})`);
    } else {
      try {
        await deleteObject(f.name);
        console.log(`  eliminato: ${f.name}`);
        deleted++;
      } catch (e) {
        console.error(`  ERRORE eliminando ${f.name}:`, (e as Error)?.message);
        errors++;
      }
    }
  }

  if (DRY_RUN) {
    console.log(`[cleanup-orphan-ad-images] dry-run completato: ${orphans.length} file sarebbero eliminati.`);
  } else {
    console.log(`[cleanup-orphan-ad-images] completato: ${deleted} eliminati, ${errors} errori.`);
    if (errors > 0) process.exit(1);
  }
}

main().catch((e) => {
  console.error("[cleanup-orphan-ad-images] errore fatale:", e);
  process.exit(1);
});
