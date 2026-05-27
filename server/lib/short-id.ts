import { customAlphabet, nanoid } from "nanoid";

const URL_SAFE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const shortAlpha = customAlphabet(URL_SAFE_ALPHABET, 10);

export function shortId(size = 10): string {
  return size === 10 ? shortAlpha() : customAlphabet(URL_SAFE_ALPHABET, size)();
}

export function feedbackId(): string {
  return `fb_${shortAlpha()}`;
}

export function suggestionId(): string {
  return `sg_${shortAlpha()}`;
}

export function abTestId(): string {
  return `ab_${shortAlpha()}`;
}

export { nanoid };
