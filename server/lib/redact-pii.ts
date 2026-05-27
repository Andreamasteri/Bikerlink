/**
 * Task #2515 — Minimal PII redactor for embedding inputs.
 *
 * Placeholder implementation while #2532 ships the full `server/ai/moderation/redact.ts`.
 * Once #2532 lands, this module should re-export from the canonical location.
 *
 * Redacts: emails, phone numbers (IT + intl), URLs (often profile leaks),
 * IBAN-like strings, long digit sequences that look like cards/CFs.
 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?\d[\s\-.]?){8,}\d/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;
const SOCIAL_HANDLE_RE = /(?:^|\s)@[A-Za-z0-9_.]{3,30}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const CF_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
const LONG_DIGITS_RE = /\b\d{13,19}\b/g;

export function redactPII(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(URL_RE, "[url]")
    .replace(IBAN_RE, "[iban]")
    .replace(CF_RE, "[codice_fiscale]")
    .replace(LONG_DIGITS_RE, "[number]")
    .replace(PHONE_RE, "[phone]")
    .replace(SOCIAL_HANDLE_RE, " [handle]");
}
