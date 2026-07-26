# Node and npm are a release contract

Date: 2026-07-26  
Change class: D — runtime/build compatibility. No build, deploy, OTA or database action was performed.

## Symptom

- CI and the APK workflow selected Node 20.
- Current AI SDK packages require Node 22 or newer.
- Node 20 is end-of-life.
- `package.json` did not declare a Node or npm contract.
- npm 11 rejected the existing lockfile while npm 10 accepted it, so a clean install depended on the workstation's implicit npm version.

## Root cause

The repository pinned dependency versions but not the runtime and package-manager versions used to resolve and install them.

## Correction

- Use Node 22.23.1 and npm 10.9.8 in CI, Replit and local version-manager files.
- Declare the same contract in `package.json`.
- Enable `engine-strict` so an incompatible environment fails before build or tests.
- Regenerate `package-lock.json` with the declared Node/npm pair and the repository's existing peer-dependency policy.

## Prevention

- Update runtime declarations, CI, Replit and the lockfile in one pull request.
- Never regenerate the lockfile with an undeclared Node/npm pair.
- Run `npm ci` twice from a clean directory; the second run must leave the lockfile unchanged.
- Treat a runtime-major change as class D: it requires a new compatibility review and cannot be released as an ordinary OTA.

## Rollback

Revert the pull request before any build or release. This correction does not modify database data or external release state.
