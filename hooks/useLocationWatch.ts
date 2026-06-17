import { useLocationGate } from "@/lib/location-context";

interface LocationState {
  userLocation: { latitude: number; longitude: number } | null;
  locationLoading: boolean;
}

export function useLocationWatch(): LocationState {
  const { currentPosition, positionLoading } = useLocationGate();

  return {
    userLocation: currentPosition,
    locationLoading: positionLoading,
  };
}
