import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { createApp, type FoodVision, type ModelFood } from "../src/app.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function visionReturning(foods: ModelFood[]): FoodVision & { calls: Array<{ bytes: Uint8Array; mimeType: string }> } {
  const calls: Array<{ bytes: Uint8Array; mimeType: string }> = [];
  return {
    calls,
    async identify(image) {
      calls.push(image);
      return { foods };
    },
  };
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function postImage(
  app: ReturnType<typeof createApp>,
  bytes: Uint8Array,
  type: string,
  filename = "meal.bin",
) {
  const form = new FormData();
  form.append("image", new File([toBlobPart(bytes)], filename, { type }));
  return app.request("/identify", { method: "POST", body: form });
}

describe("POST /identify", () => {
  test("returns 400 when the image field is missing", async () => {
    const app = createApp({ vision: visionReturning([]) });
    const form = new FormData();
    form.append("note", "no photo");

    const response = await app.request("/identify", { method: "POST", body: form });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "image is required" });
  });

  test("returns 400 for a type other than jpeg, png, or webp", async () => {
    const vision = visionReturning([]);
    const app = createApp({ vision });

    const response = await postImage(app, new Uint8Array([1, 2, 3]), "image/gif", "meal.gif");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "image must be jpeg, png, or webp",
    });
    expect(vision.calls).toHaveLength(0);
  });

  test("returns 400 when the upload is over 8 MB", async () => {
    const vision = visionReturning([]);
    const app = createApp({ vision });
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 1);

    const response = await postImage(app, bytes, "image/jpeg", "huge.jpg");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "image must be 8 MB or smaller",
    });
    expect(vision.calls).toHaveLength(0);
  });

  test("sends the optimized jpeg to the vision client, not the original upload", async () => {
    const vision = visionReturning([]);
    const app = createApp({ vision });
    const png = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 12, g: 80, b: 40 } },
    })
      .png()
      .toBuffer();

    const response = await postImage(app, png, "image/png", "plate.png");

    expect(response.status).toBe(200);
    expect(vision.calls).toHaveLength(1);
    const sent = vision.calls[0]!;
    expect(sent.mimeType).toBe("image/jpeg");
    expect(Buffer.from(sent.bytes).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(Buffer.compare(Buffer.from(sent.bytes), png)).not.toBe(0);
    const meta = await sharp(sent.bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
    expect(sent.bytes.byteLength).toBeLessThanOrEqual(400 * 1024);
  });

  test("names a labeled package from brand, product, and variant", async () => {
    const app = createApp({
      vision: visionReturning([
        {
          brand: "Quaker",
          product: "Oats Protein",
          variant: "oatmeal",
          genericName: "oatmeal",
          confidence: "high",
        },
      ]),
    });
    const jpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const response = await postImage(app, jpeg, "image/jpeg", "oats.jpg");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      foods: [
        {
          name: "Quaker Oats Protein oatmeal",
          brand: "Quaker",
          product: "Oats Protein",
          variant: "oatmeal",
          genericName: "oatmeal",
          confidence: "high",
        },
      ],
    });
  });

  test("uses the generic name when no brand is visible", async () => {
    const app = createApp({
      vision: visionReturning([
        {
          brand: "  ",
          product: "Oats Protein",
          variant: "oatmeal",
          genericName: "oatmeal",
          confidence: "medium",
        },
      ]),
    });
    const jpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const response = await postImage(app, jpeg, "image/jpeg", "bowl.jpg");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      foods: [
        {
          name: "oatmeal",
          brand: null,
          product: null,
          variant: null,
          genericName: "oatmeal",
          confidence: "medium",
        },
      ],
    });
  });

  test("returns one entry per food", async () => {
    const app = createApp({
      vision: visionReturning([
        {
          brand: null,
          product: null,
          variant: null,
          genericName: "apple",
          confidence: "high",
        },
        {
          brand: "Chobani",
          product: null,
          variant: "vanilla",
          genericName: "yogurt",
          confidence: "medium",
        },
      ]),
    });
    const jpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 4, g: 5, b: 6 } },
    })
      .jpeg()
      .toBuffer();

    const response = await postImage(app, jpeg, "image/jpeg", "plate.jpg");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      foods: [
        {
          name: "apple",
          brand: null,
          product: null,
          variant: null,
          genericName: "apple",
          confidence: "high",
        },
        {
          name: "Chobani vanilla",
          brand: "Chobani",
          product: null,
          variant: "vanilla",
          genericName: "yogurt",
          confidence: "medium",
        },
      ],
    });
  });

  test("returns 502 when the vision client fails", async () => {
    const app = createApp({
      vision: {
        async identify() {
          throw new Error("upstream down");
        },
      },
    });
    const jpeg = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .jpeg()
      .toBuffer();

    const response = await postImage(app, jpeg, "image/jpeg", "fail.jpg");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "food identification failed" });
  });
});
