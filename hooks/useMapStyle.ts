import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MAP_STYLE_PRESETS,
  type MapStyleId,
} from "@/lib/maplibre/style-presets";

const STORAGE_KEY = "@bikerlink:mapStyle";

export function useMapStyle() {
  const [styleId, setStyleId] = useState<MapStyleId>("day");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val && val in MAP_STYLE_PRESETS) {
        setStyleId(val as MapStyleId);
      }
    });
  }, []);

  const setStyle = useCallback(async (id: MapStyleId) => {
    setStyleId(id);
    await AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { styleId, setStyle };
}
