-- Task #5273 — Token push per-app / per-dispositivo.
--
-- Prima esisteva un solo slot `users.expoPushToken`. La Bowie Terminal (APK
-- separato, bundle com.bikerlink.bowieterminal) logga sullo STESSO account e
-- sovrascriveva quel campo: l'ultima app installata rubava le notifiche
-- all'altra. Questa tabella scinde i token per `app_id` (es. 'main' | 'bowie')
-- così ogni app riceve le proprie push.
--
-- Il token Expo è unico per installazione → lo usiamo come chiave naturale per
-- l'upsert (UNIQUE su token). Il comportamento dell'app principale resta
-- invariato: continua a scrivere users.expoPushToken (Phase-legacy) e in più
-- registra qui la riga app_id='main'.
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app_id" varchar(32) NOT NULL DEFAULT 'main',
  "device_id" varchar(128),
  "token" text NOT NULL,
  "platform" varchar(16),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_uq" ON "push_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_user_id_idx" ON "push_tokens" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_user_app_idx" ON "push_tokens" ("user_id", "app_id");
