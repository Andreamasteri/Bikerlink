import sharp from "sharp";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 80;

/**
 * Canonical image compression utility for BikerLink upload paths.
 *
 * ## API contract
 *
 * ### compressToWebP(buffer)
 * - Input:  any image format accepted by sharp (JPEG, PNG, WebP, HEIC, AVIF, GIF, …)
 * - Output: WebP buffer, max 1200px on the longest side, quality 80
 * - GIF:    converted to a static WebP frame — animated GIFs LOSE animation
 * - Use for: user profile photos, contest photos, motorcycle photos
 *
 * ### compressToWebPOrPassGif(buffer, mimeType)
 * - Like compressToWebP, but GIFs are returned unchanged (buffer + mimeType "image/gif")
 * - Non-GIF images are converted to WebP (mimeType "image/webp")
 * - Returns { buffer, mimeType } so callers can set file extension + Content-Type accordingly
 * - Use for: admin ad images ONLY, where animated GIF must be preserved
 *
 * ## Endpoint usage matrix
 * | Endpoint                          | Function                | Output ext |
 * |-----------------------------------|-------------------------|------------|
 * | POST /users/me/photos             | compressToWebP          | .webp      |
 * | POST /contest/entries             | compressToWebP          | .webp      |
 * | POST /motorcycles/:id/photos      | compressToWebP          | .webp      |
 * | uploadAdImageToObjectStorage()    | compressToWebPOrPassGif | .webp/.gif |
 */

/**
 * Compresses any image to WebP (max 1200px long side, quality 80).
 * All formats including GIF are converted; animated GIFs lose animation.
 *
 * @param buffer - Raw image buffer (any format sharp supports)
 * @returns WebP buffer, ≤ 1200px on longest side
 */
export async function compressToWebP(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Like compressToWebP, but passes GIF buffers through unchanged to preserve animation.
 * For use in admin ad uploads ONLY — all other upload paths should use compressToWebP.
 *
 * @param buffer   - Raw image buffer
 * @param mimeType - MIME type detected from the original upload (e.g. "image/gif")
 * @returns { buffer, mimeType } — caller must use mimeType to set file extension + Content-Type
 */
export async function compressToWebPOrPassGif(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (mimeType === "image/gif") {
    return { buffer, mimeType: "image/gif" };
  }
  const processed = await compressToWebP(buffer);
  return { buffer: processed, mimeType: "image/webp" };
}
