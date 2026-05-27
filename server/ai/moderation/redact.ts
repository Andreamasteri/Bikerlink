// Task #2532 — PII redactor obbligatorio prima di ogni chiamata al provider AI.
// Maschera email, telefoni, URL, IBAN, codici fiscali, GPS precisi e numeri carta.
// Coverage testata su >30 esempi reali italiani.

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Telefono internazionale o IT (almeno 8 cifre, opz. prefisso +, spazi, trattini, punti).
const PHONE_RE = /(?:\+?\d[\s\-.]?){8,}\d/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;
const SOCIAL_HANDLE_RE = /(?:^|\s)@[A-Za-z0-9_.]{3,30}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const CF_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi;
const LONG_DIGITS_RE = /\b\d{13,19}\b/g;
// Coordinate GPS precise (lat,lng con >=4 decimali) — euristica.
const GPS_RE = /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g;

export interface RedactionStats {
  email: number;
  phone: number;
  url: number;
  handle: number;
  iban: number;
  cf: number;
  longDigits: number;
  gps: number;
}

export interface RedactResult {
  text: string;
  stats: RedactionStats;
  redactedAny: boolean;
}

function makeStats(): RedactionStats {
  return { email: 0, phone: 0, url: 0, handle: 0, iban: 0, cf: 0, longDigits: 0, gps: 0 };
}

export function redactPII(input: string | null | undefined): string {
  return redactPIIWithStats(input ?? "").text;
}

export function redactPIIWithStats(input: string | null | undefined): RedactResult {
  const stats = makeStats();
  if (!input) return { text: "", stats, redactedAny: false };
  let text = String(input);
  text = text.replace(EMAIL_RE, () => { stats.email++; return "***@***.***"; });
  text = text.replace(URL_RE, () => { stats.url++; return "[url-redacted]"; });
  text = text.replace(GPS_RE, () => { stats.gps++; return "coord(redacted)"; });
  text = text.replace(IBAN_RE, () => { stats.iban++; return "[iban-redacted]"; });
  text = text.replace(CF_RE, () => { stats.cf++; return "[cf-redacted]"; });
  text = text.replace(LONG_DIGITS_RE, () => { stats.longDigits++; return "[num-redacted]"; });
  text = text.replace(PHONE_RE, () => { stats.phone++; return "[phone-redacted]"; });
  text = text.replace(SOCIAL_HANDLE_RE, () => { stats.handle++; return " [handle-redacted]"; });
  const redactedAny = Object.values(stats).some((n) => n > 0);
  return { text, stats, redactedAny };
}

// Maschera ricorsivamente i campi stringa di un oggetto (per i tool/context AI).
export function redactObject<T>(obj: T): T {
  if (obj == null) return obj;
  if (typeof obj === "string") return redactPII(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map((v) => redactObject(v)) as unknown as T;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // Lasciamo passare numeri/booleani/date; mascheriamo stringhe e oggetti annidati.
      out[k] = redactObject(v);
    }
    return out as T;
  }
  return obj;
}
