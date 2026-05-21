import crypto from "crypto";

export function isLastfmConfigured(): boolean {
  return !!(process.env.LASTFM_API_KEY && process.env.LASTFM_SHARED_SECRET);
}

export function signParams(params: Record<string, string>, sharedSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto.createHash("md5").update(sorted + sharedSecret, "utf8").digest("hex");
}

export async function lastfmApiCall(params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<unknown> {
  const apiKey = process.env.LASTFM_API_KEY!;
  const sharedSecret = process.env.LASTFM_SHARED_SECRET!;
  const allParams: Record<string, string> = { ...params, api_key: apiKey, format: "json" };
  allParams.api_sig = signParams(
    Object.fromEntries(Object.entries(allParams).filter(([k]) => k !== "format")),
    sharedSecret
  );

  let resp: Response;
  if (method === "GET") {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v);
    resp = await fetch(url.toString());
  } else {
    const body = new URLSearchParams(allParams);
    resp = await fetch("https://ws.audioscrobbler.com/2.0/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  let json: unknown;
  try { json = await resp.json(); } catch { json = null; }

  if (!resp.ok) {
    const errMsg = (json as Record<string, unknown> | null)?.message as string | undefined
      ?? `Last.fm API error ${resp.status}`;
    throw new Error(errMsg);
  }
  return json;
}

export async function lastfmPublicCall(params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.LASTFM_API_KEY!;
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Last.fm API error ${resp.status}`);
  return resp.json();
}
