/**
 * Dichiarazioni globali Jest/Detox per i test e2e.
 * I file e2e usano il runner Detox (basato su Jest) che inietta questi
 * globali a runtime — qui li dichiariamo solo per il type-checker.
 * Le suite sono marcate `xdescribe` (skip) finché non è disponibile un APK Android.
 */

type DoneFn = () => void;
type AsyncFn = () => void | Promise<void>;

declare function describe(name: string, fn: () => void): void;
declare function xdescribe(name: string, fn: () => void): void;
declare function fdescribe(name: string, fn: () => void): void;

declare function it(name: string, fn: AsyncFn, timeout?: number): void;
declare function xit(name: string, fn: AsyncFn, timeout?: number): void;
declare function fit(name: string, fn: AsyncFn, timeout?: number): void;

declare function beforeAll(fn: AsyncFn, timeout?: number): void;
declare function afterAll(fn: AsyncFn, timeout?: number): void;
declare function beforeEach(fn: AsyncFn, timeout?: number): void;
declare function afterEach(fn: AsyncFn, timeout?: number): void;

declare namespace jest {
  interface Matchers<R> {
    toBe(expected: unknown): R;
    toEqual(expected: unknown): R;
    toBeTruthy(): R;
    toBeFalsy(): R;
    toBeUndefined(): R;
    toBeNull(): R;
    toContain(expected: unknown): R;
    toHaveBeenCalled(): R;
    toHaveBeenCalledWith(...args: unknown[]): R;
    not: Matchers<R>;
  }
}
