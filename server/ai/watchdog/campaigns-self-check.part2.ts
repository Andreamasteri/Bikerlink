import http from "http";
import { getInternalProbeToken, getInternalProbeHeaderName } from "./internal-token";

export interface HttpProbeResp {
  status: number;
  body: string;
  json: unknown | null;
}

export function httpProbe(
  method: string,
  pathname: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<HttpProbeResp> {
  return new Promise((resolve, reject) => {
    const port = parseInt(process.env.PORT ?? "5000", 10);
    const headers: Record<string, string> = {
      [getInternalProbeHeaderName()]: getInternalProbeToken(),
      ...(extraHeaders ?? {}),
    };
    let payload: Buffer | undefined;
    if (body !== undefined) {
      payload = Buffer.from(JSON.stringify(body), "utf8");
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers, timeout: 15_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try { json = raw ? JSON.parse(raw) : null; } catch {/* not json */}
          resolve({ status: res.statusCode ?? 0, body: raw, json });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("probe timeout 15s")); });
    if (payload) req.write(payload);
    req.end();
  });
}
