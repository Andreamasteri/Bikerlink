const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("metro-cache");
const path = require("path");
const http = require("http");

const config = getDefaultConfig(__dirname);

const BACKEND_PORT = 5000;
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      if (req.url && (req.url.startsWith("/api/") || req.url.startsWith("/uploads/"))) {
        const proxyReq = http.request(
          {
            hostname: "localhost",
            port: BACKEND_PORT,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `localhost:${BACKEND_PORT}` },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );
        proxyReq.on("error", () => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Backend unavailable" }));
        });
        req.pipe(proxyReq);
      } else {
        metroMiddleware(req, res, next);
      }
    };
  },
};

config.resolver.blockList = [
  /\/\.local\//,
  /\/logs\//,
  /\/node_modules\/.cache\//,
  /\/\.metro-cache\//,
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

config.cacheVersion = "v5";

config.cacheStores = [
  new FileStore({ root: path.join(__dirname, ".metro-cache") }),
];

config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_fnames: true,
    mangle: { keep_fnames: true },
  },
};

module.exports = config;
