-- Garantisce che il vincolo UNIQUE su biker_zavorrina_matches esista su ogni
-- istanza DB (prod inclusa), indipendentemente da quando è stato creato il DB.
-- IF NOT EXISTS rende la migrazione idempotente: nessun errore se l'indice è
-- già presente (es. DB creati da 0000_baseline.sql che lo includeva già).
CREATE UNIQUE INDEX IF NOT EXISTS "matches_unique_combo_idx"
  ON "biker_zavorrina_matches" ("biker_id", "zavorrina_id", "biker_motorcycle_id", "wishlist_moto_id");
