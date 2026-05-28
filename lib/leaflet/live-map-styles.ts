export const LIVE_MAP_STYLES = `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
.labels-hidden .nick-label { display: none !important; }
.spiderified .nick-label { display: none !important; }
#speed-legend {
  position: absolute;
  bottom: 28px;
  left: 8px;
  z-index: 1000;
  background: rgba(20,20,20,0.86);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 10px;
  padding: 4px 9px;
  display: none;
  flex-direction: column;
  gap: 3px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.55);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
#speed-legend.visible { display: flex; }
#speed-legend.collapsed .legend-rows { display: none; }
#legend-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 9px;
  color: rgba(255,255,255,0.55);
  font-weight: 700;
  letter-spacing: 0.6px;
  padding: 2px 0 1px;
}
#legend-arrow { font-size: 8px; display: inline-block; transition: transform 0.15s; }
#speed-legend.collapsed #legend-arrow { transform: rotate(-90deg); }
.legend-rows { display: flex; flex-direction: column; gap: 3px; padding-bottom: 3px; }
.legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #f0f0f0;
  font-weight: 600;
  white-space: nowrap;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 5px;
  flex-shrink: 0;
  border: 1.5px solid rgba(255,255,255,0.55);
}
@keyframes bl-pulse-ring {
  0%   { transform: scale(0.2); opacity: 0.9; }
  100% { transform: scale(3.5); opacity: 0; }
}
.bl-pulse-ring {
  width: 44px; height: 44px; border-radius: 50%;
  border: 3px solid #FF6600;
  animation: bl-pulse-ring 0.7s ease-out forwards;
  pointer-events: none;
}
.bl-pulse-ring-2 {
  width: 44px; height: 44px; border-radius: 50%;
  border: 3px solid #FF6600;
  animation: bl-pulse-ring 0.7s ease-out 0.25s forwards;
  pointer-events: none;
  opacity: 0;
}
.bl-pulse-ring-3 {
  width: 44px; height: 44px; border-radius: 50%;
  border: 3px solid #FF6600;
  animation: bl-pulse-ring 0.7s ease-out 0.5s forwards;
  pointer-events: none;
  opacity: 0;
}`;
