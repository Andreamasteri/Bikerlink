/** Authenticated smoke checks and guaranteed cleanup. */
import {
  BASE_URL, cleanupSmokeUser, cookieJar, http, results, run, stopReason,
  type CheckResult,
} from "./run-smoke";

interface SmokePart2Input {
  EMAIL: string;
  createdUserId: string | null;
  registeredThisRun: boolean;
  results: CheckResult[];
  cookieJar: string;
  stopReason: string | null;
}

export async function runSmokePart2(input: SmokePart2Input): Promise<number> {
  try {
    await run("6.3", "chat", "SSE /api/chat/stream", "BLOCKER", async () => {
      const controller = new AbortController();
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
      };
      if (cookieJar) headers.Cookie = cookieJar;
      const hardTimeout = setTimeout(() => controller.abort(), 6_000);
      try {
        const response = await fetch(`${BASE_URL}/api/chat/stream`, {
          headers, signal: controller.signal,
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok) return { ok: false, status: response.status };
        let received = false;
        if (response.body) {
          const reader = response.body.getReader();
          const firstChunk = await Promise.race([
            reader.read(),
            new Promise<{ done: true; value: undefined }>(resolve =>
              setTimeout(() => resolve({ done: true, value: undefined }), 5_000),
            ),
          ]);
          received = !!(firstChunk.value && firstChunk.value.length > 0);
          try { await reader.cancel(); } catch { /* abort closes stream */ }
        }
        controller.abort();
        const isSse = /text\/event-stream/i.test(contentType);
        return {
          ok: isSse || received, status: response.status,
          note: received ? "stream attivo" : isSse
            ? "connessione SSE stabilita (nessun evento in 5s)"
            : "content-type non SSE",
        };
      } catch (error: unknown) {
        const err = error instanceof Error ? error : null;
        return { ok: false, note: err?.name === "AbortError"
          ? "timeout connessione" : (err?.message ?? String(error)) };
      } finally {
        clearTimeout(hardTimeout);
      }
    });
    await run("1.8", "auth", "POST /api/auth/logout", "MAJOR", async () => {
      const response = await http("POST", "/api/auth/logout", {});
      return { ok: response.status === 200 || response.status === 204,
        status: response.status };
    });
    const blockerFailures = results.filter(
      result => result.outcome === "FAIL" && result.severity === "BLOCKER",
    );
    console.log(`[smoke] totale=${results.length}`);
    if (stopReason) console.log(`[smoke] interrotto: ${stopReason}`);
    return blockerFailures.length > 0 ? 1 : 0;
  } finally {
    try {
      const cleanup = await cleanupSmokeUser(
        input.EMAIL, input.createdUserId, input.registeredThisRun,
      );
      console.log(
        `[smoke] cleanup ${input.EMAIL}: ${cleanup.ok ? "OK" : "FAIL"} ÔÇö ${cleanup.note}`,
      );
    } catch (error: unknown) {
      console.log(`[smoke] cleanup ${input.EMAIL}: FAIL ÔÇö ${
        error instanceof Error ? error.message : String(error)}`);
    }
  }
}
