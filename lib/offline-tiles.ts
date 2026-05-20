import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_ZOOM = 8;
const MAX_ZOOM = 15;
const CONCURRENCY = 6;
const TILE_URL_TEMPLATE = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const OFFLINE_TILES_DIR = "offline-tiles/";
const INDEX_STORAGE_KEY = "@bikerlink/offline-tiles-index";
const ESTIMATED_TILE_BYTES = 12_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface OfflineRouteEntry {
  routeId: string;
  title: string;
  bbox: BoundingBox;
  tileCount: number;
  downloadedAt: string;
  bytesEstimated: number;
}

export interface OfflineTilesIndex {
  [routeId: string]: OfflineRouteEntry;
}

export interface DownloadEstimate {
  tileCount: number;
  estimatedMB: number;
}

// ─── Tile math ────────────────────────────────────────────────────────────────

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

export function calcBoundingBox(
  points: Array<{ lat: number; lng: number }>,
  paddingDeg = 0.05
): BoundingBox {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - paddingDeg,
    maxLat: Math.max(...lats) + paddingDeg,
    minLng: Math.min(...lngs) - paddingDeg,
    maxLng: Math.max(...lngs) + paddingDeg,
  };
}

export function enumerateTiles(bbox: BoundingBox): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const xMin = lngToTileX(bbox.minLng, z);
    const xMax = lngToTileX(bbox.maxLng, z);
    const yMin = latToTileY(bbox.maxLat, z);
    const yMax = latToTileY(bbox.minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

export function estimateDownload(bbox: BoundingBox): DownloadEstimate {
  const tiles = enumerateTiles(bbox);
  const tileCount = tiles.length;
  const estimatedMB = (tileCount * ESTIMATED_TILE_BYTES) / 1_000_000;
  return { tileCount, estimatedMB };
}

// ─── File system helpers ──────────────────────────────────────────────────────

function tilesBaseDir(): string {
  return (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "") + OFFLINE_TILES_DIR;
}

export function tileFilePath(z: number, x: number, y: number): string {
  return tilesBaseDir() + `${z}/${x}/${y}.png`;
}

export function tilesBaseDirPath(): string {
  return tilesBaseDir();
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

function tileUrl(z: number, x: number, y: number): string {
  return TILE_URL_TEMPLATE.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

// ─── Index management ─────────────────────────────────────────────────────────

export async function loadIndex(): Promise<OfflineTilesIndex> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OfflineTilesIndex;
  } catch {
    return {};
  }
}

async function saveIndex(index: OfflineTilesIndex): Promise<void> {
  await AsyncStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index));
}

// ─── Download ────────────────────────────────────────────────────────────────

export type ProgressCallback = (downloaded: number, total: number) => void;

export async function downloadTilesForRoute(
  routeId: string,
  routeTitle: string,
  points: Array<{ lat: number; lng: number }>,
  onProgress: ProgressCallback,
  signal?: { cancelled: boolean }
): Promise<void> {
  const bbox = calcBoundingBox(points);
  const tiles = enumerateTiles(bbox);
  const total = tiles.length;
  let downloaded = 0;

  await ensureDir(tilesBaseDir());

  const processChunk = async (chunk: TileCoord[]): Promise<void> => {
    await Promise.all(
      chunk.map(async ({ z, x, y }) => {
        if (signal?.cancelled) return;
        try {
          const destDir = tilesBaseDir() + `${z}/${x}/`;
          await ensureDir(destDir);
          const dest = destDir + `${y}.png`;
          const info = await FileSystem.getInfoAsync(dest);
          if (!info.exists) {
            await FileSystem.downloadAsync(tileUrl(z, x, y), dest);
          }
        } catch {
          // Skip failed tiles silently — partial offline cache is still useful
        } finally {
          downloaded++;
          onProgress(downloaded, total);
        }
      })
    );
  };

  for (let i = 0; i < tiles.length; i += CONCURRENCY) {
    if (signal?.cancelled) return;
    await processChunk(tiles.slice(i, i + CONCURRENCY));
  }

  if (!signal?.cancelled) {
    const index = await loadIndex();
    index[routeId] = {
      routeId,
      title: routeTitle,
      bbox,
      tileCount: total,
      downloadedAt: new Date().toISOString(),
      bytesEstimated: total * ESTIMATED_TILE_BYTES,
    };
    await saveIndex(index);
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTilesForRoute(routeId: string): Promise<void> {
  const index = await loadIndex();
  if (!index[routeId]) return;

  const { bbox } = index[routeId];
  const base = tilesBaseDir();

  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const xMin = lngToTileX(bbox.minLng, z);
    const xMax = lngToTileX(bbox.maxLng, z);
    const yMin = latToTileY(bbox.maxLat, z);
    const yMax = latToTileY(bbox.minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        try {
          const filePath = base + `${z}/${x}/${y}.png`;
          const info = await FileSystem.getInfoAsync(filePath);
          if (info.exists) await FileSystem.deleteAsync(filePath, { idempotent: true });
        } catch {
          // Ignore
        }
      }
    }
  }

  delete index[routeId];
  await saveIndex(index);
}

export async function deleteAllOfflineTiles(): Promise<void> {
  try {
    const base = tilesBaseDir();
    const info = await FileSystem.getInfoAsync(base);
    if (info.exists) {
      await FileSystem.deleteAsync(base, { idempotent: true });
    }
  } catch {
    // Ignore
  }
  await AsyncStorage.removeItem(INDEX_STORAGE_KEY);
}

export async function getRouteTilesDirSize(routeId: string): Promise<number> {
  const index = await loadIndex();
  const entry = index[routeId];
  if (!entry) return 0;
  return entry.bytesEstimated;
}
