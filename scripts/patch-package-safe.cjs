const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

const patchPackage = require.resolve("patch-package/package.json", { paths: [process.cwd()] });
if (patchPackage && existsSync(patchPackage)) {
  execFileSync(process.platform === "win32" ? "patch-package.cmd" : "patch-package", [], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
