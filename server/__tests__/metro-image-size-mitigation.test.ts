import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(__dirname, "../..");

describe("Metro image-size security mitigation", () => {
  it("removes the vulnerable decoder registrations from the installed Metro dependency", () => {
    const packageJson = require.resolve("image-size/package.json", {
      paths: [path.join(projectRoot, "node_modules", "metro")],
    });
    const packageRoot = path.dirname(packageJson);
    const metadata = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    expect(metadata.name).toBe("image-size");
    expect(metadata.version).toBe("1.2.1");

    const typesIndex = fs.readFileSync(
      path.join(packageRoot, "dist", "types", "index.js"),
      "utf8",
    );
    const detector = fs.readFileSync(
      path.join(packageRoot, "dist", "detector.js"),
      "utf8",
    );

    expect(typesIndex).not.toContain("heif_1.HEIF");
    expect(typesIndex).not.toContain("icns_1.ICNS");
    expect(typesIndex).not.toContain("jxl_1.JXL");
    expect(typesIndex).not.toContain("jxl_stream_1.JXLStream");
    expect(detector).not.toContain("0x69: 'icns'");
  });
});
