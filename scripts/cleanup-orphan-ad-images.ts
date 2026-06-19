/**
 * Pulizia una-tantum delle immagini campagna orfane su Object Storage.
 *
 * La logica vive ora in server/ads/cleanup-orphan-images.ts (modulo riusabile
 * condiviso col job periodico del watchdog). Questo script è solo un wrapper CLI.
 *
 * Esecuzione:
 *   npx tsx scripts/cleanup-orphan-ad-images.ts
 *
 * Flag:
 *   --dry-run   Stampa cosa verrebbe eliminato senza toccare nulla (default: false).
 */

import { cleanupOrphanAdImages } from "../server/ads/cleanup-orphan-images";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  console.log(`[cleanup-orphan-ad-images] avvio (dry-run=${DRY_RUN})`);

  const result = await cleanupOrphanAdImages({
    dryRun: DRY_RUN,
    log: (msg) => console.log(`[cleanup-orphan-ad-images] ${msg}`),
  });

  if (result.skipped) {
    console.warn(`[cleanup-orphan-ad-images] sweep SALTATA: ${result.reason}`);
    return;
  }

  if (DRY_RUN) {
    console.log(`[cleanup-orphan-ad-images] dry-run completato: ${result.orphans} file sarebbero eliminati.`);
  } else {
    console.log(`[cleanup-orphan-ad-images] completato: ${result.deleted} eliminati, ${result.errors} errori.`);
    if (result.errors > 0) process.exit(1);
  }
}

main().catch((e) => {
  console.error("[cleanup-orphan-ad-images] errore fatale:", e);
  process.exit(1);
});
