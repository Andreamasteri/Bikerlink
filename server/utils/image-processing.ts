import sharp from "sharp";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 80;

/**
 * Compresses an image buffer to WebP format.
 * - GIF files are returned unchanged (WebP does not support animated GIFs).
 * - All other images are resized to max 1200px on the longest side (aspect ratio preserved)
 *   and converted to WebP at quality 80.
 *
 * Returns an object with the processed buffer and the resulting MIME type.
 */
export async function compressToWebP(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (mimeType === "image/gif") {
    return { buffer, mimeType: "image/gif" };
  }

  const processed = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return { buffer: processed, mimeType: "image/webp" };
}
