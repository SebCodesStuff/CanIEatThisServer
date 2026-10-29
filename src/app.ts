import { Hono } from "hono";
import { toFoodItem, type ModelFood } from "./identify-food.js";
import { optimizeImage } from "./optimize-image.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type { ModelFood };

export type FoodVision = {
  identify(image: { bytes: Uint8Array; mimeType: string }): Promise<{ foods: ModelFood[] }>;
};

export function createApp(deps: { vision: FoodVision }) {
  const app = new Hono();

  app.post("/identify", async (c) => {
    const body = await c.req.parseBody();
    const image = body["image"];
    if (!isUploadedFile(image)) {
      return c.json({ error: "image is required" }, 400);
    }
    if (!ALLOWED_TYPES.has(image.type)) {
      return c.json({ error: "image must be jpeg, png, or webp" }, 400);
    }
    if (image.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: "image must be 8 MB or smaller" }, 400);
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length === 0) {
      return c.json({ error: "image is required" }, 400);
    }
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return c.json({ error: "image must be 8 MB or smaller" }, 400);
    }

    let optimized;
    try {
      optimized = await optimizeImage(bytes);
    } catch {
      return c.json({ error: "could not read image" }, 400);
    }

    try {
      const model = await deps.vision.identify({
        bytes: optimized.bytes,
        mimeType: optimized.mimeType,
      });
      return c.json({ foods: model.foods.map((food) => toFoodItem(food)) });
    } catch {
      return c.json({ error: "food identification failed" }, 502);
    }
  });

  return app;
}

function isUploadedFile(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "type" in value &&
    typeof value.type === "string" &&
    "size" in value &&
    typeof value.size === "number"
  );
}
