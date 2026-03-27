import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

const config: ExpoConfig = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      },
    },
  },
};

export default { expo: config };
