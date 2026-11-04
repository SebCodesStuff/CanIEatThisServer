import type { FoodVision } from "./app.js";
import { CALORIE_PROMPT, CALORIE_RESPONSE_SCHEMA, parseCalories } from "./calories.js";
import { FOOD_IDENTIFY_PROMPT, FOOD_RESPONSE_SCHEMA, type ModelFood } from "./identify-food.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
};

export type GeminiFetch = (url: string, init: RequestInit) => Promise<Response>;

export function createGeminiClient(options: {
  apiKey: string;
  model: string;
  fetch?: GeminiFetch;
}): FoodVision {
  const fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));

  return {
    async identify(image) {
      const parsed = await requestModel(
        fetchImpl,
        options,
        {
          contents: [
            {
              parts: [
                { text: FOOD_IDENTIFY_PROMPT },
                {
                  inlineData: {
                    mimeType: image.mimeType,
                    data: Buffer.from(image.bytes).toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: FOOD_RESPONSE_SCHEMA,
            thinkingConfig: thinkingConfig(options.model),
          },
        },
        "food identification failed",
      );

      if (!isFoodList(parsed)) {
        throw new Error("food identification failed");
      }
      return parsed;
    },

    async calories(foods) {
      const parsed = await requestModel(
        fetchImpl,
        options,
        {
          contents: [
            {
              parts: [{ text: CALORIE_PROMPT }, { text: JSON.stringify({ foods }) }],
            },
          ],
          ...(foods.some(hasBrand) ? { tools: [{ googleSearch: {} }] } : {}),
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: CALORIE_RESPONSE_SCHEMA,
            thinkingConfig: thinkingConfig(options.model),
          },
        },
        "calorie estimate failed",
      );
      return parseCalories(parsed, foods.length);
    },
  };
}

async function requestModel(
  fetchImpl: GeminiFetch,
  options: { apiKey: string; model: string },
  body: unknown,
  failure: string,
): Promise<unknown> {
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(options.model)}:generateContent`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": options.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(failure);
  }

  const payload = (await response.json()) as GenerateContentResponse;
  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("");
  if (!text) {
    throw new Error(failure);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(failure);
  }
}

function thinkingConfig(model: string): { thinkingBudget: 0 } | { thinkingLevel: "minimal" } {
  if (model.includes("2.5")) {
    return { thinkingBudget: 0 };
  }
  return { thinkingLevel: "minimal" };
}

function hasBrand(food: ModelFood): boolean {
  return typeof food.brand === "string" && food.brand.trim().length > 0;
}

function isFoodList(value: unknown): value is { foods: ModelFood[] } {
  return typeof value === "object" && value !== null && "foods" in value && Array.isArray(value.foods);
}
