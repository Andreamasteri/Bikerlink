import { AppState } from "react-native";
import { getApiUrl, authFetchHeaders, getSessionToken } from "@/lib/query-client";
import { runAllTests } from "@/lib/diagnostic/runner";

let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _isAdmin = false;
let _enabled = false;

function clearReconnect() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
}

function scheduleReconnect(delayMs = 10000) {
  clearReconnect();
  _reconnectTimer = setTimeout(() => connect(), delayMs);
}

function connect() {
  if (!_enabled || _ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return;
  const token = getSessionToken();
  if (!token) return;

  const apiUrl = getApiUrl();
  const wsUrl = apiUrl.replace(/^https?:\/\//, (m) => m === "https://" ? "wss://" : "ws://") + "/ws/diagnostic";

  try {
    const ws = new WebSocket(wsUrl);
    _ws = ws;

    ws.onopen = () => {
      clearReconnect();
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "") as { type: string; showBanner?: boolean };
        if (msg.type === "diagnostic:run") {
          await handleRunCommand(msg.showBanner ?? false);
        }
      } catch {/* noop */}
    };

    ws.onerror = () => { scheduleReconnect(); };
    ws.onclose = () => { _ws = null; if (_enabled) scheduleReconnect(); };
  } catch {
    scheduleReconnect();
  }
}

function disconnect() {
  clearReconnect();
  if (_ws) { try { _ws.close(); } catch {/* noop */} _ws = null; }
}

async function handleRunCommand(showBanner: boolean) {
  void showBanner;
  const send = (data: Record<string, unknown>) => {
    if (_ws?.readyState === WebSocket.OPEN) {
      try { _ws.send(JSON.stringify(data)); } catch {/* noop */}
    }
  };

  try {
    const { apiRequest } = await import("@/lib/query-client");
    const report = await runAllTests({
      isAdmin: _isAdmin,
      onProgress: (done, total, lastResult) => {
        send({ type: "diagnostic:progress", done, total, lastResult });
      },
    });
    send({ type: "diagnostic:result", summary: report.summary });
    await apiRequest("POST", "/api/diagnostic/report", {
      triggeredBy: "admin",
      appVersion: report.appVersion,
      platform: report.platform,
      deviceModel: report.deviceModel,
      sentryEventId: report.sentryEventId,
      summary: report.summary,
      results: report.results,
    });
  } catch (err) {
    send({ type: "diagnostic:result", error: err instanceof Error ? err.message : String(err) });
  }
}

let _appStateSub: { remove: () => void } | null = null;

export function initDiagnosticWS(options: { isAdmin?: boolean }) {
  _isAdmin = options.isAdmin ?? false;
  _enabled = true;
  connect();
  if (!_appStateSub) {
    _appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") connect();
    });
  }
}

export function teardownDiagnosticWS() {
  _enabled = false;
  _appStateSub?.remove();
  _appStateSub = null;
  disconnect();
}
