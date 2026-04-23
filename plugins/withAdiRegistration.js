const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ADI_CONTENT = "CKO4ROI4RUDE2AAAAAAAAAAAAA";
const ADI_FILENAME = "adi-registration.properties";

const withAdiRegistration = (config) => {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const assetsDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets"
      );

      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const destPath = path.join(assetsDir, ADI_FILENAME);
      fs.writeFileSync(destPath, ADI_CONTENT, "utf8");

      return cfg;
    },
  ]);
};

module.exports = withAdiRegistration;
