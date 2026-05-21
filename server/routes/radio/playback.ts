import { Router, Request, Response } from "express";
import { 
  requireAuth, 
  validateStreamUrl, 
  safeDispatcher, 
  isAllowedStreamContentType 
} from "./utils";

const router = Router();

router.get("/stream", requireAuth, async (req: Request, res: Response) => {
  const rawUrl = req.query.url;
  const firstFromArray = Array.isArray(rawUrl) && typeof rawUrl[0] === "string" ? rawUrl[0] : undefined;
  const streamUrl: string | undefined =
    typeof rawUrl === "string" ? rawUrl : firstFromArray;

  if (!streamUrl) {
    return res.status(400).json({ error: "url is required" });
  }

  if (!(await validateStreamUrl(streamUrl))) {
    return res.status(400).json({ error: "url is not valid or not allowed" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    // redirect: "manual" prevents auto-following — we re-validate any redirect target
    // dispatcher: safeDispatcher closes the DNS-rebinding TOCTOU between
    // validateStreamUrl()'s lookup and fetch's connect-time lookup.
    const upstream = await fetch(streamUrl, {
      headers: {
        "User-Agent": "BikerLink/4.0.0",
        "Icy-MetaData": "1",
      },
      signal: controller.signal,
      redirect: "manual",
      dispatcher: safeDispatcher,
    } as Parameters<typeof fetch>[1]);

    let finalResponse = upstream;

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        clearTimeout(timer);
        return res.status(502).json({ error: "Redirect without Location header" });
      }
      let redirectTarget: URL;
      try {
        redirectTarget = new URL(location, streamUrl);
      } catch {
        clearTimeout(timer);
        return res.status(400).json({ error: "Invalid redirect target" });
      }
      if (!(await validateStreamUrl(redirectTarget.href))) {
        clearTimeout(timer);
        return res.status(400).json({ error: "Redirect target is not allowed" });
      }
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 10000);
      try {
        finalResponse = await fetch(redirectTarget.href, {
          headers: {
            "User-Agent": "BikerLink/4.0.0",
            "Icy-MetaData": "1",
          },
          signal: controller2.signal,
          redirect: "manual",
          dispatcher: safeDispatcher,
        } as Parameters<typeof fetch>[1]);
        clearTimeout(timer2);
        if (finalResponse.status >= 300 && finalResponse.status < 400) {
          return res.status(400).json({ error: "Too many redirects" });
        }
      } catch (err2) {
        clearTimeout(timer2);
        if (!res.headersSent) {
          return res.status(502).json({ error: "Cannot connect to redirected stream" });
        }
        return;
      }
    }

    clearTimeout(timer);

    if (!finalResponse.ok) {
      return res.status(502).json({ error: `Upstream error: ${finalResponse.status}` });
    }

    const contentType = finalResponse.headers.get("Content-Type") || "audio/mpeg";
    if (!isAllowedStreamContentType(finalResponse.headers.get("Content-Type"))) {
      // SSRF defense-in-depth: even if URL/IP validation were bypassed, this
      // prevents the proxy from returning HTML/JSON/etc. from internal services.
      return res.status(415).json({ error: "Upstream content-type is not an audio/video stream" });
    }
    const transferEncoding = finalResponse.headers.get("Transfer-Encoding");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-store");
    if (transferEncoding) {
      res.setHeader("Transfer-Encoding", transferEncoding);
    }

    if (!finalResponse.body) {
      return res.status(502).json({ error: "No response body from upstream" });
    }

    req.on("close", () => {
      controller.abort();
    });

    const reader = finalResponse.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writable) break;
          res.write(Buffer.from(value));
        }
      } catch {
      } finally {
        res.end();
      }
    };
    pump();
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(`[radio] stream proxy error${isTimeout ? " (timeout)" : ""}:`, err);
    if (!res.headersSent) {
      return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? "Stream timeout" : "Cannot connect to stream" });
    }
  }
});

export default router;
