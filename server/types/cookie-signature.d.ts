/**
 * Type declarations for `cookie-signature` (no @types package available).
 *
 * API reference: https://github.com/visionmedia/node-cookie-signature
 *
 * Sostituisce i `// @ts-ignore` sparsi nei file di autenticazione.
 * Task #570 — Horus patch scan CRITICO fix.
 */

/// <reference types="node" />

declare module "cookie-signature" {
  import type { KeyObject } from "crypto";

  type SecretValue = string | NodeJS.ArrayBufferView | KeyObject;

  /**
   * Sign `val` with `secret`, returning a signed string in the form
   * `"<val>.<hmac-sha256>"`.
   */
  export function sign(val: string, secret: SecretValue): string;

  /**
   * Unsign `input` with `secret`. Returns the original value if the
   * HMAC signature is valid, or `false` if the signature is invalid.
   */
  export function unsign(input: string, secret: SecretValue): string | false;
}
