import prettyBytesFn from "pretty-bytes";
import prettyMsFn from "pretty-ms";

export function prettyBytes(n: number | bigint): string {
  if (typeof n === "bigint") return prettyBytesFn(Number(n));
  if (!Number.isFinite(n)) return "0 B";
  return prettyBytesFn(n);
}

export function prettyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  return prettyMsFn(ms);
}

export function memoryRssPretty(): string {
  return prettyBytes(process.memoryUsage().rss);
}
