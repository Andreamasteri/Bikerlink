export const MAP_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }

#curvature-legend {
  position: absolute; bottom: 36px; right: 8px;
  background: rgba(0,0,0,0.72); border-radius: 8px;
  padding: 6px 9px; z-index: 2000; pointer-events: none;
  font-family: -apple-system, sans-serif;
  display: none;
}
#curvature-legend.visible { display: block; }
#curvature-legend-title {
  font-size: 9px; color: #aaa; text-transform: uppercase;
  letter-spacing: 0.5px; margin-bottom: 5px;
}
.cv-row {
  display: flex; align-items: center; margin-bottom: 3px;
}
.cv-row:last-child { margin-bottom: 0; }
.cv-dot {
  width: 22px; height: 4px; border-radius: 2px;
  margin-right: 6px; flex-shrink: 0;
}
.cv-label {
  font-size: 10px; color: #e5e5e5; white-space: nowrap;
}
#tap-hint {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.72); color: #ccc; font-size: 11px;
  padding: 5px 10px; border-radius: 20px; z-index: 2000;
  pointer-events: none; white-space: nowrap;
  font-family: -apple-system, sans-serif;
}
@keyframes dir-flow {
  from { stroke-dashoffset: 24; }
  to   { stroke-dashoffset: 0; }
}
.dir-arrow-path {
  animation: dir-flow 0.7s linear infinite;
}

.speed-legend {
  position: absolute;
  bottom: 20px;
  left: 10px;
  background: rgba(0,0,0,0.72);
  border-radius: 8px;
  padding: 7px 10px;
  z-index: 1000;
  font-family: sans-serif;
  pointer-events: none;
}
.speed-legend-title {
  font-size: 9px;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}
.speed-legend-row {
  display: flex;
  align-items: center;
  margin-bottom: 3px;
}
.speed-legend-row:last-child { margin-bottom: 0; }
.speed-legend-dot {
  width: 14px;
  height: 4px;
  border-radius: 2px;
  margin-right: 6px;
  flex-shrink: 0;
}
.speed-legend-label {
  font-size: 10px;
  color: #e5e5e5;
  white-space: nowrap;
}
`;

export const CURVATURE_LEGEND_HTML = `
<div id="curvature-legend">
  <div id="curvature-legend-title">Curvatura</div>
  <div class="cv-row"><div class="cv-dot" style="background:#22c55e"></div><span class="cv-label">Rettilineo</span></div>
  <div class="cv-row"><div class="cv-dot" style="background:#eab308"></div><span class="cv-label">Curvilinea</span></div>
  <div class="cv-row"><div class="cv-dot" style="background:#ef4444"></div><span class="cv-label">Curve strette</span></div>
</div>
`;

export const TAP_HINT_HTML = `<div id="tap-hint">Tocca la mappa per aggiungere una tappa</div>`;
