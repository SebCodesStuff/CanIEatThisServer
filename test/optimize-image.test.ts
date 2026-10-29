import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { optimizeImage } from "../src/optimize-image.js";

const MAX_EDGE = 1024;
const MAX_BYTES = 400 * 1024;

describe("optimizeImage", () => {
  test("shrinks a wide image to a jpeg within the edge and byte caps", async () => {
    const width = 2400;
    const height = 1200;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3;
        raw[offset] = (x * 17 + y * 31) & 255;
        raw[offset + 1] = (x * 13) & 255;
        raw[offset + 2] = (y * 19) & 255;
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();

    const optimized = await optimizeImage(png);
    const meta = await sharp(optimized.bytes).metadata();

    expect(optimized.mimeType).toBe("image/jpeg");
    expect(optimized.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(optimized.bytes.length).toBeLessThanOrEqual(MAX_BYTES);
    expect(optimized.width).toBeLessThanOrEqual(MAX_EDGE);
    expect(optimized.height).toBeLessThanOrEqual(MAX_EDGE);
    expect(Math.max(optimized.width, optimized.height)).toBe(MAX_EDGE);
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(optimized.width);
    expect(meta.height).toBe(optimized.height);
    expect(meta.exif).toBeUndefined();
  });

  test("does not enlarge a small image", async () => {
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const optimized = await optimizeImage(png);

    expect(optimized.width).toBe(200);
    expect(optimized.height).toBe(200);
    expect(optimized.mimeType).toBe("image/jpeg");
  });

  test("encodes a webp upload as jpeg", async () => {
    const webp = await sharp({
      create: { width: 320, height: 180, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .webp()
      .toBuffer();

    const optimized = await optimizeImage(webp);

    expect(optimized.mimeType).toBe("image/jpeg");
    expect(optimized.bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  test("applies EXIF orientation and drops metadata", async () => {
    const jpeg = await sharp({
      create: { width: 320, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const optimized = await optimizeImage(jpeg);
    const meta = await sharp(optimized.bytes).metadata();

    expect(optimized.width).toBe(100);
    expect(optimized.height).toBe(320);
    expect(meta.exif).toBeUndefined();
  });
});
