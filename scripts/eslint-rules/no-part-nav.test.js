"use strict";

const { RuleTester } = require("eslint");
const rule = require("./no-part-nav");

// ESLint 10 flat-config RuleTester: ecmaFeatures lives under parserOptions.
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

tester.run("no-part-nav", rule, {
  valid: [
    // Normal push/replace/navigate — no .partN
    { code: 'router.push("/giri/123")' },
    { code: 'router.replace("/profilo")' },
    { code: 'navigate("/impostazioni")' },
    { code: 'push("/club/" + id)' },
    { code: 'push(`/giri/${id}`)' },

    // Static strings without .partN — safe
    { code: 'router.push("/giri/detail")' },
    { code: 'push("/club/overview")' },
    { code: '<Link href="/giri/123" />' },

    // Template literal without .partN quasis
    { code: 'router.push(`/giri/${id}/dettaglio`)' },

    // Concatenation ending in a non-partN string
    { code: 'push("/giri/" + id + "/dettaglio")' },

    // Unrelated JSX attribute — not href, should not trigger
    { code: '<Link to={`/giri/${id}.part2`} />' },
    { code: '<Link to="/giri/1.part2" />' },

    // Assignment, not a navigation call
    { code: 'const s = "/giri/" + id + ".part2"' },
    { code: 'const url = "/screen.part2"' },
  ],

  invalid: [
    // ── Static string literal cases (new coverage) ────────────────────────

    {
      code: 'router.push("/giri/detail.part2")',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'router.replace("/club/members.part3")',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'navigate("/impostazioni.part1")',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'push("/screen.part2")',
      errors: [{ messageId: "noPartNav" }],
    },
    // plain string JSX href
    {
      code: '<Link href="/giri/detail.part2" />',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: '<Link href="/club.part3" />',
      errors: [{ messageId: "noPartNav" }],
    },

    // ── Template-literal cases (pre-existing coverage) ────────────────────

    {
      code: 'router.push(`/giri/${id}.part2`)',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'router.replace(`/club/${id}.part3`)',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'navigate(`/impostazioni.part1`)',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'push(`/giri/${id}.part2`)',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: '<Link href={`/giri/${id}.part2`} />',
      errors: [{ messageId: "noPartNav" }],
    },

    // ── Binary-concatenation cases (new coverage) ─────────────────────────

    // right-hand literal ends in .partN
    {
      code: 'push("/giri/" + id + ".part2")',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'router.push("/giri/" + id + ".part2")',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'router.replace("/club/" + clubId + ".part3")',
      errors: [{ messageId: "noPartNav" }],
    },
    {
      code: 'navigate("/impostazioni/" + section + ".part1")',
      errors: [{ messageId: "noPartNav" }],
    },

    // .partN literal on the left side of the concatenation
    {
      code: 'push(".part2" + "/suffix")',
      errors: [{ messageId: "noPartNav" }],
    },

    // concatenation as JSX href
    {
      code: '<Link href={"/giri/" + id + ".part2"} />',
      errors: [{ messageId: "noPartNav" }],
    },

    // simple two-segment concatenation (no variable)
    {
      code: 'push("/giri/1" + ".part2")',
      errors: [{ messageId: "noPartNav" }],
    },

    // deeply nested concatenation — (a + b) + ".partN"
    {
      code: 'router.push(("/giri/" + id) + ".part2")',
      errors: [{ messageId: "noPartNav" }],
    },
  ],
});

console.log("no-part-nav: all tests passed");
