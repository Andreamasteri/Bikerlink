// Task #2657 — Bridge Coordinator → admin notifications WS.
// Subscribe pattern "*" sul bus AI e broadcast a tutti gli admin connessi.
// Eventi: { type: "ai_event", payload: AiEventBroadcast }
//         { type: "ai_conflict_new", payload: { conflictId, ... } } (placeholder)
// Fallback graceful: errori non bloccano.
import { getCoordinator, onConflictCreated, type AiEventBroadcast } from "./index";

type BroadcastFn = (msg: { type: string; payload: unknown }) => void;
let broadcaster: BroadcastFn | null = null;
let wired = false;

export function registerAiBroadcaster(fn: BroadcastFn): void {
  broadcaster = fn;
  wireOnce();
}

function wireOnce(): void {
  if (wired) return;
  wired = true;
  (async () => {
    try {
      const c = getCoordinator();
      await c.subscribe("*", (evt: AiEventBroadcast) => {
        try { broadcaster?.({ type: "ai_event", payload: evt }); } catch { /* noop */ }
      });
      console.log("[ai-coordinator/ws-bridge] subscribed to ai:events:*");
      onConflictCreated((c) => {
        try { broadcaster?.({ type: "ai_conflict_new", payload: c }); } catch { /* noop */ }
      });
      console.log("[ai-coordinator/ws-bridge] subscribed to conflict listener");
    } catch (err) {
      console.warn("[ai-coordinator/ws-bridge] subscribe failed:", (err as Error).message);
    }
  })();
}
