const FALLBACK_DEM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const SATELLITE_TILES_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function getDem3dTileUrl(): string {
  return process.env.MAPLIBRE_DEM_URL ?? FALLBACK_DEM_URL;
}

export function get3DInitScript(demUrl: string): string {
  return `
    map.addSource("terrain-dem", {
      type: "raster-dem",
      tiles: [${JSON.stringify(demUrl)}],
      tileSize: 256,
      encoding: "terrarium"
    });
    map.setTerrain({ source: "terrain-dem", exaggeration: 1.5 });
    map.addLayer({
      id: "hillshade-layer",
      type: "hillshade",
      source: "terrain-dem",
      layout: { visibility: "visible" },
      paint: { "hillshade-exaggeration": 0.5 }
    });
    try {
      map.setSky({
        "sky-color": "#199EF3",
        "sky-horizon-blend": 0.5,
        "horizon-color": "#ffffff",
        "horizon-fog-blend": 0.1,
        "fog-color": "#0000ff",
        "fog-ground-blend": 0.9
      });
    } catch(e) {}
    map.setPitch(45);
    map.setBearing(0);
  `;
}

export function get3DBuildingsScript(): string {
  return `
    try {
      var style = map.getStyle();
      var hasVector = style && style.sources && Object.values(style.sources).some(function(s) {
        return s.type === "vector";
      });
      if (hasVector) {
        map.addLayer({
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": "#aaa",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.7
          }
        });
      }
    } catch(e) {}
  `;
}

export function get3DWebGLCheckInlineScript(): string {
  return `(function(){var c=document.createElement("canvas");var gl=c.getContext("webgl")||c.getContext("experimental-webgl");if(!gl){var msg=JSON.stringify({type:"error",message:"webgl-unavailable"});if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(msg);}else{window.parent.postMessage(msg,"*");}}})();`;
}

export function get3DSatelliteTilesUrl(): string {
  return SATELLITE_TILES_URL;
}
