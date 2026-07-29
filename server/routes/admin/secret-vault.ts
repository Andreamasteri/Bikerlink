import crypto from "crypto";
import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { sendError } from "../../lib/api-response";

/**
 * Secret Vault control plane.
 *
 * This router is deliberately metadata-only on reads. On writes, the secret is
 * accepted once, encrypted with the bridge public key (RSA-OAEP/SHA-256), and
 * relayed as ciphertext. It is never persisted, logged, returned, or committed.
 */
const router = Router();
const json = express.json({ limit: "16kb" });
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, 429, "Troppi aggiornamenti. Riprova più tardi."),
});

const writeSchema = z.object({
  value: z.string().min(1).max(12_000),
});

function allowedNames(): string[] {
  return (process.env.SECRET_VAULT_ALLOWED_NAMES ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => /^[A-Z][A-Z0-9_]{1,127}$/.test(name));
}

function relayConfig() {
  const url = process.env.SECRET_VAULT_RELAY_URL;
  const token = process.env.SECRET_VAULT_RELAY_TOKEN;
  const publicKey = process.env.SECRET_VAULT_PUBLIC_KEY_PEM;
  return { url, token, publicKey, configured: Boolean(url && token && publicKey) };
}

function isSameOrigin(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0].trim();
    const proto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
    return Boolean(host) && originUrl.host === host && originUrl.protocol === `${proto}:`;
  } catch {
    return false;
  }
}

function setNoStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

router.get("/secret-vault", (_req, res) => {
  setNoStore(res);
  const config = relayConfig();
  return res.json({
    configured: config.configured,
    secrets: allowedNames().map((name) => ({
      name,
      // The API intentionally never reads secret values or invents their state.
      status: config.configured ? "ready" : "not_configured",
    })),
  });
});

router.put("/secret-vault/:name", limiter, json, async (req, res) => {
  setNoStore(res);
  if (!isSameOrigin(req)) return sendError(res, 403, "Origine richiesta non valida.");

  const name = typeof req.params.name === "string" ? req.params.name : "";
  if (!allowedNames().includes(name)) return sendError(res, 404, "Secret non gestito dal vault.");

  const parsed = writeSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Valore non valido.");

  const config = relayConfig();
  if (!config.configured || !config.url || !config.token || !config.publicKey) {
    return sendError(res, 503, "Vault non ancora configurato.");
  }

  try {
    const ciphertext = crypto.publicEncrypt(
      {
        key: config.publicKey.replace(/\\n/g, "\n"),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(parsed.data.value, "utf8"),
    ).toString("base64");

    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        version: 1,
        secretName: name,
        ciphertext,
        requestedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      // Never include upstream response text: it could contain a sensitive diagnostic.
      return sendError(res, 502, "Il vault non ha confermato l'aggiornamento.");
    }

    return res.status(202).json({ ok: true, secret: { name, status: "queued" } });
  } catch {
    return sendError(res, 502, "Il vault non è raggiungibile.");
  }
});

export default router;
