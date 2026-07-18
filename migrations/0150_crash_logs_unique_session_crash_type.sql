-- Task #578 — Deduplica crash_system: converte l'indice plain (session_id, crash_type)
-- in un UNIQUE index su (user_id, session_id, crash_type) per far funzionare
-- onConflictDoNothing() lato server senza rischiare collisioni cross-user.
--
-- PERCHÉ 3 colonne: session_id può cadere al valore di fallback "unknown" quando
-- il client non riesce a generarlo. Un vincolo su sole (session_id, crash_type)
-- causerebbe la perdita di tutte le righe tranne la prima con ("unknown","crash_system")
-- anche se appartengono a utenti diversi. Aggiungendo user_id il vincolo è per-user.
--
-- Prima di creare il vincolo, elimina i duplicati già presenti (tieni il record
-- con la reportedAt più bassa per la tupla user_id+session_id+crash_type;
-- in caso di parità usa l'id lessicograficamente inferiore come tiebreaker).

DELETE FROM app_crash_logs
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, session_id, crash_type
        ORDER BY reported_at ASC, id ASC
      ) AS rn
    FROM app_crash_logs
  ) ranked
  WHERE rn > 1
);

DROP INDEX IF EXISTS "app_crash_logs_session_id_crash_type_idx";

CREATE UNIQUE INDEX "app_crash_logs_user_session_crash_type_uidx"
  ON "app_crash_logs" ("user_id", "session_id", "crash_type");
