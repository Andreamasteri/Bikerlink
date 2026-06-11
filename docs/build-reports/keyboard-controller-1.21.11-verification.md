# Android Build Verification — keyboard-controller 1.21.11

## Summary

EAS `release-apk` build completed **successfully** after upgrading
`react-native-keyboard-controller` from 1.21.6 to 1.21.11.

## Build Details

| Field            | Value                                                                             |
|------------------|-----------------------------------------------------------------------------------|
| Build ID         | 7d1afb7b-5a15-494d-bef7-a5b30d658682                                             |
| Status           | **finished** ✅                                                                   |
| Platform         | Android                                                                           |
| Profile          | release-apk                                                                       |
| Version          | 60.10.100 (versionCode 60)                                                        |
| SDK              | 56.0.0                                                                            |
| Runtime          | 10.0.0                                                                            |
| Started          | 2026-06-11 20:57:30 UTC                                                           |
| Finished         | 2026-06-11 21:14:33 UTC (~17 min)                                                 |
| APK URL          | https://expo.dev/artifacts/eas/6QAKbHCTPrZ92nQ8Jx3IfwY2iKc7jtNuc7JqLBFDmhc.apk |
| Fingerprint      | 181437aa3b43f23abb930b3fc53e865965b746c3                                          |
| Logs             | https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/7d1afb7b-5a15-494d-bef7-a5b30d658682 |

## What Was Verified

- **Kotlin 2.1.20 compilation error is fixed.** The error
  `'onConfigurationChanged' overrides nothing` (caused by a nullable `Configuration?`
  parameter in versions < 1.21.9) is resolved in 1.21.11 — the build compiled cleanly
  without that error.
- The EAS build pipeline accepted the project, resolved remote keystore credentials,
  and produced an ARM64 APK for internal distribution.
- **APK installed and launches on physical device** ✅ — confirmed by user on 2026-06-11.

## Package State

```
react-native-keyboard-controller: ^1.21.11   (package.json)
NOT in expo.install.exclude                  (Expo manages it)
```

## Key Files

- `components/KeyboardAwareScrollViewCompat.tsx`
- `components/RootProviders.tsx`
