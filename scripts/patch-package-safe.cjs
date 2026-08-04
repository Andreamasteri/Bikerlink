const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

let patchPackagePath;
try {
  patchPackagePath = require.resolve("patch-package/package.json", { paths: [process.cwd()] });
} catch (error) {
  if (error && error.code === "MODULE_NOT_FOUND") process.exit(0);
  throw error;
}

if (existsSync(patchPackagePath)) {
  execFileSync(process.platform === "win32" ? "patch-package.cmd" : "patch-package", [], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
