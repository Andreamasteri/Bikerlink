import { useState, useEffect } from "react";
import * as Location from "expo-location";
import { emitGpsPosition, subscribeGpsPosition } from "@/lib/shared-gps-position";

interface LocationState {
  userLocation: { latitude: number; longitude: number } | null;
  locationLoading: boolean;
}

export function useLocationWatch(): LocationState {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;

    const unsubscribe = subscribeGpsPosition((coords) => {
      if (cancelled) return;
      setUserLocation(coords);
      setLocationLoading(false);
    });

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === "granted") {
          watchSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
            (loc) => {
              if (cancelled) return;
              const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
              setUserLocation(coords);
              setLocationLoading(false);
              emitGpsPosition(coords);
            }
          );
        } else {
          if (!cancelled) setLocationLoading(false);
        }
      } catch {
        if (!cancelled) setLocationLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      watchSub?.remove();
    };
  }, []);

  return { userLocation, locationLoading };
}
