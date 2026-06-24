-- Task #4818 — Pilota Business Reach (locali + concessionarie).
--
-- Entità "business" dedicata (type: locale | concessionaria), modellata su
-- workshops. I business approvati E attivi appaiono come marker sulla mappa
-- rider; le azioni del profilo (indicazioni/chiama/evento) sono tracciate come
-- click (segnale di conversione); i "passaggi qualificati" sono un aggregato
-- calcolato dalla telemetria entro un raggio configurabile.
--
-- Privacy: business_passage_stats contiene SOLO conteggi aggregati, mai tracce
-- individuali di rider. business_clicks tiene user_id solo per dedup/audit
-- interno (set null alla cancellazione utente) e non è mai esposto nei report.

CREATE TABLE IF NOT EXISTS "businesses" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" varchar(20) NOT NULL DEFAULT 'locale',
  "name" varchar(200) NOT NULL,
  "address" text,
  "latitude" double precision,
  "longitude" double precision,
  "phone" varchar(30),
  "whatsapp" varchar(30),
  "email" varchar(255),
  "website" text,
  "description" text,
  "promo_text" text,
  "event_url" text,
  "opening_hours" jsonb,
  "logo_url" text,
  "is_approved" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "businesses_location_idx" ON "businesses" ("latitude", "longitude");
CREATE INDEX IF NOT EXISTS "businesses_type_idx" ON "businesses" ("type");

CREATE TABLE IF NOT EXISTS "business_clicks" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" varchar(36) NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "action_type" varchar(20) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "business_clicks_business_id_idx" ON "business_clicks" ("business_id");
CREATE INDEX IF NOT EXISTS "business_clicks_created_at_idx" ON "business_clicks" ("created_at");

CREATE TABLE IF NOT EXISTS "business_passage_stats" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" varchar(36) NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "period_month" varchar(7) NOT NULL,
  "qualified_passages" integer NOT NULL DEFAULT 0,
  "unique_riders" integer NOT NULL DEFAULT 0,
  "radius_m" integer NOT NULL DEFAULT 0,
  "computed_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_passage_stats_business_period_idx"
  ON "business_passage_stats" ("business_id", "period_month");
