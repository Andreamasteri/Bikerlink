async function downloadFile(url, outputPath, Readable, pipeline, fs) {
  const controller = new AbortController();
  const fiveMinMS = 5 * 60 * 1_000;
  const timeoutId = setTimeout(() => controller.abort(), fiveMinMS);

  try {
    console.log(`Downloading: ${url}`);
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const file = fs.createWriteStream(outputPath);
    await pipeline(Readable.fromWeb(response.body), file);

    const fileSize = fs.statSync(outputPath).size;

    if (fileSize === 0) {
      fs.unlinkSync(outputPath);
      throw new Error("Downloaded file is empty");
    }
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    if (error.name === "AbortError") {
      throw new Error(`Download timeout after 5m: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundle(platform, timestamp, Readable, pipeline, fs, path) {
  const url = new URL("http://localhost:8081/node_modules/expo-router/entry.bundle");
  url.searchParams.set("platform", platform);
  url.searchParams.set("dev", "false");
  url.searchParams.set("hot", "false");
  url.searchParams.set("lazy", "false");
  url.searchParams.set("minify", "true");

  const output = path.join(
    "static-build",
    timestamp,
    "_expo",
    "static",
    "js",
    platform,
    "bundle.js",
  );

  console.log(`Fetching ${platform} bundle...`);
  await downloadFile(url.toString(), output, Readable, pipeline, fs);
  console.log(`${platform} bundle ready`);
}

async function downloadManifest(platform) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  try {
    console.log(`Fetching ${platform} manifest...`);
    const response = await fetch("http://localhost:8081/manifest", {
      headers: { "expo-platform": platform },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    console.log(`${platform} manifest ready`);
    return manifest;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Manifest download timeout after 5m for platform: ${platform}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundlesAndManifests(timestamp, exitWithError, Readable, pipeline, fs, path) {
  console.log("Downloading bundles and manifests...");
  console.log("This may take several minutes for production builds...");

  try {
    const results = await Promise.allSettled([
      downloadBundle("ios", timestamp, Readable, pipeline, fs, path),
      downloadBundle("android", timestamp, Readable, pipeline, fs, path),
      downloadManifest("ios"),
      downloadManifest("android"),
    ]);

    const failures = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === "rejected");

    if (failures.length > 0) {
      const errorMessages = failures.map(({ result, index }) => {
        const names = [
          "iOS bundle",
          "Android bundle",
          "iOS manifest",
          "Android manifest",
        ];
        return `  - ${names[index]}: ${result.reason?.message || result.reason}`;
      });

      exitWithError(`Download failed:\n${errorMessages.join("\n")}`);
    }

    const iosManifest =
      results[2].status === "fulfilled" ? results[2].value : null;
    const androidManifest =
      results[3].status === "fulfilled" ? results[3].value : null;

    console.log("All downloads completed successfully");
    return { ios: iosManifest, android: androidManifest };
  } catch (error) {
    exitWithError(`Unexpected download error: ${error.message}`);
  }
}

function extractAssets(timestamp, fs, path) {
  const bundles = {
    ios: fs.readFileSync(path.join("static-build", timestamp, "_expo", "static", "js", "ios", "bundle.js"), "utf-8"),
    android: fs.readFileSync(path.join("static-build", timestamp, "_expo", "static", "js", "android", "bundle.js"), "utf-8"),
  };

  const assetsMap = new Map();
  const assetPattern = /httpServerLocation:"([^"]+)"[^}]*hash:"([^"]+)"[^}]*name:"([^"]+)"[^}]*type:"([^"]+)"/g;

  const extractFromBundle = (bundle, platform) => {
    for (const match of bundle.matchAll(assetPattern)) {
      const originalPath = match[1];
      const filename = match[3] + "." + match[4];

      const tempUrl = new URL(`http://localhost:8081${originalPath}`);
      const unstablePath = tempUrl.searchParams.get("unstable_path");

      if (!unstablePath) {
        throw new Error(`Asset missing unstable_path: ${originalPath}`);
      }

      const decodedPath = decodeURIComponent(unstablePath);
      const key = path.posix.join(decodedPath, filename);

      if (!assetsMap.has(key)) {
        assetsMap.set(key, {
          url: path.posix.join("/", decodedPath, filename),
          originalPath,
          filename,
          relativePath: decodedPath,
          hash: match[2],
          platforms: new Set(),
        });
      }
      assetsMap.get(key).platforms.add(platform);
    }
  };

  extractFromBundle(bundles.ios, "ios");
  extractFromBundle(bundles.android, "android");

  return Array.from(assetsMap.values());
}

async function downloadAssets(assets, timestamp, exitWithError, STATIC_BUILD_ROOT, fs, path, Readable, pipeline) {
  if (assets.length === 0) return 0;
  console.log("Downloading assets...");
  let successCount = 0;
  const failures = [];

  const downloadPromises = assets.map(async (asset) => {
    const platform = Array.from(asset.platforms)[0];
    const tempUrl = new URL(`http://localhost:8081${asset.originalPath}`);
    const unstablePath = tempUrl.searchParams.get("unstable_path");
    if (!unstablePath) throw new Error(`Asset missing unstable_path: ${asset.originalPath}`);
    const decodedPath = decodeURIComponent(unstablePath);
    const metroUrl = new URL(`http://localhost:8081${path.posix.join("/assets", decodedPath, asset.filename)}`);
    metroUrl.searchParams.set("platform", platform);
    metroUrl.searchParams.set("hash", asset.hash);
    const outputDir = path.resolve(STATIC_BUILD_ROOT, timestamp, "_expo", "static", "js", decodedPath);
    fs.mkdirSync(outputDir, { recursive: true });
    const output = path.join(outputDir, asset.filename);
    try {
      await downloadFile(metroUrl.toString(), output, Readable, pipeline, fs);
      successCount++;
    } catch (error) {
      failures.push({ filename: asset.filename, error: error.message, url: metroUrl.toString() });
    }
  });

  await Promise.all(downloadPromises);

  if (failures.length > 0) {
    exitWithError(`Failed to download ${failures.length} asset(s):\n` + failures.map((f) => `  - ${f.filename}: ${f.error} (${f.url})`).join("\n"));
  }
  return successCount;
}

function updateBundleUrls(timestamp, baseUrl, fs, path) {
  const updateForPlatform = (platform) => {
    const bundlePath = path.join("static-build", timestamp, "_expo", "static", "js", platform, "bundle.js");
    let bundle = fs.readFileSync(bundlePath, "utf-8");
    bundle = bundle.replace(/httpServerLocation:"(\/[^"]+)"/g, (_match, capturedPath) => {
      const tempUrl = new URL(`http://localhost:8081${capturedPath}`);
      const unstablePath = tempUrl.searchParams.get("unstable_path");
      if (!unstablePath) throw new Error(`Asset missing unstable_path in bundle: ${capturedPath}`);
      const decodedPath = decodeURIComponent(unstablePath);
      return `httpServerLocation:"${baseUrl}/${timestamp}/_expo/static/js/${decodedPath}"`;
    });
    fs.writeFileSync(bundlePath, bundle);
  };
  updateForPlatform("ios");
  updateForPlatform("android");
  console.log("Updated bundle URLs");
}

