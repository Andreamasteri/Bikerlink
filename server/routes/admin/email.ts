import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
import { sendEmailDetailed, getEmailDiagnostics } from "../../email";
import { getBaseTemplate, getEmailCredentials } from "../../email/templates";
import {
  verifyEmailStore,
  resendVerificationStore,
  verifyAttempts,
  VERIFY_EMAIL_WINDOW_MS,
  VERIFY_EMAIL_MAX,
  RESEND_VERIFICATION_WINDOW_MS,
  RESEND_VERIFICATION_MAX,
  VERIFY_MAX_ATTEMPTS,
  VERIFY_ATTEMPT_WINDOW_MS,
} from "../auth/register";

const router = Router();

// Task #56 — Osservabilità email: stato diagnostico, rate limiter e invio di test.

interface RateLimitEntry {
  ip: string;
  count: number;
  resetAt: string | null;
}

type StoreClient = { totalHits?: number; resetTime?: Date | number };

/**
 * Estrae le entry attive da un MemoryStore di express-rate-limit leggendo la mappa
 * `current` (clienti che hanno colpito l'endpoint nella finestra corrente).
 */
function readStoreEntries(store: unknown): RateLimitEntry[] {
  const current = (store as { current?: Map<string, StoreClient> })?.current;
  if (!current || typeof current.forEach !== "function") return [];
  const out: RateLimitEntry[] = [];
  current.forEach((client, key) => {
    const hits = client?.totalHits ?? 0;
    if (hits <= 0) return;
    let resetAt: string | null = null;
    const rt = client?.resetTime;
    if (rt instanceof Date) resetAt = rt.toISOString();
    else if (typeof rt === "number") resetAt = new Date(rt).toISOString();
    out.push({ ip: key, count: hits, resetAt });
  });
  return out;
}

// GET /api/admin/email-status — diagnostica credenziali + esito ultimo invio reale.
router.get("/email-status", async (_req: Request, res: Response) => {
  try {
    const diag = await getEmailDiagnostics();
    return res.json(diag);
  } catch (err) {
    console.error("[admin/email] GET /email-status error:", err);
    return sendError(res, 500, "Errore lettura diagnostica email");
  }
});

// GET /api/admin/email-rate-limit-status — stato dei rate limiter in-memory.
router.get("/email-rate-limit-status", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const lockoutEntries = await Promise.all(
      [...verifyAttempts.entries()].map(async ([userId, v]) => {
        const remainingMs = Math.max(0, VERIFY_ATTEMPT_WINDOW_MS - (now - v.firstAt));
        let nickname: string | undefined;
        try {
          const u = await storage.getUser(userId);
          nickname = u?.nickname ?? undefined;
        } catch {
          // best-effort: il nickname è opzionale lato UI
        }
        return {
          userId,
          nickname,
          count: v.count,
          firstAt: new Date(v.firstAt).toISOString(),
          remainingMs,
          lockedOut: v.count >= VERIFY_MAX_ATTEMPTS && remainingMs > 0,
        };
      })
    );

    return res.json({
      verifyEmail: {
        max: VERIFY_EMAIL_MAX,
        windowMs: VERIFY_EMAIL_WINDOW_MS,
        entries: readStoreEntries(verifyEmailStore),
      },
      resendVerification: {
        max: RESEND_VERIFICATION_MAX,
        windowMs: RESEND_VERIFICATION_WINDOW_MS,
        entries: readStoreEntries(resendVerificationStore),
      },
      userLockouts: {
        max: VERIFY_MAX_ATTEMPTS,
        windowMs: VERIFY_ATTEMPT_WINDOW_MS,
        entries: lockoutEntries,
      },
    });
  } catch (err) {
    console.error("[admin/email] GET /email-rate-limit-status error:", err);
    return sendError(res, 500, "Errore lettura stato rate limiter");
  }
});

const RESET_SCOPES = ["all", "verifyEmail", "resendVerification", "userLockouts"] as const;
type ResetScope = (typeof RESET_SCOPES)[number];

// POST /api/admin/email-rate-limit-reset — azzera i contatori in-memory.
router.post("/email-rate-limit-reset", async (req: Request, res: Response) => {
  try {
    const scope = (req.body?.scope as string) || "all";
    if (!RESET_SCOPES.includes(scope as ResetScope)) {
      return sendError(res, 400, `Scope non valido. Ammessi: ${RESET_SCOPES.join(", ")}`);
    }
    const reset = { verifyEmail: false, resendVerification: false, userLockouts: false };

    if (scope === "all" || scope === "verifyEmail") {
      await verifyEmailStore.resetAll?.();
      reset.verifyEmail = true;
    }
    if (scope === "all" || scope === "resendVerification") {
      await resendVerificationStore.resetAll?.();
      reset.resendVerification = true;
    }
    if (scope === "all" || scope === "userLockouts") {
      verifyAttempts.clear();
      reset.userLockouts = true;
    }

    console.log(`[admin/email] Rate limiter email resettati (scope=${scope})`);
    return res.json({ ok: true, scope, reset });
  } catch (err) {
    console.error("[admin/email] POST /email-rate-limit-reset error:", err);
    return sendError(res, 500, "Errore reset rate limiter");
  }
});

// POST /api/admin/email-test — invia un'email di test all'account Gmail configurato.
router.post("/email-test", async (req: Request, res: Response) => {
  try {
    const creds = await getEmailCredentials();
    if (!creds) {
      return res.json({
        ok: false,
        errorCode: "no-credentials",
        error: "Credenziali Gmail non configurate. Inserisci email + App Password qui sotto.",
      });
    }

    const to = (typeof req.body?.to === "string" && req.body.to.trim()) || creds.user;
    const now = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    const content = `
      <h2 style="color: #FF6B35; margin-top: 0;">Email di test</h2>
      <p style="line-height: 1.6;">Questa è un'email di test inviata dal pannello admin di BikerLink per verificare la deliverability del servizio SMTP.</p>
      <p style="line-height: 1.6; color: #aaa; font-size: 14px;">Inviata il ${now} · sorgente credenziali: ${creds.source.toUpperCase()}</p>
      <p style="line-height: 1.6;">Se ricevi questo messaggio nella posta in arrivo (non in spam), la configurazione è corretta.</p>
    `;
    const html = getBaseTemplate(content, "Test deliverability BikerLink — invio dal pannello admin");
    const result = await sendEmailDetailed(to, "BikerLink — Email di test", html);

    return res.json(result);
  } catch (err) {
    console.error("[admin/email] POST /email-test error:", err);
    return sendError(res, 500, "Errore invio email di test");
  }
});

export default router;
