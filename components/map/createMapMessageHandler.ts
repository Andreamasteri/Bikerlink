import { sendStartupBeacon } from "@/lib/startup-beacon";
import type { WebViewMessageEvent } from "react-native-webview";
import type { MapUser, MapEasterEgg, ClubMapPin } from "@/components/map/map-types";

interface MapMessageHandlerOptions {
  users: MapUser[];
  clubPins: ClubMapPin[];
  easterEggs: MapEasterEgg[];
  onUserPress?: (user: MapUser) => void;
  onClubPress?: (club: ClubMapPin) => void;
  onEventPress?: (id: string) => void;
  onEasterEggPress?: (egg: MapEasterEgg) => void;
  onHazardPress?: (id: string) => void;
  onVesselPress?: (mmsi: string) => void;
  onReady?: () => void;
  onRegionChangeComplete?: (coords: { latitude: number; longitude: number }) => void;
  onViewStateChange?: (state: {
    zoom: number;
    minZoom: number;
    maxZoom: number;
    lat: number;
    lng: number;
  }) => void;
  setMapReady: (ready: boolean) => void;
  onMapReadyEpoch?: () => void;
  onMapInitError?: (error: string) => void;
}

export function createMapMessageHandler(opts: MapMessageHandlerOptions) {
  return function handleMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        lat?: number;
        lng?: number;
        zoom?: number;
        minZoom?: number;
        maxZoom?: number;
        markerType?: string;
        id?: string;
        omsReady?: boolean;
        nearbyDistance?: number;
        error?: string;
      };

      if (msg.type === "viewState" && msg.zoom != null) {
        opts.onViewStateChange?.({
          zoom: msg.zoom,
          minZoom: msg.minZoom ?? 0,
          maxZoom: msg.maxZoom ?? 19,
          lat: msg.lat ?? 0,
          lng: msg.lng ?? 0,
        });
      } else if (msg.type === "mapInitError") {
        const errMsg = typeof msg.error === "string" ? msg.error : "unknown";
        console.warn("[InteractiveMap] mapInitError:", errMsg);
        opts.onMapInitError?.(errMsg);
      } else if (msg.type === "omsStatus") {
        console.log("[InteractiveMap] omsStatus", {
          omsReady: msg.omsReady,
          nearbyDistance: msg.nearbyDistance,
          error: msg.error,
        });
      } else if (msg.type === "mapReady") {
        sendStartupBeacon("mapview_ready");
        opts.onReady?.();
        opts.setMapReady(true);
        opts.onMapReadyEpoch?.();
      } else if (msg.type === "regionChange" && msg.lat != null && msg.lng != null) {
        opts.onRegionChangeComplete?.({ latitude: msg.lat, longitude: msg.lng });
      } else if (msg.type === "markerPress") {
        if (msg.markerType === "user") {
          const u = opts.users.find((x) => x.id === msg.id);
          if (u) opts.onUserPress?.(u);
        } else if (msg.markerType === "club") {
          const c = opts.clubPins.find((x) => x.id === msg.id);
          if (c) opts.onClubPress?.(c);
        } else if (msg.markerType === "event") {
          if (msg.id) opts.onEventPress?.(msg.id);
        } else if (msg.markerType === "egg") {
          const e = opts.easterEggs.find((x) => x.id === msg.id);
          if (e) opts.onEasterEggPress?.(e);
        } else if (msg.markerType === "hazard") {
          if (msg.id) opts.onHazardPress?.(msg.id);
        } else if (msg.markerType === "vessel") {
          if (msg.id) opts.onVesselPress?.(msg.id);
        }
      }
    } catch {
      // no-op: ignore malformed bridge messages
    }
  };
}
