import sharp from "sharp";

const MAX_EDGE = 1024;
const FALLBACK_EDGE = 768;
const MAX_BYTES = 400 * 1024;

export type OptimizedImage = {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

export async function optimizeImage(input: Buffer): Promise<OptimizedImage> {
  const atFullSize = await encode(input, MAX_EDGE, 75);
  if (atFullSize.bytes.length <= MAX_BYTES) {
    return atFullSize;
  }

  const recompressed = await encode(input, MAX_EDGE, 55);
  if (recompressed.bytes.length <= MAX_BYTES) {
    return recompressed;
  }

  return encode(input, FALLBACK_EDGE, 55);
}

async function encode(input: Buffer, edge: number, quality: number): Promise<OptimizedImage> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: edge,
      height: edge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: data,
    mimeType: "image/jpeg",
    width: info.width,
    height: info.height,
  };
}
