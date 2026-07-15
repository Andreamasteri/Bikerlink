/**
 * Helper puri per admin-whisper-config.ts
 * Estratti per rispettare il limite 600 righe.
 */

export function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw.slice(0, 60);
  }
}

/** Genera un file WAV silenzioso minimale (0.5s, mono 16kHz, 16-bit PCM). */
export function buildSilentWav(): Buffer {
  const sampleRate = 16000;
  const durationSec = 0.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize, 0);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

/** Genera un file M4A minimale valido (solo ftyp box). */
export function buildMinimalM4a(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x14,
    0x66, 0x74, 0x79, 0x70,
    0x4d, 0x34, 0x41, 0x20,
    0x00, 0x00, 0x00, 0x00,
    0x4d, 0x34, 0x41, 0x20,
  ]);
}

export interface FormatProbeResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
  text?: string;
  body_raw?: string;
}

/** Invia un file audio a /inference e ritorna il risultato con latenza. */
export async function probeHomeFormat(
  logId: string,
  endpoint: string,
  headers: Record<string, string>,
  buf: Buffer,
  mime: string,
  filename: string,
  timeoutMs: number,
): Promise<FormatProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  console.log(`[whisper-test/${logId}] home→fetch url="${safeUrl(endpoint)}" mime="${mime}" timeout=${timeoutMs}ms`);
  try {
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
    formData.append("response_format", "json");
    const r = await fetch(endpoint, { method: "POST", headers, body: formData, signal: controller.signal });
    const latency_ms = Date.now() - t0;
    const contentType = r.headers.get("content-type") ?? "unknown";
    const rawText = await r.text().catch(() => "");
    const bodyPreview = rawText.slice(0, 300);
    console.log(`[whisper-test/${logId}] home→response status=${r.status} content-type="${contentType}" latency=${latency_ms}ms body_preview="${bodyPreview}"`);
    if (!r.ok) {
      return { ok: false, latency_ms, error: `HTTP ${r.status}: ${rawText}`.slice(0, 200), body_raw: bodyPreview };
    }
    let data: { text?: string };
    try {
      data = JSON.parse(rawText) as { text?: string };
    } catch  {
      console.log(`[whisper-test/${logId}] home→PARSE_FAIL body="${bodyPreview}"`);
      return { ok: false, latency_ms, error: `Risposta non-JSON: ${rawText.slice(0, 200)}`, body_raw: bodyPreview };
    }
    const text = (data.text ?? "").trim().slice(0, 200);
    if (text) console.log(`[whisper-test/${logId}] home→transcribed text="${text.slice(0, 100)}"`);
    return { ok: true, latency_ms, text, body_raw: bodyPreview };
  } catch (e) {
    const latency_ms = Date.now() - t0;
    const errMsg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    console.log(`[whisper-test/${logId}] home→exception latency=${latency_ms}ms err="${errMsg}"`);
    return { ok: false, latency_ms, error: errMsg };
  } finally {
    clearTimeout(timer);
  }
}
