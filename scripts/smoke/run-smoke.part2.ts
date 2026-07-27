/**
 * Authenticated smoke checks and guaranteed cleanup.
 *
 * The main module has already completed registration, DB verification and
 * login before handing control to this continuation.
 */
import {
  BASE_URL,
  cleanupSmokeUser,
  cookieJar,
  http,
  results,
  run,
  stopReason,
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
  let exitCode = 1;
  let cleanupFailed = false;
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
          headers,
          signal: controller.signal,
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
          try {
            await reader.cancel();
          } catch {
            // The AbortController below is the connection-close fallback.
          }
        }
        controller.abort();

        const isSse = /text\/event-stream/i.test(contentType);
        return {
          ok: isSse || received,
          status: response.status,
          note: received
            ? "stream attivo"
            : isSse
              ? "connessione SSE stabilita (nessun evento in 5s)"
              : "content-type non SSE",
        };
      } catch (error: unknown) {
        const err = error instanceof Error ? error : null;
        return {
          ok: false,
          note: err?.name === "AbortError"
            ? "timeout connessione"
            : (err?.message ?? String(error)),
        };
      } finally {
        clearTimeout(hardTimeout);
      }
    });

    await run("1.8", "auth", "POST /api/auth/logout", "MAJOR", async () => {
      const response = await http("POST", "/api/auth/logout", {});
      return {
        ok: response.status === 200 || response.status === 204,
        status: response.status,
      };
    });

    const blockerFailures = results.filter(
      result => result.outcome === "FAIL" && result.severity === "BLOCKER",
    );
    const passed = results.filter(result => result.outcome === "PASS").length;
    const failed = results.filter(result => result.outcome === "FAIL").length;
    const skipped = results.filter(result => result.outcome === "SKIP").length;

    console.log("-".repeat(96));
    console.log(
      `[smoke] totale=${results.length} PASS=${passed} FAIL=${failed} SKIP=${skipped}`,
    );
    if (stopReason) {
      console.log(`[smoke] interrotto al primo BLOCKER: ${stopReason}`);
    }

    if (process.env.SMOKE_JSON === "1") {
      console.log(
        "\n[smoke-json]" +
        JSON.stringify({ baseUrl: BASE_URL, results, stopReason }),
      );
    }
    exitCode = blockerFailures.length > 0 ? 1 : 0;
  } finally {
    try {
      const cleanup = await cleanupSmokeUser(
        input.EMAIL,
        input.createdUserId,
        input.registeredThisRun,
      );
      console.log(
        `[smoke] cleanup ${input.EMAIL}: ${cleanup.ok ? "OK" : "FAIL"} — ${cleanup.note}`,
      );
      cleanupFailed = !cleanup.ok;
    } catch (error: unknown) {
      cleanupFailed = true;
      console.log(
        `[smoke] cleanup ${input.EMAIL}: FAIL — ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return cleanupFailed ? 1 : exitCode;
}
