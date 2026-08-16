import * as Location from "expo-location";

export const TRACKING_BACKGROUND_LOCATION_TASK = "bikerlink-bg-location";

/**
 * Single owner of foreground GPS. Features subscribe to the same native watch
 * instead of opening competing watchPositionAsync subscriptions.
 *
 * The manager deliberately keeps feature callbacks independent: navigation,
 * tracking and telemetry can consume the same fix without sharing mutable
 * feature state or forcing one UI session to own another.
 */
export interface LocationSessionOptions {
  accuracy?: Location.Accuracy;
  timeInterval?: number;
  distanceInterval?: number;
}

type LocationListener = (location: Location.LocationObject) => void;

const DEFAULT_OPTIONS: Required<LocationSessionOptions> = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 5000,
  distanceInterval: 10,
};

function accuracyPriority(accuracy: Location.Accuracy): number {
  switch (accuracy) {
    case Location.Accuracy.BestForNavigation: return 6;
    case Location.Accuracy.Highest: return 5;
    case Location.Accuracy.High: return 4;
    case Location.Accuracy.Balanced: return 3;
    case Location.Accuracy.Low: return 2;
    case Location.Accuracy.Lowest: return 1;
    default: return 3;
  }
}

class LocationSessionManager {
  private listeners = new Map<number, { callback: LocationListener; options: Required<LocationSessionOptions> }>();
  private nextId = 1;
  private nativeWatch: Location.LocationSubscription | null = null;
  private reconcileGeneration = 0;
  private activeOptions: Required<LocationSessionOptions> | null = null;

  subscribe(callback: LocationListener, options: LocationSessionOptions = {}): Location.LocationSubscription {
    const id = this.nextId++;
    this.listeners.set(id, { callback, options: { ...DEFAULT_OPTIONS, ...options } });
    void this.reconcile();

    return {
      remove: () => {
        if (!this.listeners.delete(id)) return;
        void this.reconcile();
      },
    } as Location.LocationSubscription;
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }

  /** Own the canonical ride background task lifecycle. */
  async startBackgroundTask(
    taskName: string,
    options: Parameters<typeof Location.startLocationUpdatesAsync>[1],
  ): Promise<boolean> {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(taskName)) return true;
      await Location.startLocationUpdatesAsync(taskName, options);
      return true;
    } catch (error) {
      console.warn(`[LocationSessionManager] background task start failed: ${taskName}`, error);
      return false;
    }
  }

  async stopBackgroundTask(taskName: string): Promise<void> {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(taskName)) {
        await Location.stopLocationUpdatesAsync(taskName);
      }
    } catch (error) {
      console.warn(`[LocationSessionManager] background task stop failed: ${taskName}`, error);
    }
  }

  async startTrackingBackground(
    options: Parameters<typeof Location.startLocationUpdatesAsync>[1],
  ): Promise<boolean> {
    return this.startBackgroundTask(TRACKING_BACKGROUND_LOCATION_TASK, options);
  }

  async stopTrackingBackground(): Promise<void> {
    return this.stopBackgroundTask(TRACKING_BACKGROUND_LOCATION_TASK);
  }

  /** Retry native acquisition after a permission/app-state transition. */
  refresh(): void {
    void this.reconcile();
  }

  private getRequiredOptions(): Required<LocationSessionOptions> {
    const entries = Array.from(this.listeners.values());
    if (entries.length === 0) return { ...DEFAULT_OPTIONS };
    let selected: Required<LocationSessionOptions> = { ...entries[0].options };
    for (const entry of entries.slice(1)) {
      const candidate = entry.options;
      // One physical watcher must satisfy every logical consumer. Select the
      // strictest accuracy and the shortest requested intervals independently;
      // replacing the whole option object would otherwise lose a faster
      // consumer's interval when a higher-accuracy consumer subscribes later.
      selected = {
        accuracy: accuracyPriority(candidate.accuracy) > accuracyPriority(selected.accuracy)
          ? candidate.accuracy
          : selected.accuracy,
        timeInterval: Math.min(selected.timeInterval, candidate.timeInterval),
        distanceInterval: Math.min(selected.distanceInterval, candidate.distanceInterval),
      };
    }
    return selected;
  }

  private sameOptions(a: Required<LocationSessionOptions> | null, b: Required<LocationSessionOptions>): boolean {
    return !!a && a.accuracy === b.accuracy && a.timeInterval === b.timeInterval && a.distanceInterval === b.distanceInterval;
  }

  private async reconcile(): Promise<void> {
    const generation = ++this.reconcileGeneration;
    if (this.listeners.size === 0) {
      this.nativeWatch?.remove();
      this.nativeWatch = null;
      this.activeOptions = null;
      return;
    }

    const options = this.getRequiredOptions();
    if (this.nativeWatch && this.sameOptions(this.activeOptions, options)) return;

    this.nativeWatch?.remove();
    this.nativeWatch = null;
    this.activeOptions = null;

    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (generation !== this.reconcileGeneration || permission.status !== "granted" || this.listeners.size === 0) return;
      const watch = await Location.watchPositionAsync(options, (location) => {
        for (const { callback } of Array.from(this.listeners.values())) {
          try {
            callback(location);
          } catch (error) {
            // One feature must never tear down GPS delivery for the others.
            console.warn("[LocationSessionManager] listener failed", error);
          }
        }
      });
      if (generation !== this.reconcileGeneration || this.listeners.size === 0) {
        watch.remove();
        return;
      }
      this.nativeWatch = watch;
      this.activeOptions = options;
    } catch (error) {
      console.warn("[LocationSessionManager] foreground watch failed", error);
    }
  }
}

export const locationSessionManager = new LocationSessionManager();
