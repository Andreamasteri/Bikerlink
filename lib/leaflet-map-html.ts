import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';
import { LIVE_MAP_STYLES } from './leaflet/live-map-styles';
import { OMS_BUNDLE } from './leaflet-map-oms';
import { LEAFLET_MAP_BRIDGE_JS } from './leaflet-map-bridge-js';

export const LEAFLET_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>
${LIVE_MAP_STYLES}
</style>
</head>
<body>
<div id="map"></div>
<div id="speed-legend">
  <div id="legend-toggle">SPEED <span id="legend-arrow">&#9660;</span></div>
  <div class="legend-rows">
    <div class="legend-row"><div class="legend-dot" style="background:#4A90D9"></div>&#x1F3D9; City</div>
    <div class="legend-row"><div class="legend-dot" style="background:#E53935"></div>&#x1F6E3; Highway</div>
    <div class="legend-row"><div class="legend-dot" style="background:#43A047"></div>&#x26F0; Mountain</div>
  </div>
</div>
<script>${LEAFLET_JS}</script>
<script>${OMS_BUNDLE}</script>
<script>${LEAFLET_MAP_BRIDGE_JS}</script>
</body>
</html>`;
