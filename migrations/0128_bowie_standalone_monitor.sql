-- Task #5228 — Bowie Standalone monitor.
--
-- 1) Estende ai_call_logs con l'attribuzione necessaria al monitor del client
--    "Bowie Terminal" (APK standalone):
--      persona             → quale AI ha risposto (bowie/horus/ares).
--      source_app          → quale client ha originato la chiamata
--                            (main_app | bowie_terminal).
--      notification_status → esito della consegna push per le risposte inviate
--                            via /notification-reply (delivered | failed). NULL
--                            sui turni normali; usato per non contarli due volte.
--    Tutte nullable: le righe storiche restano NULL, nessun backfill.
--
-- 2) Crea bowie_terminal_tokens: registro per-dispositivo dei push token del
--    terminale standalone (elenco device, attivi/revocati) separato da
--    users.expoPushToken così l'admin può revocare un singolo device senza
--    toccare il token di consegna principale.

ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "persona" varchar(16);
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "source_app" varchar(32);
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "notification_status" varchar(16);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_call_logs_source_app_idx" ON "ai_call_logs" ("source_app");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bowie_terminal_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "device_id" varchar(128) NOT NULL,
        "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "push_token" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "last_active_at" timestamp DEFAULT now() NOT NULL,
        "revoked_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bowie_terminal_tokens_device_id_key" ON "bowie_terminal_tokens" ("device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bowie_terminal_tokens_user_id_idx" ON "bowie_terminal_tokens" ("user_id");
