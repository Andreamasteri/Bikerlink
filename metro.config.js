const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /\/\.local\//,
  /\/logs\//,
  /\/node_modules\/.cache\//,
  /\/server_dist\//,
];

module.exports = config;
