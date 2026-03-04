const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watcher = {
  ...config.watcher,
  watchman: false,
  additionalExclusions: [
    ...(config.watcher?.additionalExclusions || []),
    path.resolve(__dirname, ".local"),
  ],
};

module.exports = config;
