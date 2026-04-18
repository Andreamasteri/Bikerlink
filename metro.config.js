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
  /\/static-build\//,
  /\/attached_assets\//,
  /.*seed.*\.js$/,
  /.*seed.*\.ts$/,
  /.*\.sh$/,
];

config.resolver.platforms = ["ios", "android", "web"];

const SERVER_ONLY_PACKAGES = [
  "googleapis",
  "pdfkit",
  "sharp",
  "docx",
  "nodemailer",
  "archiver",
  "multer",
  "express",
  "pg",
  "drizzle-orm",
  "bcryptjs",
  "connect-pg-simple",
  "node-forge",
  "undici",
  "tsx",
  "flatted",
  "picomatch",
  "http-proxy-middleware",
  "express-session",
  "express-rate-limit",
  "@replit/connectors-sdk",
  "@replit/object-storage",
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "ios" || platform === "android") {
    const isServerOnly = SERVER_ONLY_PACKAGES.some(
      (pkg) => moduleName === pkg || moduleName.startsWith(pkg + "/")
    );
    if (isServerOnly) {
      return {
        filePath: path.join(__dirname, "mocks/empty.js"),
        type: "sourceFile",
      };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.maxWorkers = 1;

config.cacheVersion = "v8";

config.cacheStores = [
  new FileStore({ root: path.join(__dirname, ".metro-cache") }),
];

config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_fnames: true,
    mangle: {
      keep_fnames: true,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
      wrap_iife: true,
    },
    sourceMap: {
      includeSources: false,
    },
    toplevel: false,
    compress: {
      reduce_funcs: false,
      drop_console: true,
    },
  },
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
