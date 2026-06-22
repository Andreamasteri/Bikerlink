import { type Request, type Response } from "express";
import { setSttProviderChain, getSttProviderStatusList, DEFAULT_STT_CHAIN, getEffectiveSttChain } from "../ai/whisper-provider-config";
import { sendError } from "../lib/api-response";
import { safeUrl, buildSilentWav, probeHomeFormat } from "./admin-whisper-config.helpers";

interface DiagStep {
  label: string;
  ok: boolean;
  latency_ms: number | null;
  detail: string;
}

export async function handleWhisperHealth(req: Request, res: Response) {
  const agentBase = process.env.THINKCENTRE_METRICS_URL?.replace(/\/$/, "");
  if (!agentBase) {
    return res.json({
      agentOnline: false,
      status: "UNKNOWN",
      lastCode: null,
      lastCheck: null,
      lastRestart: null,
      lastRestartReason: null,
      reason: "THINKCENTRE_METRICS_URL non configurato",
    });
  }

  const url = `${agentBase}/whisper-health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const agentRes = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!agentRes.ok) {
      return res.json({ agentOnline: false, status: "UNKNOWN", reason: `agent HTTP ${agentRes.status}` });
    }
    const data = await agentRes.json() as {
      status?: string;
      lastCode?: number | null;
      lastCheck?: string | null;
      lastRestart?: string | null;
      lastRestartReason?: string | null;
    };
    return res.json({ agentOnline: true, ...data });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return res.json({ agentOnline: false, status: "UNKNOWN", reason: msg.slice(0, 120) });
  }
}

export async function handleWhisperReset(_req: Request, res: Response) {
  try {
    await setSttProviderChain(DEFAULT_STT_CHAIN);
    const data = await getSttProviderStatusList();
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error("[admin/whisper-config] reset error:", err);
    sendError(res, 500, (err as Error).message);
  }
}

export async function handleWhisperDiagnose(_req: Request, res: Response) {
  const steps: DiagStep[] = [];
  try {
    const chain = await getEffectiveSttChain();
    for (const providerId of chain) {
      const endpoint = process.env.WHISPER_HOME_URL ?? process.env.THINKCENTRE_WHISPER_URL ?? "";
      if (providerId === "home" && !endpoint) {
        steps.push({ label: `${providerId}: endpoint`, ok: false, latency_ms: null, detail: "WHISPER_HOME_URL non configurato" });
        continue;
      }
      if (providerId === "home") {
        const logId = `diag-${Date.now()}`;
        const wav = buildSilentWav();
        const start = Date.now();
        try {
          const result = await probeHomeFormat(logId, safeUrl(endpoint), {}, wav, "audio/wav", "silence.wav", 10_000);
          steps.push({ label: `${providerId}: wav probe`, ok: result.ok, latency_ms: Date.now() - start, detail: result.ok ? "OK" : (result.error ?? "failed") });
        } catch (e) {
          steps.push({ label: `${providerId}: wav probe`, ok: false, latency_ms: Date.now() - start, detail: String(e) });
        }
      } else {
        steps.push({ label: `${providerId}`, ok: true, latency_ms: null, detail: "cloud provider — no probe required" });
      }
    }
    res.json({ ok: true, steps });
  } catch (err) {
    console.error("[admin/whisper-config] diagnose error:", err);
    res.json({ ok: false, steps, error: (err as Error).message });
  }
}
