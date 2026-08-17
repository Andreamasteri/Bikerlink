const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

let metroProcess = null;

function exitWithError(message) {
  console.error(message);
  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(1);
}

function setupSignalHandlers() {
  const cleanup = () => {
    if (metroProcess) {
      console.log("Cleaning up Metro process...");
      metroProcess.kill();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
}

const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATIC_BUILD_ROOT = path.resolve(PROJECT_ROOT, "static-build");
const DEFAULT_DEPLOYMENT_DOMAIN = "biker-link.replit.app";

function safePath(baseDir, ...segments) {
  const resolved = path.resolve(baseDir, ...segments);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    throw new Error(`Path traversal detected: ${resolved} is outside ${baseDir}`);
  }
  return resolved;
}

function stripProtocol(domain) {
  let urlString = domain.trim();

  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  return new URL(urlString).host;
}

function getDeploymentDomain() {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_DOMAIN);
  }

  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    return stripProtocol(process.env.REPLIT_INTERNAL_APP_DOMAIN);
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return stripProtocol(process.env.REPLIT_DEV_DOMAIN);
  }

  console.warn(
    `EXPO_PUBLIC_DOMAIN non impostato; uso il dominio BikerLink configurato: ${DEFAULT_DEPLOYMENT_DOMAIN}`,
  );
  return DEFAULT_DEPLOYMENT_DOMAIN;
}

function prepareDirectories(timestamp) {
  console.log("Preparing build directories...");

  if (fs.existsSync("static-build")) {
    fs.rmSync("static-build", { recursive: true });
  }

  const dirs = [
    path.join("static-build", timestamp, "_expo", "static", "js", "ios"),
    path.join("static-build", timestamp, "_expo", "static", "js", "android"),
    path.join("static-build", "ios"),
    path.join("static-build", "android"),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log("Build:", timestamp);
}

function clearMetroCache() {
  console.log("Clearing Metro cache...");

  const cachePaths = [".metro-cache", "node_modules/.cache/metro"];

  for (const dir of cachePaths) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("Cache cleared");
}

async function checkMetroHealth() {
  try {
    const response = await fetch("http://localhost:8081/status", {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startMetro(expoPublicDomain) {
  const isRunning = await checkMetroHealth();
  if (isRunning) {
    console.log("Metro already running");
    return;
  }

  console.log("Starting Metro with local Expo CLI...");
  console.log(`Setting EXPO_PUBLIC_DOMAIN=${expoPublicDomain}`);
  const expoCommand = path.join(
    PROJECT_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "expo.cmd" : "expo",
  );
  const env = {
    ...process.env,
    EXPO_PUBLIC_DOMAIN: expoPublicDomain,
    CI: "1",
    EXPO_OFFLINE: "1",
    EXPO_NO_TELEMETRY: "1",
    EXPO_NO_INSPECTOR_PROXY: "1",
    EXPO_UNSTABLE_HEADLESS: "1",
    EXPO_NO_DEPENDENCY_VALIDATION: "1",
    __UNSAFE_EXPO_HOME_DIRECTORY: path.join(os.tmpdir(), "bikerlink-expo-home"),
    REACT_NATIVE_DEVTOOLS_DISABLE: "1",
  };
  metroProcess = spawn(expoCommand, ["start", "--no-dev", "--minify", "--localhost"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env,
  });

  if (metroProcess.stdout) {
    metroProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.log(`[Metro] ${output}`);
    });
  }
  if (metroProcess.stderr) {
    metroProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.error(`[Metro Error] ${output}`);
    });
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const healthy = await checkMetroHealth();
    if (healthy) {
      console.log("Metro ready");
      return;
    }
  }

  console.error("Metro timeout");
  process.exit(1);
}

const part2 = require("./build.part2.js");

async function main() {
  console.log("Building static Expo Go deployment...");

  setupSignalHandlers();

  const domain = getDeploymentDomain();
  const baseUrl = `https://${domain}`;
  const timestamp = `${Date.now()}-${process.pid}`;

  prepareDirectories(timestamp);
  clearMetroCache();

  await startMetro(domain);

  const downloadTimeout = 300000;
  const downloadPromise = part2.downloadBundlesAndManifests(timestamp, exitWithError, Readable, pipeline, fs, path);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Overall download timeout after ${downloadTimeout / 1000} seconds. ` +
            "Metro may be struggling to generate bundles. Check Metro logs above.",
        ),
      );
    }, downloadTimeout);
  });

  const manifests = await Promise.race([downloadPromise, timeoutPromise]);

  console.log("Processing assets...");
  const assets = part2.extractAssets(timestamp, fs, path);
  console.log("Found", assets.length, "unique asset(s)");

  const assetsByHash = new Map();
  for (const asset of assets) {
    assetsByHash.set(asset.hash, {
      relativePath: asset.relativePath,
      filename: asset.filename,
    });
  }

  const assetCount = await part2.downloadAssets(assets, timestamp, exitWithError, STATIC_BUILD_ROOT, fs, path, Readable, pipeline);

  if (assetCount > 0) {
    part2.updateBundleUrls(timestamp, baseUrl, fs, path);
  }

  console.log("Updating manifests and creating landing page...");
  part2.updateManifests(manifests, timestamp, baseUrl, assetsByHash, exitWithError, fs, path);

  console.log("Native build complete! Deploy to:", baseUrl);

  if (metroProcess) {
    metroProcess.kill();
    metroProcess = null;
  }

  console.log("Full build complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Build failed:", error.message);
  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(1);
});
