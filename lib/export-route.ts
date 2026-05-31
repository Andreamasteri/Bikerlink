export interface ExportWaypoint {
  lat: number;
  lng: number;
  name?: string;
}

export function generateGpx(
  title: string,
  waypoints: ExportWaypoint[],
  trackPoints: [number, number][]
): string {
  const now = new Date().toISOString();
  const trkpts = trackPoints
    .map(([lat, lng]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
    .join("\n");
  const wpts = waypoints
    .map((wp, i) => `  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}"><name>${escapeXml(wp.name ?? `Tappa ${i + 1}`)}</name></wpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BikerLink" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(title)}</name>
    <time>${now}</time>
  </metadata>
${wpts}
  <trk>
    <name>${escapeXml(title)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export function generateKml(
  title: string,
  waypoints: ExportWaypoint[],
  trackPoints: [number, number][]
): string {
  const now = new Date().toISOString();
  const wptPlacemarks = waypoints
    .map((wp, i) => `    <Placemark>
      <name>${escapeXml(wp.name ?? `Tappa ${i + 1}`)}</name>
      <Point>
        <coordinates>${wp.lng.toFixed(6)},${wp.lat.toFixed(6)},0</coordinates>
      </Point>
    </Placemark>`)
    .join("\n");
  const coords = trackPoints
    .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)},0`)
    .join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(title)}</name>
    <description>Esportato da BikerLink</description>
    <TimeStamp><when>${now}</when></TimeStamp>
${wptPlacemarks}
    <Placemark>
      <name>${escapeXml(title)}</name>
      <Style>
        <LineStyle>
          <color>FF0000FF</color>
          <width>4</width>
        </LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
