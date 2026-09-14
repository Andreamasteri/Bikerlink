const { withGradleProperties } = require("@expo/config-plugins");

const JVM_ARGS = "-Xmx2048m -XX:MaxMetaspaceSize=1024m";

module.exports = function withGradleJvmMemory(config) {
  return withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const existing = properties.find(
      (item) => item.type === "property" && item.key === "org.gradle.jvmargs",
    );

    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      properties.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value: JVM_ARGS,
      });
    }

    return config;
  });
};
