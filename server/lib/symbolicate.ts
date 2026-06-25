import { SourceMapConsumer, type RawSourceMap } from "source-map";
import { downloadBuffer, objectExists } from "../objectStorage";

interface CachedConsumer {
  consumer: SourceMapConsumer;
  cachedAt: number;
}

const _cache = new Map<number, CachedConsumer>();
const _CACHE_TTL_MS = 10 * 60 * 1000;
const _CACHE_MAX = 5;
const _DOWNLOAD_TIMEOUT_MS = 2500;

function _extractOtaNumber(appVersion: string): number | null {
  const m = appVersion.match(/\.(\d+)$/) ?? appVersion.match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

async function _getConsumer(otaNumber: number): Promise<SourceMapConsumer | null> {
  const cached = _cache.get(otaNumber);
  if (cached && Date.now() - cached.cachedAt < _CACHE_TTL_MS) {
    return cached.consumer;
  }

  const key = `source-maps/ota-${otaNumber}.map`;
  try {
    const exists = await objectExists(key);
    if (!exists) return null;

    const buf = await downloadBuffer(key);
    const raw = JSON.parse(buf.toString("utf8")) as RawSourceMap;
    const consumer = new SourceMapConsumer(raw);

    if (_cache.size >= _CACHE_MAX) {
      const oldest = _cache.keys().next().value;
      if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(otaNumber, { consumer, cachedAt: Date.now() });
    return consumer;
  } catch (err) {
    console.warn(
      `[symbolicate] source map ota-${otaNumber} non disponibile:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

const _BUNDLE_FRAME_RE = /(?:index\.js|bundle\.js|index\.bundle)[^:]*:(\d+):(\d+)/;

export async function symbolicateStack(
  stack: string,
  appVersion: string
): Promise<string> {
  const otaNumber = _extractOtaNumber(appVersion);
  if (!otaNumber) return stack;

  let consumer: SourceMapConsumer | null = null;
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), _DOWNLOAD_TIMEOUT_MS)
    );
    consumer = await Promise.race([_getConsumer(otaNumber), timeout]);
  } catch {
    return stack;
  }
  if (!consumer) return stack;

  try {
    const lines = stack.split("\n");
    const symbolicated = lines.map((line) => {
      const m = line.match(_BUNDLE_FRAME_RE);
      if (!m) return line;

      const pos = consumer!.originalPositionFor({
        line: parseInt(m[1], 10),
        column: parseInt(m[2], 10),
      });

      if (pos.source && pos.line != null) {
        const srcShort = pos.source.replace(
          /^.*\/(app|components|hooks|shared|lib|constants|server)\//,
          "$1/"
        );
        const fnSuffix = pos.name ? ` [${pos.name}]` : "";
        return line.replace(
          _BUNDLE_FRAME_RE,
          `${srcShort}:${pos.line}:${pos.column ?? 0}${fnSuffix}`
        );
      }
      return line;
    });
    return symbolicated.join("\n");
  } catch {
    return stack;
  }
}
