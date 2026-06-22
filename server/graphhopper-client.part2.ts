import { isRoutingEnabled as _isRoutingEnabled } from "./routing/routing-kill-switch";
import { GH_BASE_URL, ACTIVE_PROFILE, isSelfHosted, recordSelfHostSuccess, recordSelfHostFailure, isSelfHostDown, CLOUD_API_KEY, MapMatchResult, RouteResult, RouteRequest } from "./graphhopper-client";

function buildUrl(path: string, useCloud: boolean, CLOUD_URL: string, CLOUD_API_KEY: string, isSelfHosted: boolean, GH_BASE_URL: string, baseOverride?: string): string {
  if (!useCloud && isSelfHosted) {
    const base = baseOverride && baseOverride.length > 0 ? baseOverride : GH_BASE_URL;
    return `${base}${path}`;
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${CLOUD_URL}${path}${sep}key=${CLOUD_API_KEY}`;
}

// We'll need to re-implement ghFetch or export it from part1
import { ghFetch } from "./graphhopper-client";

export async function calculateRoute(
  req: RouteRequest,
  opts?: { selfHostedBaseUrl?: string },
): Promise<RouteResult> {
  if (!(await _isRoutingEnabled())) {
    throw new Error("Routing disabilitato via kill-switch.");
  }
  if (!isSelfHosted && !CLOUD_API_KEY) {
    throw new Error(
      "GraphHopper non configurato: impostare GRAPHHOPPER_URL (self-hosted) o GRAPHHOPPER_API_KEY (cloud).",
    );
  }

  const effectiveProfile = req.profile ?? ACTIVE_PROFILE;
  const body: Record<string, unknown> = {
    points: req.points,
    profile: effectiveProfile,
    instructions: req.instructions ?? true,
    calc_points: req.calc_points ?? true,
    points_encoded: req.points_encoded ?? true,
    elevation: req.elevation ?? true,
  };
  if (req.details?.length) body.details = req.details;
  if (req.custom_model) body.custom_model = req.custom_model;
  if (req.optimize !== undefined) body.optimize = req.optimize;
  if (req.heading !== undefined) body.heading = req.heading;

  const extraHeaders: Record<string, string> = {};
  if (req.language) extraHeaders["Accept-Language"] = req.language;

  const doFetch = async (useCloud: boolean): Promise<RouteResult> => {
    const fetchBody = useCloud ? { ...body, profile: "car" } : body;
    const res = await ghFetch("/route", {
      method: "POST",
      headers: extraHeaders,
      body: JSON.stringify(fetchBody),
    }, useCloud, useCloud ? undefined : opts?.selfHostedBaseUrl);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: GraphHopper /route — ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<RouteResult>;
  };

  if (!isSelfHosted) {
    return doFetch(true);
  }

  const attemptSelf = async (): Promise<RouteResult> => {
    const t0 = Date.now();
    const out = await doFetch(false);
    recordSelfHostSuccess(Date.now() - t0);
    return out;
  };

  try {
    return await attemptSelf();
  } catch (firstErr: unknown) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (!isSelfHostDown(firstErr)) {
      recordSelfHostFailure(firstMsg, false);
      throw firstErr instanceof Error ? firstErr : new Error(firstMsg);
    }
    console.warn(`[GraphHopper] Self-hosted: errore transitorio (${firstMsg}), retry in 400ms…`);
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    try {
      return await attemptSelf();
    } catch (retryErr: unknown) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      const canFallbackToCloud = isSelfHosted && Boolean(CLOUD_API_KEY);
      if (canFallbackToCloud && isSelfHostDown(retryErr)) {
        console.warn(`[GraphHopper] Self-hosted ancora offline dopo retry (${msg}) — fallback Cloud API (profilo car).`);
        try {
          const out = await doFetch(true);
          recordSelfHostFailure(msg, true);
          return out;
        } catch (cloudErr: unknown) {
          const cloudMsg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
          recordSelfHostFailure(`self-host: ${msg} | cloud: ${cloudMsg}`, false);
          throw new Error(`GraphHopper non disponibile (self-hosted offline e fallback Cloud fallito): ${cloudMsg.slice(0, 200)}`);
        }
      }
      recordSelfHostFailure(msg, false);
      if (isSelfHostDown(retryErr)) {
        throw new Error(`Server di routing self-hosted offline e nessun fallback Cloud configurato (GRAPHHOPPER_API_KEY). Dettaglio: ${msg.slice(0, 200)}`);
      }
      throw retryErr instanceof Error ? retryErr : new Error(msg);
    }
  }
}

export async function getServerInfo(): Promise<any> {
  if (!(await _isRoutingEnabled())) {
    return { status: "disabled", graph_loaded: false, version: "routing-kill-switch" };
  }
  const start = Date.now();
  try {
    const path = isSelfHosted ? "/health" : "/info";
    const res = await ghFetch(path, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json() as any;
    if (isSelfHosted) recordSelfHostSuccess(Date.now() - start);
    return info;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isSelfHosted) {
      try {
        const t0 = Date.now();
        const probe = await ghFetch("/route", {
          method: "POST",
          body: JSON.stringify({
            points: [[9.19, 45.46], [9.08, 45.81]],
            profile: ACTIVE_PROFILE,
            points_encoded: true,
            instructions: false,
            calc_points: false,
          }),
        });
        if (probe.ok) {
          recordSelfHostSuccess(Date.now() - t0);
          return { status: "ok", graph_loaded: true };
        }
      } catch {
      }
      recordSelfHostFailure(msg, false);
    }
    return { status: "error", graph_loaded: false, version: msg };
  }
}
