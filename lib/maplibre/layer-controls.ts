import { buildCommand } from "./bridge-events";
import { get3DSatelliteTilesUrl } from "./style-3d";

export function buildEnableTerrainCmd(): string {
  return buildCommand("enableTerrain");
}

export function buildDisableTerrainCmd(): string {
  return buildCommand("disableTerrain");
}

export function buildToggleHillshadeCmd(visible: boolean): string {
  return buildCommand("toggleHillshade", visible);
}

export function buildToggleSatelliteCmd(visible: boolean): string {
  return buildCommand("toggleSatellite", visible);
}

export function get3DBridgeHandlersScript(): string {
  const satelliteUrl = get3DSatelliteTilesUrl();
  return `
    window.mlBridge.enableTerrain = function() {
      if (map.getSource("terrain-dem")) {
        map.setTerrain({ source: "terrain-dem", exaggeration: 1.5 });
      }
    };
    window.mlBridge.disableTerrain = function() {
      map.setTerrain(null);
      map.setPitch(0);
    };
    window.mlBridge.toggleHillshade = function(payload) {
      var vis = payload ? "visible" : "none";
      if (map.getLayer("hillshade-layer")) {
        map.setLayoutProperty("hillshade-layer", "visibility", vis);
      }
    };
    window.mlBridge.toggleSatellite = function(payload) {
      if (payload) {
        if (!map.getSource("satellite-tiles")) {
          map.addSource("satellite-tiles", {
            type: "raster",
            tiles: [${JSON.stringify(satelliteUrl)}],
            tileSize: 256
          });
        }
        if (!map.getLayer("satellite-layer")) {
          var firstLayer = map.getStyle().layers[0];
          var beforeId = firstLayer ? firstLayer.id : undefined;
          map.addLayer(
            { id: "satellite-layer", type: "raster", source: "satellite-tiles" },
            beforeId
          );
        }
      } else {
        if (map.getLayer("satellite-layer")) {
          map.removeLayer("satellite-layer");
        }
      }
    };
  `;
}
