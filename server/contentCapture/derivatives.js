import { createHash } from "node:crypto";
import convertHeic from "heic-convert";
import sharp from "sharp";

export const PREVIEW_LONG_EDGE = 2560;
export const THUMBNAIL_LONG_EDGE = 480;
export const PREVIEW_JPEG_QUALITY = 82;
export const THUMBNAIL_JPEG_QUALITY = 75;

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

/**
 * Official sharp/libvips binaries ship libheif without an HEVC plugin.
 * metadata() still reports HEIC width and height, then pixel output throws
 * "Support for this compression format has not been built in (11.6003)".
 * Decode HEIC/HEIF with the wasm libheif build instead, then let sharp
 * resize, apply any remaining orientation, and write JPEGs with no EXIF.
 */
export function isHeicOrHeif({ buffer, contentType = "", filename = "" }) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (HEIC_MIME_TYPES.has(mime)) return true;
  if (/\.heic$|\.heif$/i.test(filename)) return true;
  if (!buffer || buffer.length < 12) return false;
  const brand = buffer.subarray(8, 12).toString("latin1").replaceAll("\0", "").trim().toLowerCase();
  return HEIC_BRANDS.has(brand);
}

export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function derivativePaths(checksum) {
  const prefix = checksum.slice(0, 2);
  return {
    previewPath: `derivatives/${prefix}/${checksum}-preview.jpg`,
    thumbnailPath: `derivatives/${prefix}/${checksum}-thumb.jpg`,
  };
}

function withDeadline(promise, timeoutMs, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function rasterizeHeic(buffer, { convert = convertHeic, timeoutMs = 25_000, now = Date.now } = {}) {
  const started = now();
  const encoded = await withDeadline(
    convert({ buffer, format: "JPEG", quality: 0.92 }),
    timeoutMs,
    () => new Error(`HEIC decoding timed out after ${timeoutMs}ms`),
  );
  return { buffer: Buffer.from(encoded), decodeMs: now() - started };
}

async function toJpegDerivative(source, longEdge, quality) {
  return sharp(source, { failOn: "none", limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: longEdge,
      height: longEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

export async function buildCaptureDerivatives(input, options = {}) {
  const buffer = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer || []);
  if (!buffer.length) {
    throw Object.assign(new Error("The uploaded image is empty."), { code: "image_decode_failed" });
  }

  const heic = isHeicOrHeif(input);
  let raster = buffer;
  let decodeMs = 0;
  if (heic) {
    try {
      const decoded = await rasterizeHeic(buffer, options);
      raster = decoded.buffer;
      decodeMs = decoded.decodeMs;
    } catch (error) {
      const wrapped = new Error(
        error?.message || "HEIC decoding failed. The photo was not added to the library.",
      );
      wrapped.code = "image_decode_failed";
      wrapped.cause = error;
      throw wrapped;
    }
  }

  let preview;
  let thumbnail;
  try {
    preview = await toJpegDerivative(raster, PREVIEW_LONG_EDGE, PREVIEW_JPEG_QUALITY);
    thumbnail = await toJpegDerivative(raster, THUMBNAIL_LONG_EDGE, THUMBNAIL_JPEG_QUALITY);
  } catch (error) {
    const wrapped = new Error(error?.message || "The image could not be converted for the library.");
    wrapped.code = "image_decode_failed";
    wrapped.cause = error;
    throw wrapped;
  }

  const metadata = await sharp(preview).metadata();
  const checksum = sha256Hex(buffer);
  const paths = derivativePaths(checksum);
  return {
    checksum,
    heic,
    decodeMs,
    width: metadata.width || 0,
    height: metadata.height || 0,
    preview,
    thumbnail,
    ...paths,
  };
}
