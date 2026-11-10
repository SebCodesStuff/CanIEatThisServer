import { describe, expect, test } from "vitest";
import { loadConfig, startServer } from "../src/server.js";

describe("server config", () => {
  test("fails fast when the API key is missing", () => {
    expect(() => loadConfig({})).toThrow(/GEMINI_API_KEY/);
  });

  test("defaults the model, port, loopback host, rate limit, and CORS origins", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key" })).toEqual({
      apiKey: "key",
      model: "gemini-3.5-flash-lite",
      port: 3000,
      hostname: "127.0.0.1",
      rateLimitPerHour: 10,
      rateLimitEnabled: true,
      corsOrigins: [],
    });
  });

  test("disables rate limiting when MODE is DEV", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key", MODE: "DEV" }).rateLimitEnabled).toBe(false);
  });

  test("keeps rate limiting on for any other MODE", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key", MODE: "PROD" }).rateLimitEnabled).toBe(true);
    expect(loadConfig({ GEMINI_API_KEY: "key", MODE: "dev" }).rateLimitEnabled).toBe(true);
  });

  test("reads the model, port, rate limit, and CORS origins from the environment", () => {
    expect(
      loadConfig({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL: "gemini-3.8-flash",
        PORT: "4010",
        RATE_LIMIT_PER_HOUR: "25",
        CORS_ORIGINS: " https://sebastian.dev, http://localhost:5173 ,",
      }),
    ).toEqual({
      apiKey: "key",
      model: "gemini-3.8-flash",
      port: 4010,
      hostname: "127.0.0.1",
      rateLimitPerHour: 25,
      rateLimitEnabled: true,
      corsOrigins: ["https://sebastian.dev", "http://localhost:5173"],
    });
  });

  test("rejects a rate limit that is not a positive integer", () => {
    expect(() => loadConfig({ GEMINI_API_KEY: "key", RATE_LIMIT_PER_HOUR: "0" })).toThrow(
      /RATE_LIMIT_PER_HOUR/,
    );
    expect(() => loadConfig({ GEMINI_API_KEY: "key", RATE_LIMIT_PER_HOUR: "abc" })).toThrow(
      /RATE_LIMIT_PER_HOUR/,
    );
  });

  test("reads the bind host from HOST so a container can listen on all interfaces", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key", HOST: " 0.0.0.0 " }).hostname).toBe("0.0.0.0");
  });

  test("listens on 127.0.0.1 by default", async () => {
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

  test("listens on the configured host", async () => {
    const running = await startServer({
      port: 0,
      hostname: "0.0.0.0",
      vision: {
        async identify() {
          return { foods: [] };
        },
        async calories() {
          return [];
        },
      },
    });

    expect(running.hostname).toBe("0.0.0.0");
    await running.close();
  });
});
