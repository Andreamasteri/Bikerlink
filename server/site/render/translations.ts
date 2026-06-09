// ── CENTRALISED SITE TRANSLATIONS ────────────────────────────────────────────
// Single source of truth for all IT/EN strings used on the public site.
// Keys follow the pattern: <page>.<section>.<element>
// navbar.ts imports this and injects it into the inline <script>.
//
// File split for 600-line ratchet compliance:
//   translations.it1.ts  — IT navbar/footer, home, features, sos, motoclub,
//                          community, download, faq, about, contact, comp, matching
//   translations.it2.ts  — IT community extra, comp, contatti, download extra,
//                          matching overview extra, h1 headings, prose sections,
//                          governance, legal headings, seo prose, how-it-works
//   translations.it3.ts  — IT types (17 signals), weights, delete account,
//                          comp section, learning/investors/privacy pages, legal HTML
//   translations.en1.ts  — EN navbar/footer, home, features, sos, motoclub,
//                          community, download, faq, about, contact, comp, matching
//   translations.en2.ts  — EN community extra, comp, contact/download channels,
//                          matching extra, h1 headings, prose, governance
//   translations.en3.ts  — EN legal headings, seo prose, how-it-works,
//                          types, learning/investors/privacy pages, legal HTML

import { SITE_TRANSLATIONS_IT1 } from "./translations.it1";
import { SITE_TRANSLATIONS_IT2 } from "./translations.it2";
import { SITE_TRANSLATIONS_IT3 } from "./translations.it3";
import { SITE_TRANSLATIONS_EN1 } from "./translations.en1";
import { SITE_TRANSLATIONS_EN2 } from "./translations.en2";
import { SITE_TRANSLATIONS_EN3 } from "./translations.en3";

export const SITE_TRANSLATIONS: Record<string, Record<string, string>> = {
  it: { ...SITE_TRANSLATIONS_IT1, ...SITE_TRANSLATIONS_IT2, ...SITE_TRANSLATIONS_IT3 },
  en: { ...SITE_TRANSLATIONS_EN1, ...SITE_TRANSLATIONS_EN2, ...SITE_TRANSLATIONS_EN3 },};
