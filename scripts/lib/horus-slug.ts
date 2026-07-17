/**
 * Pure slug helper used by horus-propose-tasks.ts and the companion test suite.
 * No imports — keep this file dependency-free.
 */

/**
 * Converts a task title into a filesystem-safe, lowercase, hyphenated slug.
 * Accented characters are transliterated; non-alphanumeric characters are
 * removed. When the resulting slug exceeds 60 characters, it is truncated at
 * the last hyphen within the first 60 characters (word boundary), falling back
 * to a hard cut only when no hyphen is found within the first 10 characters.
 */
export function titleToSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[àáâã]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôõ]/g, "o").replace(/[ùúûü]/g, "u").replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length <= 60) return slug;
  // Truncate at a word boundary (last hyphen before position 60)
  const cut = slug.slice(0, 60);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 10 ? cut.slice(0, lastHyphen) : cut;
}
