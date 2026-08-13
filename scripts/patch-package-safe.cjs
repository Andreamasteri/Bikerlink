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
  const command = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : "patch-package";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "patch-package.cmd"]
    : [];

  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
