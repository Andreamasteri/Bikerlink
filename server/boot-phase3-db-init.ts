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
    const client = await pool.connect();
    try {
      const idxCheck = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND tablename = 'embeddings'
             AND indexname = 'embeddings_vec_hnsw_cosine_idx'
         ) AS exists`,
      );
      const idxExists = idxCheck.rows[0]?.exists ?? false;
      if (!idxExists) {
        console.warn(
          "[boot] HNSW index 'embeddings_vec_hnsw_cosine_idx' mancante — tento self-heal con CREATE INDEX CONCURRENTLY...",
        );
        await client.query(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "embeddings_vec_hnsw_cosine_idx"
             ON "embeddings" USING hnsw ("embedding" vector_cosine_ops)`,
        );
        console.log("[boot] HNSW index creato con successo (self-heal)");
      } else {
        console.log("[boot] HNSW index verificato OK");
      }
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn(
      "[boot] HNSW index self-heal fallito (non-fatal) — findSimilar userà sequential scan alla prima chiamata:",
      e,
    );
  }

  try {
    const { storage } = await import("./storage");
    const [gmailUserSetting, gmailPassSetting] = await Promise.all([
      storage.getAppSetting("gmail_user"),
      storage.getAppSetting("gmail_app_password"),
    ]);
    const envUser = process.env.GMAIL_USER;
    const envPass = process.env.GMAIL_APP_PASSWORD;
    if (envUser && !gmailUserSetting?.value) {
      await storage.upsertAppSetting("gmail_user", envUser);
      console.log("[EMAIL BOOTSTRAP] gmail_user scritto in app_settings da secret env");
    }
    if (envPass && !gmailPassSetting?.value) {
      await storage.upsertAppSetting("gmail_app_password", envPass);
      console.log("[EMAIL BOOTSTRAP] gmail_app_password scritto in app_settings da secret env");
    }
    if (!envUser && !gmailUserSetting?.value) {
      console.warn("[EMAIL BOOTSTRAP] GMAIL_USER non trovato né in env né in DB — email non funzionerà");
    }
    if (!envPass && !gmailPassSetting?.value) {
      console.warn("[EMAIL BOOTSTRAP] GMAIL_APP_PASSWORD non trovato né in env né in DB — email non funzionerà");
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

  setImmediate(async () => {
    try {
      const { warmupAdImageCache } = await import("./routes/ads");
      await warmupAdImageCache();
    } catch (e) {
      console.warn("[INIT][BG] warmupAdImageCache error:", e);
    }
  });

  try {
    const { recordBootSignal } = await import("./ai/watchdog/restart-monitor");
    await recordBootSignal();
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
    const redisUrl = process.env.REDIS_URL ?? process.env.REDIS_URI;
    if (!redisUrl) {
      console.log("[boot] Redis: REDIS_URL non impostato — fallback in-memory attivo");
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
          console.log(`[boot] Redis: raggiungibile — ping ${ms}ms (${redisUrl.replace(/:[^:@]*@/, ":***@")})`);
        }
      } catch (redisErr) {
        console.warn(`[boot] Redis: NON raggiungibile (${(redisErr as Error).message}) — fallback in-memory attivo`);
      }
    }
  } catch (e) {
    console.warn("[INIT] Phase 3: Redis check failed (non-fatal):", e);
  }
}
