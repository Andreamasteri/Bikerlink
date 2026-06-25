-- Task #4942 — Parte D: "cestino" campagne (ghosting invece di delete).
--
-- Quando warmupAdImageCache non riesce a recuperare l'immagine di una campagna
-- da Object Storage (né da public/ads/ né dal backup .private/ads-backup/), la
-- campagna viene marcata con ghosted_at = NOW() anziché lasciata a ri-fallire a
-- ogni boot. Tutte le query di serving/warmup/conteggio filtrano
-- ghosted_at IS NULL; solo il pannello admin "Segnalate dal sistema" legge le
-- campagne con ghosted_at IS NOT NULL e offre il pulsante "Ripristina"
-- (ghosted_at = NULL).
--
-- nullable: NULL = campagna normale (default). Nessun backfill necessario.

ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "ghosted_at" timestamp;
