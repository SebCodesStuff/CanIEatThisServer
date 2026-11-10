import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "hono-rate-limiter";
import { FoodItem, toFoodItem, type ModelFood } from "./identify-food.js";
import { optimizeImage } from "./optimize-image.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type { ModelFood };

export type FoodVision = {
  identify(image: { bytes: Uint8Array; mimeType: string }): Promise<{ foods: ModelFood[] }>;
  calories(foods: ModelFood[]): Promise<number[]>;
};

export type RateLimit = { limit: number; windowMs: number };

const DEFAULT_RATE_LIMIT: RateLimit = { limit: 10, windowMs: 60 * 60 * 1000 };

export function createApp(deps: {
  vision: FoodVision;
  rateLimit?: RateLimit | false;
  corsOrigins?: string[];
}) {
  const app = new Hono();
  const rateLimit = deps.rateLimit ?? DEFAULT_RATE_LIMIT;

  app.use("*", cors({ origin: deps.corsOrigins ?? [], allowMethods: ["POST"] }));

  const limitPerClient: MiddlewareHandler =
    rateLimit === false
      ? (_c, next) => next()
      : rateLimiter({
          windowMs: rateLimit.windowMs,
          limit: rateLimit.limit,
          standardHeaders: "draft-6",
          keyGenerator: clientIp,
          message: { error: "too many requests" },
        });

  app.post("/identify", limitPerClient, async (c) => {
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
      const foods = model.foods.map((food) => toFoodItem(food));
    if (foods.length === 0) {
        return c.json({ error: "no food found" }, 422);
      }
      const identified = foods.map((food) => ({
        brand: food.brand,
        product: food.product,
        variant: food.variant,
        genericName: food.genericName,
        confidence: food.confidence,
      }));
      const perServing = await deps.vision.calories(identified);
      const calories = perServing.reduce((total, value) => total + value, 0);
      return c.json({ foods, calories });
    } catch (error) {
      if (error instanceof Error && error.message === "calorie estimate failed") {
        return c.json({ error: error.message }, 502);
      }
      return c.json({ error: "food identification failed" }, 502);
    }
  });

  return app;
}

// Clients can prepend arbitrary X-Forwarded-For entries; only the last one is added by the proxy.
function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  const last = forwarded?.split(",").pop()?.trim();
  return last || "unknown";
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
