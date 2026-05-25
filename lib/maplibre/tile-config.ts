const MAPLIBRE_API_KEY = (process.env.EXPO_PUBLIC_MAPLIBRE_API_KEY ?? "").trim();
const MAPLIBRE_TILE_URL = (process.env.EXPO_PUBLIC_MAPLIBRE_TILE_URL ?? "").trim();

const MAPLIBRE_CDN_VERSION = "5.24.0";

export const MAPLIBRE_GL_JS_CDN = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_CDN_VERSION}/dist/maplibre-gl.min.js`;
export const MAPLIBRE_GL_CSS_CDN = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_CDN_VERSION}/dist/maplibre-gl.css`;

/**
 * Returns a MapLibre GL style URL or inline style JSON string.
 *
 * Priority:
 *  1. EXPO_PUBLIC_MAPLIBRE_TILE_URL  — custom URL (full style JSON or XYZ raster template)
 *  2. EXPO_PUBLIC_MAPLIBRE_API_KEY   — MapTiler streets-v2 vector tiles
 *  3. Default: raster Carto Dark tiles via inline style JSON (no API key needed)
 */
function isXYZTemplate(url: string): boolean {
  return url.includes("{z}") || (url.includes("{x}") && url.includes("{y}"));
}

function xyzTemplateToStyleJson(tileUrl: string, darkMode: boolean): string {
  return JSON.stringify({
    version: 8,
    sources: {
      "custom-tiles": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": darkMode ? "#1a1a1a" : "#f5f5f5" },
      },
      {
        id: "custom-tiles",
        type: "raster",
        source: "custom-tiles",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  });
}

export function getMapLibreStyleJson(darkMode: boolean = true): string {
  if (MAPLIBRE_TILE_URL.length > 0) {
    if (isXYZTemplate(MAPLIBRE_TILE_URL)) {
      return xyzTemplateToStyleJson(MAPLIBRE_TILE_URL, darkMode);
    }
    if (MAPLIBRE_TILE_URL.startsWith("{") || MAPLIBRE_TILE_URL.startsWith("http")) {
      return MAPLIBRE_TILE_URL;
    }
  }

  if (MAPLIBRE_API_KEY.length > 0) {
    return `https://api.maptiler.com/maps/streets-v2${darkMode ? "-dark" : ""}/style.json?key=${MAPLIBRE_API_KEY}`;
  }

  return "https://demotiles.maplibre.org/style.json";
}

/**
 * Emergency raster fallback style — used only when demotiles are unavailable.
 * Returns a Carto raster style JSON string (no API key required).
 */
export function getMapLibreRasterFallbackStyleJson(darkMode: boolean = true): string {
  const tileUrl = darkMode
    ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    : "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

  return JSON.stringify({
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution: "© OpenStreetMap, © CARTO",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": darkMode ? "#1a1a1a" : "#f5f5f5" },
      },
      {
        id: "raster-tiles",
        type: "raster",
        source: "raster-tiles",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  });
}

export function getMapLibreApiKey(): string {
  return MAPLIBRE_API_KEY;
}
