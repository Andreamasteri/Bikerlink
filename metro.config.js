const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /\/\.local\//,
  /\/logs\//,
  /\/node_modules\/.cache\//,
  /\/server_dist\//,
  /\/server\//,
  /\/scripts\//,
  /\/tmp\//,
  /\/migrations\//,
  /.*seed.*\.js$/,
  /.*seed.*\.ts$/,
  /.*\.sh$/,
];

config.resolver.platforms = ["ios", "android", "web"];

config.maxWorkers = 1;

config.cacheVersion = "v3-optimized";

config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_fnames: true,
    mangle: { keep_fnames: true },
  },
};

module.exports = config;
