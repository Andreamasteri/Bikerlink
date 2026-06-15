import { Router, Request, Response } from "express";
import { 
  requireAuth, 
  validateStreamUrl, 
  safeDispatcher, 
  isAllowedStreamContentType,
  checkStreamRateLimit,
  acquireStreamSlot,
  releaseStreamSlot,
  STREAM_MAX_BYTES,
  STREAM_MAX_DURATION_MS,
  STREAM_MAX_CONTENT_LENGTH,
} from "./utils";

const router = Router();

router.get("/stream", requireAuth, async (req: Request, res: Response) => {
  const userId = String((req as Request & { user?: { id?: unknown } }).user?.id ?? "unknown");

  if (!checkStreamRateLimit(userId)) {
    return res.status(429).json({ error: "Too many stream requests, please slow down" });
  }

  if (!acquireStreamSlot(userId)) {
    return res.status(429).json({ error: "Too many concurrent streams" });
  }

  let slotReleased = false;
  const releaseSlot = () => {
    if (!slotReleased) {
      slotReleased = true;
      releaseStreamSlot(userId);
    }
  };

  const rawUrl = req.query.url;
  const firstFromArray = Array.isArray(rawUrl) && typeof rawUrl[0] === "string" ? rawUrl[0] : undefined;
  const streamUrl: string | undefined =
    typeof rawUrl === "string" ? rawUrl : firstFromArray;

  if (!streamUrl) {
    releaseSlot();
    return res.status(400).json({ error: "url is required" });
  }

  if (!(await validateStreamUrl(streamUrl))) {
    releaseSlot();
    return res.status(400).json({ error: "url is not valid or not allowed" });
  }

  // controller1 covers the initial connection + optional redirect handshake (10s each).
  // activeController is set to whichever controller owns the response body we are
  // actually streaming, so that the duration timer, client-close event, and byte-budget
  // abort all reliably terminate the correct upstream connection.
  const controller1 = new AbortController();
  let activeController: AbortController = controller1;
  let durationTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (durationTimer !== null) clearTimeout(durationTimer);
    releaseSlot();
  };

  try {
    // redirect: "manual" prevents auto-following — we re-validate any redirect target.
    // dispatcher: safeDispatcher closes the DNS-rebinding TOCTOU between
    // validateStreamUrl()'s lookup and fetch's connect-time lookup.
    const timer1 = setTimeout(() => controller1.abort(), 10000);
    const upstream = await fetch(streamUrl, {
      headers: {
        "User-Agent": "BikerLink/4.0.0",
        "Icy-MetaData": "1",
      },
      signal: controller1.signal,
      redirect: "manual",
      dispatcher: safeDispatcher,
    } as unknown as RequestInit);
    clearTimeout(timer1);

    let finalResponse = upstream;

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        cleanup();
        return res.status(502).json({ error: "Redirect without Location header" });
      }
      let redirectTarget: URL;
      try {
        redirectTarget = new URL(location, streamUrl);
      } catch {
        cleanup();
        return res.status(400).json({ error: "Invalid redirect target" });
      }
      if (!(await validateStreamUrl(redirectTarget.href))) {
        cleanup();
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
        } as unknown as RequestInit);
        clearTimeout(timer2);
        if (finalResponse.status >= 300 && finalResponse.status < 400) {
          cleanup();
          return res.status(400).json({ error: "Too many redirects" });
        }
        // Redirect succeeded — streaming will use controller2, not controller1.
        activeController = controller2;
      } catch (_err2) {
        clearTimeout(timer2);
        cleanup();
        if (!res.headersSent) {
          return res.status(502).json({ error: "Cannot connect to redirected stream" });
        }
        return;
      }
    }

    if (!finalResponse.ok) {
      cleanup();
      return res.status(502).json({ error: `Upstream error: ${finalResponse.status}` });
    }

    const contentType = finalResponse.headers.get("Content-Type") || "audio/mpeg";
    if (!isAllowedStreamContentType(finalResponse.headers.get("Content-Type"))) {
      // SSRF defense-in-depth: even if URL/IP validation were bypassed, this
      // prevents the proxy from returning HTML/JSON/etc. from internal services.
      cleanup();
      return res.status(415).json({ error: "Upstream content-type is not an audio/video stream" });
    }

    // Reject responses that declare a large finite body — legitimate radio streams
    // are infinite and never set Content-Length. A declared size above the threshold
    // almost certainly means a file download is being proxied.
    const declaredLength = parseInt(finalResponse.headers.get("Content-Length") ?? "", 10);
    if (!isNaN(declaredLength) && declaredLength > STREAM_MAX_CONTENT_LENGTH) {
      cleanup();
      return res.status(413).json({ error: "Upstream response is too large for a radio stream" });
    }

    const transferEncoding = finalResponse.headers.get("Transfer-Encoding");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-store");
    if (transferEncoding) {
      res.setHeader("Transfer-Encoding", transferEncoding);
    }

    if (!finalResponse.body) {
      cleanup();
      return res.status(502).json({ error: "No response body from upstream" });
    }

    // Now that we know the active controller, wire up duration cap and client-close
    // abort against the correct controller (handles both direct and redirected streams).
    durationTimer = setTimeout(() => {
      activeController.abort();
    }, STREAM_MAX_DURATION_MS);

    req.on("close", () => {
      activeController.abort();
    });

    const reader = finalResponse.body.getReader();
    const pump = async () => {
      let bytesRelayed = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writable) break;
          bytesRelayed += value.byteLength;
          if (bytesRelayed > STREAM_MAX_BYTES) {
            // Byte budget exhausted — close the connection to prevent the proxy
            // from relaying arbitrarily large payloads.
            console.warn("[radio] Byte budget exceeded, closing stream");
            activeController.abort();
            break;
          }
          res.write(Buffer.from(value));
        }
      } catch (err) {
        console.warn("[radio] Pump stream error:", err);
      } finally {
        res.end();
        cleanup();
      }
    };
    pump();
  } catch (err) {
    cleanup();
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(`[radio] stream proxy error${isTimeout ? " (timeout)" : ""}:`, err);
    if (!res.headersSent) {
      return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? "Stream timeout" : "Cannot connect to stream" });
    }
  }
});

export default router;
