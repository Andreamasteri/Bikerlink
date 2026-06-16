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
      const WEB_SUPPRESSED_HTML =
        "<!DOCTYPE html>" +
        "<html lang='it'><head><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
        "<title>BikerLink</title><style>" +
        "*{margin:0;padding:0;box-sizing:border-box;}" +
        "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
        "background:#111;color:#fff;display:flex;align-items:center;" +
        "justify-content:center;min-height:100vh;text-align:center;padding:24px;}" +
        "h1{font-size:28px;font-weight:700;margin-bottom:12px;}" +
        "p{color:#aaa;font-size:16px;margin-bottom:32px;}" +
        "a{display:inline-block;background:#FF6B00;color:#fff;text-decoration:none;" +
        "padding:14px 32px;border-radius:12px;font-weight:600;font-size:16px;}" +
        "</style></head><body>" +
        "<div><h1>BikerLink</h1><p>Solo app mobile.</p>" +
        "</div></body></html>";

      if (req.url) {
        const urlPath = req.url.split("?")[0];
        const isWebBundle =
          req.url.includes(".bundle") && req.url.includes("platform=web");
        const isWebHtmlPage =
          (urlPath === "/" || urlPath === "/index.html") &&
          !req.url.includes("platform=android") &&
          !req.url.includes("platform=ios");

        if (isWebBundle) {
          res.writeHead(200, {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Clear-Site-Data": '"cache"',
          });
          res.end("/* BikerLink web preview disabled */");
          return;
        }

        if (isWebHtmlPage) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(WEB_SUPPRESSED_HTML);
          return;
        }
      }
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
  /(?<!node_modules.*)\/logs\//,
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

config.resolver.platforms = ["ios", "android"];

// =============================================================================
// OTA-4 POST-MORTEM — "TypeError: undefined is not a function" in handleLogin
// =============================================================================
//
// Root cause (May 2026):
//   1. shared/db/*.ts imports drizzle-orm/pg-core at the top level.
//   2. Metro replaces those packages with mocks/empty.js for iOS/Android.
//   3. The old mock was `module.exports = {}` — so pgTable, sql, etc. were
//      all `undefined`.
//   4. shared/db/users.ts calls pgTable("users", {...}) at module init time.
//      With pgTable === undefined, this throws immediately.
//   5. A module that throws during evaluation exports NOTHING — all named
//      exports, including loginSchema (a pure Zod schema), become undefined.
//   6. login.tsx called loginSchema.safeParse() → crash.
//
// Fix: mocks/empty.js is now a universal no-op Proxy that survives any call
//   or property access without throwing. This lets shared/db/*.ts fully
//   evaluate and export their symbols even though drizzle-orm is mocked.
//
// INVARIANT: mocks/empty.js MUST remain a Proxy. Never revert it to `{}`.
//   The automated check scripts/check-client-undefined.sh enforces this and
//   more — it runs five checks (A–E) as the last step of scripts/typecheck.sh:
//     (A) No client file imports directly from server/ paths.          [FAIL]
//     (B) Every named value imported client-side from @shared/* actually exists
//         in the resolved shared file; SERVER_ONLY_PACKAGES imports in that
//         file emit a warning (known case: shared/db files use drizzle-orm).
//                                                               [FAIL/WARN]
//     (C) mocks/empty.js is still a Proxy (guards this invariant).    [FAIL]
//     (D) ALL shared/**/*.ts modules checked for top-level
//         SERVER_ONLY_PACKAGES imports — warns (does not fail) since the
//         known db files are already protected by the Proxy mock.      [WARN]
//     (E) Self-test — verifies Check B's grep correctly rejects a
//         nonexistent symbol (regression guard).                        [FAIL]
// =============================================================================
const SERVER_ONLY_PACKAGES = [
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

config.cacheVersion = "v10";

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

// SERVER_ONLY_PACKAGES is the single source of truth for which packages are
// mocked on iOS/Android. scripts/check-client-undefined.sh reads this list
// dynamically via `node -e` — do NOT duplicate it there.
// To add a new server-only package: add it to the array above. The check
// script picks it up automatically on the next run.
module.exports = config;
module.exports.SERVER_ONLY_PACKAGES = SERVER_ONLY_PACKAGES;
