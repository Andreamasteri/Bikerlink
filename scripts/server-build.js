const { execSync } = require("child_process");
const path = require("path");

const sharedDir = path.resolve(__dirname, "..", "shared");

const cmd = [
  "node_modules/.bin/esbuild",
  "server/index.ts",
  "--platform=node",
  "--packages=external",
  "--bundle",
  "--format=cjs",
  "--outdir=server_dist",
  `--alias:@shared=${sharedDir}`,
  "--log-override:direct-eval=silent",
].join(" ");

console.log("Building server with esbuild...");
console.log(cmd);

try {
  execSync(cmd, { stdio: "inherit" });
  console.log("Server build complete.");
} catch (err) {
  process.exit(1);
}
