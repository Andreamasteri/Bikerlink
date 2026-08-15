import { db, pool } from "./db";
import { sql } from "drizzle-orm";

export async function runBootPhase3DbInit(): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      console.log("[boot] pgvector extension ensured");
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[boot] pgvector extension ensure failed (non-fatal) — findSimilar userà full-scan:", e);
  }

  try {
    // Reuse the same self-heal logic exposed to the Admin panel
    // (POST /api/admin/embeddings/hnsw-rebuild). CONCURRENTLY never takes an
    // exclusive lock so findSimilar keeps working during the build.
    const { rebuildHnswIndex } = await import("./embeddings");
    const { action } = await rebuildHnswIndex();
    if (action === "created") {
      console.log("[boot] HNSW self-heal: index mancante creato con successo");
    } else if (action === "rebuilt") {
      console.log("[boot] HNSW self-heal: index invalido rimosso e ricreato con successo");
    } else {
      console.log("[boot] HNSW index verificato OK (exists=true, valid=true)");
    }
  } catch (e) {
    console.warn(
      "[boot] HNSW index self-heal fallito (non-fatal) — findSimilar userà sequential scan alla prima chiamata:",
      e,
    );
  }

  try {
    // SMTP credentials are read ONLY from env (process.env.GMAIL_USER /
    // GMAIL_APP_PASSWORD). Non si scrivono più in app_settings: i segreti nel DB
    // operativo allargano la superficie di esposizione. Qui ci limitiamo a
    // confermare la presenza delle env (senza stamparne il valore) e a
    // verificare l'auth SMTP in background.
    const envUser = process.env.GMAIL_USER;
    const envPass = process.env.GMAIL_APP_PASSWORD;
    if (envUser && envPass) {
      console.log("[EMAIL BOOTSTRAP] credenziali Gmail presenti in env (GMAIL_USER/GMAIL_APP_PASSWORD)");
    } else {
      if (!envUser) console.warn("[EMAIL BOOTSTRAP] GMAIL_USER non trovato in env — email non funzionerà");
      if (!envPass) console.warn("[EMAIL BOOTSTRAP] GMAIL_APP_PASSWORD non trovato in env — email non funzionerà");
    }
    // One-time cleanup: purge legacy SMTP secrets persisted by older builds.
    // Le credenziali ora vivono SOLO nelle env; eventuali righe residue in
    // app_settings sono segreti nel DB operativo e vanno rimosse (idempotente).
    try {
      const purged = await db.execute(
        sql`DELETE FROM app_settings WHERE key IN ('gmail_user', 'gmail_app_password')`,
      );
      const removed = (purged as { rowCount?: number }).rowCount ?? 0;
      if (removed > 0) {
        console.log(`[EMAIL BOOTSTRAP] rimosse ${removed} credenziali SMTP legacy da app_settings (ora env-only)`);
      }
    } catch (e) {
      console.warn("[EMAIL BOOTSTRAP] cleanup credenziali SMTP legacy fallito (non-fatale):", e);
    }
    setImmediate(async () => {
      try {
        const { createTransporter, maskEmail } = await import("./email/templates");
        const t = await createTransporter();
        if (!t) {
          console.warn("[EMAIL] ⚠️  SMTP verify skipped — credenziali non configurate");
          return;
        }
        await t.transporter.verify();
        console.log(`[EMAIL] ✅ Credenziali Gmail OK — SMTP auth verificata (${maskEmail(t.creds.user)}, source=${t.creds.source})`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[EMAIL] ⚠️  CREDENZIALI GMAIL NON VALIDE — verifica SMTP fallita, controllare GMAIL_APP_PASSWORD. Errore: ${msg.slice(0, 120)}`);
      }
    });
  } catch (e) {
    console.warn("[INIT] Phase 3: email bootstrap failed (non-fatal):", e);
  }

  try {
    const { storage: apkStorage } = await import("./storage");
    const apkSetting = await apkStorage.getAppSetting("apk_download_url");
    const APK_DRIVE_URL = "https://drive.google.com/uc?export=download&id=15teG0lCIWFi6YuXtcfIMPjuWcctPc5cH";
    if (!apkSetting?.value?.trim()) {
      await apkStorage.upsertAppSetting("apk_download_url", APK_DRIVE_URL);
      console.log("[APK BOOTSTRAP] apk_download_url scritto in app_settings");
    } else {
      console.log("[APK BOOTSTRAP] apk_download_url già presente in app_settings — nessuna modifica");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: APK URL bootstrap failed (non-fatal):", e);
  }

  try {
    const { storage: supportStorage } = await import("./storage");
    const [supportEmailSetting, supportWhatsappSetting] = await Promise.all([
      supportStorage.getAppSetting("support_email"),
      supportStorage.getAppSetting("support_whatsapp"),
    ]);
    if (!supportEmailSetting) {
      await supportStorage.upsertAppSetting("support_email", "bikerlinkapp@gmail.com");
      console.log("[SUPPORT BOOTSTRAP] support_email impostato al default");
    }
    if (!supportWhatsappSetting) {
      await supportStorage.upsertAppSetting("support_whatsapp", "");
      console.log("[SUPPORT BOOTSTRAP] support_whatsapp inizializzato vuoto");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: support settings bootstrap failed (non-fatal):", e);
  }

  try {
    // Task #4548 — registra le chiavi configurabili del BioAffinity matcher così
    // che siano visibili e modificabili dal pannello Admin senza deploy. Scrive
    // solo i default mancanti: non sovrascrive eventuali valori già impostati.
    const { storage: bioStorage } = await import("./storage");
    const bioDefaults: { key: string; value: string }[] = [
      { key: "bio_affinity_budget_ms", value: "75000" },
      { key: "bio_affinity_top_k", value: "10" },
      { key: "bio_affinity_threshold", value: "0.65" },
      { key: "bio_affinity_batch_size", value: "0" },
      { key: "bio_affinity_require_hnsw", value: "false" },
      { key: "bio_affinity_cursor_user_id", value: "" },
    ];
    for (const d of bioDefaults) {
      const existing = await bioStorage.getAppSetting(d.key);
      if (existing === undefined) {
        await bioStorage.upsertAppSetting(d.key, d.value);
        console.log(`[BIOAFFINITY BOOTSTRAP] ${d.key} impostato al default "${d.value}"`);
      }
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: BioAffinity settings bootstrap failed (non-fatal):", e);
  }

  try {
    // Task #164 — seed idempotente dei default routing engine (routing → AI mode,
    // map_matching → Valhalla). Pattern get-then-skip: se la riga esiste già
    // (override admin), NON viene toccata — il seed scrive solo su DB vuoto.
    const { storage: routingStorage } = await import("./storage");
    const { ROUTING_FUNCTION_ENGINES_KEY } = await import("@shared/routing-functions");
    const existing = await routingStorage.getAppSetting(ROUTING_FUNCTION_ENGINES_KEY);
    if (!existing) {
      await routingStorage.upsertAppSetting(ROUTING_FUNCTION_ENGINES_KEY, undefined, {
        routing: "ai",
        map_matching: "valhalla",
      });
      console.log('[ROUTING BOOTSTRAP] routing_function_engines seminato ai default (routing="ai", map_matching="valhalla")');
    } else {
      console.log("[ROUTING BOOTSTRAP] routing_function_engines già presente — nessuna modifica (override admin preservati)");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: routing engine defaults bootstrap failed (non-fatal):", e);
  }

  try {
    // Task #574 — seed idempotente di horus_think_enabled (default "true"):
    // think:true è il default stabilito da Task #573 per tutti i callsite Horus
    // non-streaming. Il flag è modificabile a runtime con /think on|off dalla
    // chat admin Horus. Non sovrascriviamo se esiste già (override admin preservato).
    const { storage: thinkStorage } = await import("./storage");
    const existingThink = await thinkStorage.getAppSetting("horus_think_enabled");
    if (existingThink === undefined) {
      await thinkStorage.upsertAppSetting(
        "horus_think_enabled",
        "true",
        undefined,
        // check-horus-think-hardcoded: safe — descrizione AppSetting visibile all'admin, non un callsite Ollama
        "Ragionamento esplicito di Horus (think:true). Modificabile con /think on|off dalla chat admin.",
      );
      console.log("[HORUS BOOTSTRAP] horus_think_enabled inizializzato a true");
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: horus_think_enabled bootstrap failed (non-fatal):", e);
  }

  try {
    const { initProviderHealth } = await import("./ai/moderation/provider");
    await initProviderHealth();
  } catch (e) {
    console.warn("[INIT] Phase 3: initProviderHealth failed (non-fatal):", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "maps_telemetry_events" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar(36),
        "event" varchar(40) NOT NULL,
        "renderer" varchar(30),
        "component" varchar(60),
        "engine" varchar(30),
        "duration_ms" integer,
        "error_message" varchar(500),
        "platform" varchar(20),
        "app_version" varchar(30),
        "details" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "maps_telemetry_event_created_idx"
        ON "maps_telemetry_events" ("event", "created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "maps_telemetry_renderer_created_idx"
        ON "maps_telemetry_events" ("renderer", "created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "maps_telemetry_created_idx"
        ON "maps_telemetry_events" ("created_at")
    `);
    console.log("[INIT] maps_telemetry_events: table/index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: maps_telemetry_events ensure failed (non-fatal):", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "app_crash_logs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar(36) NOT NULL,
        "session_id" varchar(64) NOT NULL,
        "crash_type" varchar(20) NOT NULL,
        "app_version" varchar(32),
        "platform" varchar(16),
        "os_version" varchar(50),
        "device_model" varchar(100),
        "device_brand" varchar(100),
        "total_memory_mb" integer,
        "error_message" text,
        "stack_trace" text,
        "session_started_at" timestamp,
        "session_ended_at" timestamp,
        "reported_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "app_crash_logs_user_id_idx"
        ON "app_crash_logs" ("user_id")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "app_crash_logs_crash_type_idx"
        ON "app_crash_logs" ("crash_type")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "app_crash_logs_reported_at_idx"
        ON "app_crash_logs" ("reported_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "app_crash_logs_session_id_crash_type_idx"
        ON "app_crash_logs" ("session_id", "crash_type")
    `);
    console.log("[INIT] app_crash_logs: table/index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: app_crash_logs ensure failed (non-fatal):", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "system_signals" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        "source" varchar(40) NOT NULL,
        "metric" varchar(80) NOT NULL,
        "value" double precision,
        "unit" varchar(20),
        "severity" varchar(10) NOT NULL DEFAULT 'info',
        "details" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "system_signals_source_metric_idx"
        ON "system_signals" ("source", "metric")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "system_signals_created_idx"
        ON "system_signals" ("created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "system_signals_severity_created_idx"
        ON "system_signals" ("severity", "created_at")
    `);
    console.log("[INIT] system_signals: table/index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: system_signals ensure failed (non-fatal):", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "ai_watchdog_log" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_key" varchar(180) NOT NULL,
        "kind" varchar(30) NOT NULL,
        "scope" varchar(60),
        "status" varchar(20) NOT NULL DEFAULT 'ok',
        "summary" text,
        "details" jsonb,
        "proposal_id" varchar(36),
        "accepted_by_admin_id" varchar(36),
        "accepted_at" timestamp,
        "rejected_by_admin_id" varchar(36),
        "rejected_at" timestamp,
        "reject_reason" varchar(300),
        "cost_usd" double precision NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "ai_watchdog_log_kind_idx"
        ON "ai_watchdog_log" ("kind")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "ai_watchdog_log_status_idx"
        ON "ai_watchdog_log" ("status")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "ai_watchdog_log_created_idx"
        ON "ai_watchdog_log" ("created_at")
    `);
    await db.execute(sql`
      ALTER TABLE "ai_watchdog_log"
        ADD COLUMN IF NOT EXISTS "event_key" varchar(180)
    `);
    await db.execute(sql`
      UPDATE "ai_watchdog_log"
      SET "event_key" = LEFT("kind" || ':' || COALESCE("scope", 'global'), 180)
      WHERE "event_key" IS NULL
    `);
    await db.execute(sql`
      ALTER TABLE "ai_watchdog_log"
        ALTER COLUMN "event_key" SET NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "ai_watchdog_log_event_created_idx"
        ON "ai_watchdog_log" ("event_key", "created_at", "id")
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "ai_watchdog_event_state" (
        "event_key" varchar(180) PRIMARY KEY,
        "last_status" varchar(20) NOT NULL,
        "last_log_id" varchar(36),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "ai_watchdog_event_state_updated_idx"
        ON "ai_watchdog_event_state" ("updated_at")
    `);
    console.log("[INIT] ai_watchdog_log/event_state: table/index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: ai_watchdog_log ensure failed (non-fatal):", e);
  }

  setImmediate(async () => {
    try {
      const { warmupAdImageCache } = await import("./routes/ads");
      await warmupAdImageCache();
    } catch (e) {
      console.warn("[INIT][BG] warmupAdImageCache error:", e);
    }
  });

  try {
    const { recordBootSignal, checkAndAlertDbSlowBoot } = await import("./ai/watchdog/restart-monitor");
    await recordBootSignal();
    // Se il backoff anti crash-loop è scattato ≥N volte di fila (DB managed lento
    // al boot), allerta gli admin. Throttlato internamente per non spammare.
    await checkAndAlertDbSlowBoot();
  } catch (e) {
    console.warn("[INIT] Phase 3: recordBootSignal failed (non-fatal):", e);
  }

  try {
    type CrashRow = { crash_type: string | null; error_prefix: string | null; app_version: string | null; count: string };
    const crashResult = await db.execute<CrashRow>(sql`
      SELECT
        crash_type,
        SUBSTRING(error_message, 1, 100) AS error_prefix,
        app_version,
        COUNT(*) AS count
      FROM app_crash_logs
      WHERE reported_at >= NOW() - INTERVAL '7 days'
      GROUP BY crash_type, SUBSTRING(error_message, 1, 100), app_version
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);
    const rows = (crashResult as { rows?: CrashRow[] }).rows ?? [];
    if (rows.length === 0) {
      console.log("[boot/crash-analysis] Nessun crash log negli ultimi 7 giorni");
    } else {
      const total = rows.reduce((s, r) => s + Number(r.count), 0);
      console.log(`[boot/crash-analysis] Top crash pattern (7gg, ${total} eventi totali):`);
      for (const r of rows) {
        console.log(
          `[boot/crash-analysis]   type=${r.crash_type ?? "?"} v=${r.app_version ?? "?"} n=${r.count} msg="${r.error_prefix ?? ""}"`
        );
      }
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: crash-analysis failed (non-fatal):", (e as Error).message);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "notification_history" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar(36),
        "notification_type" varchar(60) NOT NULL DEFAULT 'unknown',
        "token" text,
        "status" varchar(20) NOT NULL DEFAULT 'sent',
        "error_message" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "notification_history_created_at_idx"
        ON "notification_history" ("created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "notification_history_status_created_idx"
        ON "notification_history" ("status", "created_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "notification_history_user_id_idx"
        ON "notification_history" ("user_id")
    `);
    console.log("[INIT] notification_history: table/index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: notification_history ensure failed (non-fatal):", e);
  }

  try {
    // Task #4436: indice parziale composito per la GET /api/road-hazards.
    // Copre il where attivo (deleted_at IS NULL, expires_at, is_approved) così
    // il bounding-box scansiona pochi record invece di filtrare in JS — la query
    // passa da >2s a millisecondi.
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "road_hazards_active_idx"
        ON "road_hazards" ("is_approved", "expires_at", "lat", "lng")
        WHERE "deleted_at" IS NULL
    `);
    console.log("[INIT] road_hazards_active_idx: index check OK");
  } catch (e) {
    console.warn("[INIT] Phase 3: road_hazards_active_idx ensure failed (non-fatal):", e);
  }

  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.log("[boot] DragonflyDB: REDIS_URL non impostato — fallback in-memory attivo");
    } else {
      try {
        const ioredis = await import("ioredis").catch(() => null);
        if (ioredis) {
          const Redis = (ioredis as { default?: unknown }).default ?? ioredis;
          const RedisCtor = Redis as unknown as { new (url: string, opts?: unknown): { ping: () => Promise<string>; quit: () => Promise<unknown> } };
          const client = new RedisCtor(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
          const t0 = Date.now();
          await client.ping();
          const ms = Date.now() - t0;
          await client.quit().catch(() => {});
          console.log(`[boot] DragonflyDB VPS: raggiungibile — ping ${ms}ms (${redisUrl.replace(/:[^:@]*@/, ":***@")})`);
        }
      } catch (dragonflyErr) {
        console.warn(`[boot] DragonflyDB VPS: NON raggiungibile (${(dragonflyErr as Error).message}) — fallback in-memory attivo`);
      }
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: DragonflyDB check failed (non-fatal):", e);
  }
}
