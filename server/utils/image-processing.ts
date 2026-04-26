import sharp from "sharp";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 80;

/**
 * Compresses any image buffer to WebP format (1200px max, quality 80).
 * All formats including GIF are converted — note that animated GIFs lose animation.
 * Use compressToWebPOrPassGif() in admin-ad context where GIF animation must be preserved.
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
 * Like compressToWebP, but passes GIF files through unchanged.
 * For use in admin ad uploads where animated GIFs must be preserved.
 * Returns { buffer, mimeType } so the caller can set extension/Content-Type correctly.
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
