---
name: BootGate activation flag sources
description: Why local-OR-remote feature flags must keep a manual override separate from a symmetric remote mirror.
---

# BootGate activation: manual override vs remote mirror

A device-side feature flag activated by "local OR remote" must use **two separate
AsyncStorage keys**, not one latched key:

- `__BOOT_GATE__` — MANUAL override. Sticky; set/cleared only by the user/dev on
  device. The remote path must NEVER write it.
- `__BOOT_GATE_REMOTE__` — SYMMETRIC mirror of the last-known remote value
  (`"1"`/`"0"`). Used only as offline fallback when the manifest fetch fails.

`resolveRemote()`: on fetch success write the mirror symmetrically
(`setBootGateRemoteMirror(remote)`); on fetch failure fall back to the mirror.
Activation = manual OR effective-remote.

**Why:** two constraints pull in opposite directions. (1) Remote must not clobber a
manual local override → tempting fix is sticky-ON: latch remote=true into the manual
key, never clear. (2) But that makes a remote "turn off" impossible — once remote
turned a device on, it stayed on forever (manual key latched true, never cleared).
The single-key design cannot satisfy both. Separating the sources does: manual stays
sticky, remote stays symmetric so toggle-off propagates to the next boot (online and
offline).

**How to apply:** any "local OR remote" device flag where an admin must be able to
turn it back off remotely — keep the manual override and the remote mirror on
distinct keys; never persist remote into the manual key. Regression coverage lives
in `lib/__tests__/boot-gate-passive.activation.test.ts` (simulates multi-boot via
`vi.resetModules()` + a hoisted AsyncStorage store).
