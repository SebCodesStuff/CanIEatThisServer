import { describe, expect, test } from "vitest";
import { createApp, type FoodVision } from "../src/app.js";

const vision: FoodVision = {
  async identify() {
    return { foods: [] };
  },
  async calories() {
    return [];
  },
};

const ALLOWED = "https://sebastian.dev";

function preflight(app: ReturnType<typeof createApp>, origin: string) {
  return app.request("/identify", {
    method: "OPTIONS",
    headers: { origin, "access-control-request-method": "POST" },
  });
}

function postFrom(app: ReturnType<typeof createApp>, origin: string) {
  const form = new FormData();
  form.append("note", "no photo");
  return app.request("/identify", {
    method: "POST",
    body: form,
    headers: { origin, "x-forwarded-for": "203.0.113.1" },
  });
}

describe("CORS", () => {
  test("answers a preflight from an allowed origin", async () => {
    const app = createApp({ vision, corsOrigins: [ALLOWED] });

    const response = await preflight(app, ALLOWED);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("adds the allow-origin header to responses for an allowed origin", async () => {
    const app = createApp({ vision, corsOrigins: [ALLOWED] });

    const response = await postFrom(app, ALLOWED);

    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  test("does not allow an origin that is not configured", async () => {
    const app = createApp({ vision, corsOrigins: [ALLOWED] });

    const response = await preflight(app, "https://evil.example");

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("allows no origins by default", async () => {
    const app = createApp({ vision });

    const response = await postFrom(app, ALLOWED);

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("includes the allow-origin header on rate-limited responses so the browser can read them", async () => {
    const app = createApp({
      vision,
      corsOrigins: [ALLOWED],
      rateLimit: { limit: 1, windowMs: 60_000 },
    });

    await postFrom(app, ALLOWED);
    const limited = await postFrom(app, ALLOWED);

    expect(limited.status).toBe(429);
    expect(limited.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });
});
