export const MARKER_SCRIPTS = `
function wpIcon(idx, total, accent) {
  var bg = idx === 0 ? "#22c55e" : idx === total - 1 ? "#ef4444" : accent;
  var label = idx === 0 ? "P" : idx === total - 1 ? "A" : String(idx);
  return L.divIcon({
    html: "<div style=\\"width:26px;height:26px;border-radius:13px;background:" + bg + ";border:2.5px solid #fff;" +
      "box-shadow:0 2px 6px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;" +
      "font-size:11px;font-weight:700;color:#fff;\\">" + label + "</div>",
    className: "", iconSize: [26,26], iconAnchor: [13,13]
  });
}

function dotIcon(bg) {
  return L.divIcon({
    html: "<div style=\\"width:14px;height:14px;border-radius:7px;background:" + bg + ";border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);\\"></div>",
    className: "", iconSize: [14,14], iconAnchor: [7,7]
  });
}

function getWaypointPin(color, label) {
  return L.divIcon({
    html: "<div style=\\"width:24px;height:24px;border-radius:12px;background:" + color + ";border:2px solid #fff;" +
      "box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;" +
      "font-size:10px;font-weight:700;color:#fff;\\">" + label + "</div>",
    className: "", iconSize: [24, 24], iconAnchor: [12, 12]
  });
}
`;

export const WAYPOINT_TYPE_COLORS: Record<string, string> = {
  start: "#4CAF50",
  stop: "#FF9800",
  poi: "#2196F3",
  end: "#E63946",
};

export function getWaypointColor(type: string): string {
  return WAYPOINT_TYPE_COLORS[type] || "#FF6600";
}
