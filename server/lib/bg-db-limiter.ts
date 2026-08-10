// Compatibility facade: all background DB jobs must share one governor.
//
// Keep this import path stable for existing consumers, but do not maintain a
// second semaphore here. The previous duplicate implementation had different
// defaults and counters from pool-governor, so auto-fixes and telemetry could
// observe one limiter while jobs used the other.
export * from "./pool-governor";
