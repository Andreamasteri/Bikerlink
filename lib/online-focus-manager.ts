import { AppState, Platform } from "react-native";
import { onlineManager, focusManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { queryClient } from "@/lib/query-client";

// ──────────────────────────────────────────────────────────────────────
// Resume/reconnect robustness (Task #4585)
//
// React Native has neither `navigator.onLine` nor `visibilitychange`, so
// React Query cannot know whether the device is online or whether the app is
// in the foreground. Here we wire the two global managers once at boot:
//
//  - `onlineManager` ← NetInfo: while offline, React Query pauses all fetches
//    (no more "fetch into the void" — the main cause of resume failures on poor
//    network) and resumes coordinated on reconnect.
//  - `focusManager` ← AppState: on resume (background → active) stale queries
//    refetch via focus. With the global defaults (`staleTime: Infinity`,
//    `refetchOnWindowFocus: false`) this does NOT cause a refetch storm — only
//    explicitly-stale queries refetch.
//
// We also expose `subscribeReconnect()` so the NON-React-Query resume flows
// (heartbeat, session start) can be relaunched explicitly on the offline→online
// transition, which `onlineManager` does not cover for them.
// ──────────────────────────────────────────────────────────────────────

// Online decision: treat the NetInfo `null`/unknown state (briefly emitted at
// startup) as ONLINE, not offline, so we never pause queries on an unknown
// state. Only an explicit `isConnected === false` flips us offline.
export function isStateOnline(isConnected: boolean | null): boolean {
  return isConnected !== false;
}

type ReconnectListener = () => void;
const reconnectListeners = new Set<ReconnectListener>();

/**
 * Subscribe to the offline→online transition. The callback fires once each time
 * connectivity is regained (debounced against flapping). Returns an unsubscribe.
 * Used by AppStateHandler to relaunch heartbeat/session on reconnect.
 */
export function subscribeReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

// Keys that MUST be fresh the moment the network returns (online counts,
// profile, available lists). Shared by the reconnect-always defaults below and
// by `retryConnection()` so the manual "Riprova" button refetches the exact
// same set as an automatic reconnect.
export const RECONNECT_KEYS: readonly string[] = [
  "/api/users/profile",
  "/api/users/online-count",
  "/api/users/biker-available-count",
  "/api/users/zavorrine-available-count",
  "/api/users/biker-available-list",
  "/api/users/zavorrine-available-list",
];

let _wired = false;
let _lastOnline = true;
let _reconnectDebounce: ReturnType<typeof setTimeout> | null = null;
let _retryInFlight = false;

function notifyReconnect() {
  if (_reconnectDebounce) clearTimeout(_reconnectDebounce);
  _reconnectDebounce = setTimeout(() => {
    _reconnectDebounce = null;
    reconnectListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // never let a single reconnect listener throw break the others
      }
    });
  }, 600);
}

/**
 * Wire onlineManager + focusManager and install the targeted reconnect refetch
 * defaults. Idempotent: safe to call more than once (only the first call wires).
 */
export function initOnlineFocusManager(): void {
  if (_wired) return;
  _wired = true;

  // ── onlineManager ← NetInfo ──────────────────────────────────────────────
  onlineManager.setEventListener((setOnline) => {
    const sub = NetInfo.addEventListener((state) => {
      const online = isStateOnline(state.isConnected);
      setOnline(online);
      if (online && !_lastOnline) {
        // offline → online: relaunch non-query resume flows.
        notifyReconnect();
      }
      _lastOnline = online;
    });
    return () => {
      sub();
    };
  });

  // ── focusManager ← AppState (native only; web keeps its native behaviour) ──
  // Intentionally never unsubscribed: this is wired once for the entire app
  // lifetime (the `_wired` guard makes init idempotent), so there is no scope
  // whose teardown should remove it.
  if (Platform.OS !== "web") {
    AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
  }

  // ── Targeted refetch-on-reconnect ────────────────────────────────────────
  // Global default is `staleTime: Infinity`, so `refetchOnReconnect` (which only
  // refetches *stale* queries) would never fire on its own. For the data that
  // MUST be fresh the moment the network returns (online counts, profile), set
  // `refetchOnReconnect: "always"` selectively — NOT globally — so they refresh
  // on reconnect even though they're never marked stale.
  for (const key of RECONNECT_KEYS) {
    queryClient.setQueryDefaults([key], { refetchOnReconnect: "always" });
  }
}

/**
 * Manual "retry now" used by the offline banner. Forces a fresh connectivity
 * probe via NetInfo, syncs `onlineManager` with the result and — if back online —
 * relaunches the non-query resume flows and refetches the targeted reconnect
 * keys. Returns `true` when connectivity was regained.
 *
 * Probe-failure fallback is platform-aware: on web (where NetInfo may be
 * unavailable) we optimistically assume online and let the refetches surface any
 * real failure, rather than trapping the user behind the banner; on native a
 * probe error keeps the current offline state instead of falsely hiding it.
 *
 * Re-entrancy guarded: a concurrent tap while a probe is in flight is a no-op
 * and returns the current online state (the UI also disables the button while
 * retrying).
 */
export async function retryConnection(): Promise<boolean> {
  if (_retryInFlight) return onlineManager.isOnline();
  _retryInFlight = true;
  try {
    let online: boolean;
    try {
      const state = await NetInfo.refresh();
      online = isStateOnline(state.isConnected);
    } catch {
      // NetInfo unavailable/threw: optimistic-online on web (probe may not
      // exist), but keep the real offline state on native.
      online = Platform.OS === "web" ? true : onlineManager.isOnline();
    }

    onlineManager.setOnline(online);

    if (online) {
      // Relaunch heartbeat/session resume flows (same path as an auto-reconnect).
      notifyReconnect();
      try {
        await queryClient.refetchQueries({
          predicate: (q) => RECONNECT_KEYS.includes(q.queryKey?.[0] as string),
        });
      } catch {
        // Refetch failures surface through each query's own error state.
      }
    }
    return online;
  } finally {
    _retryInFlight = false;
  }
}
