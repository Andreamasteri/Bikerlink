import { useEffect, useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient } from "@/lib/query-client";

const QUEUE_KEY = "@bikerlink/offline_patch_queue";
const MAX_QUEUE_SIZE = 30;
// Cap each retry request so a slow network on resume can't stall the queue drain
// (Task #4585). A timed-out entry stays queued and retries on the next resume.
const RETRY_REQUEST_TIMEOUT_MS = 8_000;

export interface OfflineQueueEntry {
  routeId: string;
  payload: Record<string, unknown>;
  type: "complete" | "title";
  enqueuedAt: string;
}

async function loadQueueRaw(): Promise<OfflineQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveQueueRaw(queue: OfflineQueueEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
  }
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);

  // Serialize all queue operations to prevent concurrent read/modify/write races.
  // Every public function chains onto this promise so enqueue and retryQueue
  // can never interleave and lose each other's writes.
  const lockRef = useRef<Promise<void>>(Promise.resolve());

  const withLock = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const next = lockRef.current.then(op);
    // Swallow errors on the lock chain so a failed op doesn't stall future ones.
    lockRef.current = next.then(
      () => {},
      () => {}
    );
    return next;
  }, []);

  const enqueue = useCallback(
    (
      routeId: string,
      payload: Record<string, unknown>,
      type: "complete" | "title"
    ): Promise<void> =>
      withLock(async () => {
        const queue = await loadQueueRaw();
        const existingIdx = queue.findIndex(
          (e) => e.routeId === routeId && e.type === type
        );
        const entry: OfflineQueueEntry = {
          routeId,
          payload,
          type,
          enqueuedAt: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          queue[existingIdx] = entry;
        } else {
          queue.push(entry);
        }
        const trimmed = queue.slice(-MAX_QUEUE_SIZE);
        await saveQueueRaw(trimmed);
        setPendingCount(trimmed.length);
      }),
    [withLock]
  );

  const retryQueue = useCallback(
    (): Promise<void> =>
      withLock(async () => {
        const queue = await loadQueueRaw();
        if (queue.length === 0) return;
        let synced = 0;
        const remaining: OfflineQueueEntry[] = [];
        for (const entry of queue) {
          try {
            // "complete" entries must use PUT /stop (updates profile km + fingerprint).
            // "title" entries use PATCH as before.
            if (entry.type === "complete") {
              await apiRequest("PUT", `/api/routes/${entry.routeId}/stop`, entry.payload, { timeoutMs: RETRY_REQUEST_TIMEOUT_MS });
              queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
            } else {
              await apiRequest("PATCH", `/api/routes/${entry.routeId}`, entry.payload, { timeoutMs: RETRY_REQUEST_TIMEOUT_MS });
            }
            synced += 1;
          } catch {
            remaining.push(entry);
          }
        }
        await saveQueueRaw(remaining);
        setPendingCount(remaining.length);
        if (synced > 0) {
          setLastSyncedCount(synced);
        }
      }),
    [withLock]
  );

  const clearLastSyncedCount = useCallback(() => setLastSyncedCount(0), []);

  useEffect(() => {
    loadQueueRaw()
      .then((q) => setPendingCount(q.length))
      .catch(() => {});
    retryQueue();
  }, [retryQueue]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      // Guard the resume callback: retryQueue is async and a thrown/rejected
      // path here would surface as an unhandled rejection inside a native
      // AppState callback. retryQueue already swallows per-entry errors via the
      // lock chain, but keep the listener body defensive regardless.
      try {
        if (nextState === "active") {
          retryQueue().catch(() => {});
        }
      } catch {
        // no-op: never let the resume AppState callback crash the app
      }
    });
    return () => sub.remove();
  }, [retryQueue]);

  return {
    enqueue,
    retryQueue,
    pendingCount,
    lastSyncedCount,
    clearLastSyncedCount,
  };
}
