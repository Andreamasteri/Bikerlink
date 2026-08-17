// Unit tests must never inherit a developer or production database target.
// The inert loopback endpoint lets modules construct pg/Drizzle clients while
// guaranteeing that an accidental unmocked query fails locally and cannot
// reach an external database.
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_DEV;
delete process.env.DATABASE_URL_CANDIDATE;
delete process.env.DATABASE_URL_PRODUCTION;
process.env.BIKERLINK_DEPLOY_ENV = "development";
process.env.DATABASE_URL_DEV = "postgres://unit-test:unit-test@127.0.0.1:1/unit-test"; // pragma: allowlist secret

// React 19 requires this opt-in for the renderer's act() warnings to be
// meaningful. Keep it in the shared Vitest setup so every React test gets the
// same environment before importing react-test-renderer.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React 19 deprecates react-test-renderer, but this suite intentionally uses
// its tree renderer for React Native component assertions. Suppress only that
// library's known deprecation notice; real console.error output must remain
// visible so test failures and application errors are not hidden.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (args[0] === "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer") {
    return;
  }
  originalConsoleError(...args);
};
