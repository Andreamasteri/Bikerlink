import { findTileProvider } from "../maps/tile-providers";
import { buildMapLibreStyle } from "./tile-config";

export type MapStyleId = "day" | "night" | "satellite";

export interface MapStylePreset {
  id: MapStyleId;
  label: string;
  icon: string;
  tileUrl: string;
  maxZoom: number;
}

function urlOf(id: string): { url: string; maxZoom: number } {
  const p = findTileProvider(id);
  return p
    ? { url: p.urlTemplate, maxZoom: p.maxZoom }
    : { url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", maxZoom: 19 };
}

const day = urlOf("carto-light");
const night = urlOf("carto-dark");
const satellite = urlOf("esri-worldimagery");

export const MAP_STYLE_PRESETS: Record<MapStyleId, MapStylePreset> = {
  day: {
    id: "day",
    label: "Giorno",
    icon: "sunny",
    tileUrl: day.url,
    maxZoom: day.maxZoom,
  },
  night: {
    id: "night",
    label: "Notte",
    icon: "moon",
    tileUrl: night.url,
    maxZoom: night.maxZoom,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    icon: "globe-outline",
    tileUrl: satellite.url,
    maxZoom: satellite.maxZoom,
  },
};

export function buildStyleExpr(id: MapStyleId): string {
  const preset = MAP_STYLE_PRESETS[id];
  return JSON.stringify(buildMapLibreStyle(preset.tileUrl, preset.maxZoom));
}
