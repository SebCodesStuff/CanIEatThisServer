import { describe, expect, test } from "vitest";
import { loadConfig, startServer } from "../src/server.js";

describe("server config", () => {
  test("fails fast when the API key is missing", () => {
    expect(() => loadConfig({})).toThrow(/GEMINI_API_KEY/);
  });

  test("defaults the model, port, and loopback host", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key" })).toEqual({
      apiKey: "key",
      model: "gemini-3.5-flash-lite",
      port: 3000,
      hostname: "127.0.0.1",
    });
  });

  test("reads the model and port from the environment", () => {
    expect(
      loadConfig({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL: "gemini-3.8-flash",
        PORT: "4010",
      }),
    ).toEqual({
      apiKey: "key",
      model: "gemini-3.8-flash",
      port: 4010,
      hostname: "127.0.0.1",
    });
  });

  test("listens on 127.0.0.1", async () => {
    const running = await startServer({
      port: 0,
      vision: {
        async identify() {
          return { foods: [] };
        },
        async calories() {
          return [];
        },
      },
    });

    expect(running.hostname).toBe("127.0.0.1");
    expect(running.port).toBeGreaterThan(0);
    await running.close();
  });
});
