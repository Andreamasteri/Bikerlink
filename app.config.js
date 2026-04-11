const baseConfig = require("./app.json");

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  if (!googleMapsApiKey) {
    console.warn(
      "[app.config.js] WARNING: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set. " +
      "Android Google Maps will not work. Set the secret in Replit Secrets or EAS env."
    );
  }

  const merged = {
    ...config,
    ...baseConfig.expo,
    android: {
      ...baseConfig.expo.android,
      config: {
        ...baseConfig.expo.android?.config,
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
  return merged;
};
