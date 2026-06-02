import * as FileSystem from "expo-file-system/legacy";

const TILE_CACHE_DIR = "tile-cache/";

function tileCacheBaseDir(): string {
  return (FileSystem.cacheDirectory ?? "") + TILE_CACHE_DIR;
}

function urlToSubPath(url: string): string {
  const match = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:[@][\d]+x)?\.([a-z]+)(?:[?#].*)?$/i);
  if (match) {
    const [, z, x, y, ext] = match;
    return `${z}/${x}/${y}.${ext}`;
  }
  const safe = url.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
  return `misc/${safe}.bin`;
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  } catch { /* ignore */ }
}

export async function readTileCacheAsBase64(url: string): Promise<string | null> {
  try {
    const filePath = tileCacheBaseDir() + urlToSubPath(url);
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      return await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
    }
  } catch { /* ignore */ }
  return null;
}

export async function saveTileToCache(url: string, base64Data: string): Promise<void> {
  try {
    const subPath = urlToSubPath(url);
    const filePath = tileCacheBaseDir() + subPath;
    const dirPath = filePath.substring(0, filePath.lastIndexOf("/") + 1);
    await ensureDir(dirPath);
    await FileSystem.writeAsStringAsync(filePath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch { /* ignore */ }
}

export function getMimeForUrl(url: string): string {
  const ext = url.match(/\.([a-z]+)(?:[?#].*)?$/i)?.[1]?.toLowerCase() ?? "png";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return mimeMap[ext] ?? "image/png";
}

// ─── WebView bridge script ────────────────────────────────────────────────────
// Inject this into map WebViews to enable the tile cache bridge.
// Requires postMsg() to be already defined (via bridge-events scripts).

export const TILE_CACHE_BRIDGE_SCRIPT = `
(function() {
  window.__tileCache = {
    _pending: {},
    respond: function(reqId, dataUri) {
      var cb = this._pending[reqId];
      delete this._pending[reqId];
      if (cb) cb(dataUri);
    },
    fetchWithCache: function(url) {
      var self = this;
      return new Promise(function(resolve, reject) {
        var reqId = 'tc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        self._pending[reqId] = function(dataUri) {
          if (dataUri) {
            try {
              var base64 = dataUri.split(',')[1];
              if (!base64) { resolve(null); return; }
              var binary = atob(base64);
              var len = binary.length;
              var bytes = new Uint8Array(len);
              for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
              resolve(bytes.buffer);
            } catch(e) { resolve(null); }
          } else {
            fetch(url)
              .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
              })
              .then(function(buf) {
                try {
                  var bytes2 = new Uint8Array(buf);
                  var chunks = [];
                  var CHUNK = 8192;
                  for (var j = 0; j < bytes2.length; j += CHUNK) {
                    chunks.push(String.fromCharCode.apply(null, Array.from(bytes2.subarray(j, Math.min(j + CHUNK, bytes2.length)))));
                  }
                  var b64 = btoa(chunks.join(''));
                  postMsg({ type: 'tileSave', url: url, dataB64: b64 });
                } catch(_e) {}
                resolve(buf);
              })
              .catch(function(err) { reject(err); });
          }
        };
        postMsg({ type: 'tileCheck', url: url, reqId: reqId });
      });
    }
  };
})();
`;

// MapLibre: register the rncache:// protocol handler.
// Must be called AFTER maplibregl is loaded, BEFORE the map is created.
export const MAPLIBRE_TILE_CACHE_PROTOCOL_SCRIPT = `
maplibregl.addProtocol('rncache', function(params, callback) {
  var realUrl = params.url.replace(/^rncache:\\/\\//, 'https://');
  window.__tileCache.fetchWithCache(realUrl)
    .then(function(buf) {
      if (buf) {
        callback(null, buf, null, null);
      } else {
        fetch(realUrl)
          .then(function(r) { return r.arrayBuffer(); })
          .then(function(b) { callback(null, b, null, null); })
          .catch(function(e) { callback(new Error(String(e))); });
      }
    })
    .catch(function(err) { callback(new Error(String(err))); });
  return { cancel: function() {} };
});
`;

// Apply rncache:// protocol to a MapLibre style object's tile sources.
// Returns the modified style if it is a raster style object, otherwise unchanged.
export function applyRnCacheToStyle(style: unknown): unknown {
  if (typeof style !== "object" || style === null) return style;
  const s = style as Record<string, unknown>;
  if (!s.sources || typeof s.sources !== "object") return style;
  const cloned = JSON.parse(JSON.stringify(style)) as Record<string, unknown>;
  const sources = cloned.sources as Record<string, { tiles?: string[] }>;
  for (const src of Object.values(sources)) {
    if (Array.isArray(src.tiles)) {
      src.tiles = src.tiles.map((t: string) =>
        t.replace(/^https:\/\//, "rncache://")
      );
    }
  }
  return cloned;
}
