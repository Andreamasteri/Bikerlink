import { useState, useEffect, useCallback, useRef } from "react";
import {
  loadIndex,
  downloadTilesForRoute,
  deleteTilesForRoute,
  calcBoundingBox,
  estimateDownload,
  tilesBaseDirPath,
  type BoundingBox,
  type OfflineRouteEntry,
  type DownloadEstimate,
} from "@/lib/offline-tiles";

export type OfflineStatus = "none" | "downloading" | "available" | "stale" | "error";

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

function isRouteCoveredByBbox(
  points: Array<{ lat: number; lng: number }>,
  bbox: BoundingBox
): boolean {
  if (!points.length) return true;
  for (const { lat, lng } of points) {
    if (
      lat < bbox.minLat ||
      lat > bbox.maxLat ||
      lng < bbox.minLng ||
      lng > bbox.maxLng
    ) {
      return false;
    }
  }
  return true;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, status]);

  // Re-check whether cached tiles still cover the current polyline whenever
  // the points array reference changes (e.g. after a reroute — including
  // reroutes that produce the same number of points but different geography).
  // If any point falls outside the stored bounding box the tiles are marked
  // "stale" so the UI can warn the rider that offline coverage no longer
  // matches the active route.
  useEffect(() => {
    if (!points.length) return;
    if (status !== "available" && status !== "stale") return;
    if (!entry) return;

    if (!isRouteCoveredByBbox(points, entry.bbox)) {
      setStatus("stale");
    } else if (status === "stale") {
      setStatus("available");
    }
  }, [points, entry, status]);

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
