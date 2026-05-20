import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadIndex,
  downloadTilesForRoute,
  deleteTilesForRoute,
  calcBoundingBox,
  estimateDownload,
  tilesBaseDirPath,
  type OfflineRouteEntry,
  type DownloadEstimate,
} from "@/lib/offline-tiles";

export type OfflineStatus = "none" | "downloading" | "available" | "error";

export interface UseOfflineTilesResult {
  status: OfflineStatus;
  progress: number;
  total: number;
  estimate: DownloadEstimate | null;
  entry: OfflineRouteEntry | null;
  offlineTileBasePath: string | null;
  startDownload: () => Promise<void>;
  cancelDownload: () => void;
  deleteOffline: () => Promise<void>;
}

export function useOfflineTiles(
  routeId: string | undefined,
  routeTitle: string,
  points: Array<{ lat: number; lng: number }>
): UseOfflineTilesResult {
  const [status, setStatus] = useState<OfflineStatus>("none");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [entry, setEntry] = useState<OfflineRouteEntry | null>(null);
  const [estimate, setEstimate] = useState<DownloadEstimate | null>(null);
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    if (!routeId) return;
    (async () => {
      const index = await loadIndex();
      const e = index[routeId] ?? null;
      setEntry(e);
      setStatus(e ? "available" : "none");
    })();
  }, [routeId]);

  useEffect(() => {
    if (!points.length || status !== "none") return;
    const bbox = calcBoundingBox(points);
    setEstimate(estimateDownload(bbox));
  }, [points.length, status]);

  const startDownload = useCallback(async () => {
    if (!routeId || !points.length) return;
    cancelRef.current = { cancelled: false };
    setStatus("downloading");
    setProgress(0);
    try {
      await downloadTilesForRoute(
        routeId,
        routeTitle,
        points,
        (dl, tot) => {
          setProgress(dl);
          setTotal(tot);
        },
        cancelRef.current
      );
      if (!cancelRef.current.cancelled) {
        const index = await loadIndex();
        const e = index[routeId] ?? null;
        setEntry(e);
        setStatus("available");
        setEstimate(null);
      } else {
        setStatus("none");
        setProgress(0);
        setTotal(0);
      }
    } catch {
      setStatus("error");
    }
  }, [routeId, routeTitle, points]);

  const cancelDownload = useCallback(() => {
    cancelRef.current.cancelled = true;
    setStatus("none");
    setProgress(0);
    setTotal(0);
  }, []);

  const deleteOffline = useCallback(async () => {
    if (!routeId) return;
    await deleteTilesForRoute(routeId);
    setEntry(null);
    setStatus("none");
    const bbox = calcBoundingBox(points);
    setEstimate(estimateDownload(bbox));
  }, [routeId, points]);

  const offlineTileBasePath =
    status === "available" ? tilesBaseDirPath() : null;

  return {
    status,
    progress,
    total,
    estimate,
    entry,
    offlineTileBasePath,
    startDownload,
    cancelDownload,
    deleteOffline,
  };
}
