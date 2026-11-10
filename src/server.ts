import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { createApp, type FoodVision } from "./app.js";
import { createGeminiClient } from "./gemini-client.js";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_RATE_LIMIT_PER_HOUR = 10;

export type ServerConfig = {
  apiKey: string;
  model: string;
  port: number;
  hostname: string;
  rateLimitPerHour: number;
  rateLimitEnabled: boolean;
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const portText = env.PORT;
  const port = portText === undefined || portText.trim() === "" ? 3000 : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }

  const rateText = env.RATE_LIMIT_PER_HOUR?.trim() ?? "";
  const rateLimitPerHour = rateText === "" ? DEFAULT_RATE_LIMIT_PER_HOUR : Number(rateText);
  if (!Number.isInteger(rateLimitPerHour) || rateLimitPerHour < 1) {
    throw new Error("RATE_LIMIT_PER_HOUR must be a positive integer");
  }

  const corsOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    apiKey,
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    port,
    hostname: env.HOST?.trim() || DEFAULT_HOSTNAME,
    rateLimitPerHour,
    rateLimitEnabled: env.MODE !== "DEV",
    corsOrigins,
  };
}

export function startServer(options: {
  port: number;
  hostname?: string;
  vision: FoodVision;
  rateLimitPerHour?: number;
  rateLimitEnabled?: boolean;
  corsOrigins?: string[];
}): Promise<{
  hostname: string;
  port: number;
  close: () => Promise<void>;
}> {
  const app = createApp({
    vision: options.vision,
    rateLimit:
      options.rateLimitEnabled === false
        ? false
        : {
            limit: options.rateLimitPerHour ?? DEFAULT_RATE_LIMIT_PER_HOUR,
            windowMs: 60 * 60 * 1000,
          },
    corsOrigins: options.corsOrigins,
  });
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: options.hostname ?? DEFAULT_HOSTNAME,
        port: options.port,
      },
      (info) => {
        resolve({
          hostname: info.address,
          port: info.port,
          close: () => closeServer(server),
        });
      },
    );
    server.on("error", reject);
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const config = loadConfig(process.env);
  const vision = createGeminiClient({ apiKey: config.apiKey, model: config.model });
  startServer({
    port: config.port,
    hostname: config.hostname,
    vision,
    rateLimitPerHour: config.rateLimitPerHour,
    rateLimitEnabled: config.rateLimitEnabled,
    corsOrigins: config.corsOrigins,
  }).then((running) => {
    console.log(`listening on http://${running.hostname}:${running.port}`);
  });
}
