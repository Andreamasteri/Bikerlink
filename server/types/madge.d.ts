/**
 * Type declarations for `madge` (no @types package available).
 *
 * API reference: https://github.com/pahen/madge
 *
 * Sostituisce il `// @ts-ignore` nel circular-imports integrity check.
 * Task #638 — Horus patch scan MEDIO fix.
 */

declare module "madge" {
  interface MadgeOptions {
    fileExtensions?: string[];
    excludeRegExp?: RegExp[];
    tsConfig?: string;
    detectiveOptions?: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface MadgeInstance {
    /** Returns an array of cycles (each cycle is an ordered list of module paths). */
    circular(): string[][];
  }

  /**
   * Analyse `src` for circular dependencies.
   * @param src  A file/directory path or an array of paths to analyse.
   * @param opts Optional madge configuration.
   */
  function madge(src: string | string[], opts?: MadgeOptions): Promise<MadgeInstance>;

  export = madge;
}