function updateManifests(manifests, timestamp, baseUrl, assetsByHash, exitWithError, fs, path) {
  const updateForPlatform = (platform, manifest) => {
    if (!manifest.launchAsset || !manifest.extra) exitWithError(`Malformed manifest for ${platform}`);
    manifest.launchAsset.url = `${baseUrl}/${timestamp}/_expo/static/js/${platform}/bundle.js`;
    manifest.launchAsset.key = `bundle-${timestamp}`;
    manifest.createdAt = new Date(Number(timestamp.split("-")[0])).toISOString();
    manifest.extra.expoClient.hostUri = baseUrl.replace("https://", "") + "/" + platform;
    manifest.extra.expoGo.debuggerHost = baseUrl.replace("https://", "") + "/" + platform;
    manifest.extra.expoGo.packagerOpts.dev = false;
    if (manifest.assets && manifest.assets.length > 0) {
      manifest.assets.forEach((asset) => {
        if (!asset.url || !asset.hash) return;
        const assetInfo = assetsByHash.get(asset.hash);
        if (!assetInfo) return;
        asset.url = `${baseUrl}/${timestamp}/_expo/static/js/${assetInfo.relativePath}/${assetInfo.filename}`;
      });
    }
    fs.writeFileSync(path.join("static-build", platform, "manifest.json"), JSON.stringify(manifest, null, 2));
  };
  updateForPlatform("ios", manifests.ios);
  updateForPlatform("android", manifests.android);
  console.log("Manifests updated");
}

module.exports = {
  downloadBundlesAndManifests,
  extractAssets,
  downloadAssets,
  updateBundleUrls,
  updateManifests
};
