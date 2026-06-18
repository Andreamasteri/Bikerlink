import { AppState } from "react-native";
import { router } from "expo-router";
import { getApiUrl, authFetchHeaders, getSessionToken } from "@/lib/query-client";
import { runAllTests } from "@/lib/diagnostic/runner";

let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _isAdmin = false;
let _isModerator = false;
let _enabled = false;

// ── Connection state tracking ───────────────────────────────────────────────
// Tracks whether the diagnostic WS is live ("connected", 🟢) or the client is
// falling back to the 60s remote polling loop ("polling", 🟡). Exposed so the
// user-facing diagnostic screen can render the same badge the admin panel shows,
// and logged for debug regardless of whether any screen is mounted.
export type DiagWSConnState = "connected" | "polling";
let _connState: DiagWSConnState = "polling";
const _connListeners = new Set<(state: DiagWSConnState) => void>();

function setConnState(state: DiagWSConnState) {
  if (_connState === state) return;
  _connState = state;
  console.log(`[DiagWS] connection state → ${state === "connected" ? "🟢 connected" : "🟡 polling"}`);
  _connListeners.forEach(cb => { try { cb(state); } catch {/* noop */} });
}

export function getDiagnosticWSConnState(): DiagWSConnState {
  return _connState;
}

export function subscribeDiagnosticWSConnState(cb: (state: DiagWSConnState) => void): () => void {
  _connListeners.add(cb);
  // Emit current state immediately so subscribers don't wait for the next change.
  try { cb(_connState); } catch {/* noop */}
  return () => { _connListeners.delete(cb); };
}

// ── Admin event listener registry ──────────────────────────────────────────
// Allows the admin panel to subscribe to diag:progress / diag:result events
// that the server broadcasts to admin connections, without opening a second WS.
export type DiagAdminEventType = "diag:progress" | "diag:result" | "diag:online-update";
export type DiagAdminEventListener = (msg: Record<string, unknown>) => void;
const _listeners = new Map<DiagAdminEventType, Set<DiagAdminEventListener>>();

export function addDiagnosticEventListener(type: DiagAdminEventType, cb: DiagAdminEventListener): void {
  if (!_listeners.has(type)) _listeners.set(type, new Set());
  _listeners.get(type)!.add(cb);
}

export function removeDiagnosticEventListener(type: DiagAdminEventType, cb: DiagAdminEventListener): void {
  _listeners.get(type)?.delete(cb);
}

function emitDiagnosticEvent(type: DiagAdminEventType, msg: Record<string, unknown>): void {
  _listeners.get(type)?.forEach(cb => { try { cb(msg); } catch {/* noop */} });
}

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
      setConnState("connected");
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "") as { type: string; showBanner?: boolean; [k: string]: unknown };
        if (msg.type === "diagnostic:run") {
          await handleRunCommand(msg.showBanner ?? false);
        } else if (msg.type === "diag:progress" || msg.type === "diag:result" || msg.type === "diag:online-update") {
          emitDiagnosticEvent(msg.type, msg as Record<string, unknown>);
        }
      } catch {/* noop */}
    };

    ws.onerror = () => { setConnState("polling"); scheduleReconnect(); };
    ws.onclose = () => { _ws = null; setConnState("polling"); if (_enabled) scheduleReconnect(); };
  } catch {
    setConnState("polling");
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
      buildProfile: report.buildProfile,
      sentryEventId: report.sentryEventId,
      summary: report.summary,
      results: report.results,
    });

    if (_isAdmin || _isModerator) {
      try {
        router.push({
          pathname: "/diagnostica-risultati",
          params: { reportJson: JSON.stringify(report) },
        } as never);
      } catch {/* noop: navigazione best-effort */}
    }
  } catch (err) {
    send({ type: "diagnostic:result", error: err instanceof Error ? err.message : String(err) });
  }
}

let _appStateSub: { remove: () => void } | null = null;

export function initDiagnosticWS(options: { isAdmin?: boolean; isModerator?: boolean }) {
  _isAdmin = options.isAdmin ?? false;
  _isModerator = options.isModerator ?? false;
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
