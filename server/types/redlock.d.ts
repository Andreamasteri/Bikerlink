declare module "redlock" {
  import type { EventEmitter } from "events";
  export interface Lock {
    resources: string[];
    value: string;
    expiration: number;
    release(): Promise<unknown>;
    extend(ttl: number): Promise<Lock>;
  }
  export interface RedlockSettings {
    driftFactor?: number;
    retryCount?: number;
    retryDelay?: number;
    retryJitter?: number;
    automaticExtensionThreshold?: number;
  }
  export default class Redlock extends EventEmitter {
    constructor(clients: unknown[], settings?: RedlockSettings);
    acquire(resources: string[], ttl: number, settings?: Partial<RedlockSettings>): Promise<Lock>;
    release(lock: Lock): Promise<unknown>;
    using<T>(resources: string[], ttl: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T>;
    on(event: "error", listener: (err: Error) => void): this;
  }
}
