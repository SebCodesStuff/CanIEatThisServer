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

function postFrom(app: ReturnType<typeof createApp>, forwardedFor: string) {
  const form = new FormData();
  form.append("note", "no photo");
  return app.request("/identify", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": forwardedFor },
  });
}

describe("POST /identify rate limit", () => {
  test("returns 429 once a client goes over the limit", async () => {
    const app = createApp({ vision, rateLimit: { limit: 2, windowMs: 60_000 } });

    expect((await postFrom(app, "203.0.113.1")).status).toBe(400);
    expect((await postFrom(app, "203.0.113.1")).status).toBe(400);
    const limited = await postFrom(app, "203.0.113.1");

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "too many requests" });
  });

  test("counts each client IP separately", async () => {
    const app = createApp({ vision, rateLimit: { limit: 1, windowMs: 60_000 } });

    expect((await postFrom(app, "203.0.113.1")).status).toBe(400);
    expect((await postFrom(app, "203.0.113.1")).status).toBe(429);
    expect((await postFrom(app, "203.0.113.2")).status).toBe(400);
  });

  test("keys on the IP the proxy appended, so a spoofed leading entry does not reset the count", async () => {
    const app = createApp({ vision, rateLimit: { limit: 1, windowMs: 60_000 } });

    expect((await postFrom(app, "1.1.1.1, 203.0.113.1")).status).toBe(400);
    expect((await postFrom(app, "2.2.2.2, 203.0.113.1")).status).toBe(429);
  });

  test("allows the client again after the window passes", async () => {
    const app = createApp({ vision, rateLimit: { limit: 1, windowMs: 50 } });

    expect((await postFrom(app, "203.0.113.1")).status).toBe(400);
    expect((await postFrom(app, "203.0.113.1")).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect((await postFrom(app, "203.0.113.1")).status).toBe(400);
  });
});
