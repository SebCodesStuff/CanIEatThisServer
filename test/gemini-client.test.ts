import { describe, expect, test, vi } from "vitest";
import { FOOD_IDENTIFY_PROMPT } from "../src/identify-food.js";
import { createGeminiClient } from "../src/gemini-client.js";

const modelFoods = {
  foods: [
    {
      brand: "Quaker",
      product: "Oats Protein",
      variant: "oatmeal",
      genericName: "oatmeal",
      confidence: "high",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createGeminiClient", () => {
  test("sends the optimized jpeg with minimal thinking and parses the foods", async () => {
    const image = Buffer.from("not-a-real-jpeg-but-the-client-forwards-bytes");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: "looking at the box" }, { text: JSON.stringify(modelFoods) }],
            },
          },
        ],
      }),
    );
    const client = createGeminiClient({
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
      fetch: fetchMock,
    });

    const result = await client.identify({ bytes: image, mimeType: "image/jpeg" });

    expect(result).toEqual(modelFoods);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    if (!init) {
      throw new Error("expected a fetch call");
    }
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(url).not.toContain("key=");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-goog-api-key": "test-key",
    });
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toBe(FOOD_IDENTIFY_PROMPT);
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: "image/jpeg",
      data: image.toString("base64"),
    });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(body.generationConfig.responseSchema.required).toContain("foods");
  });

  test("uses a zero thinking budget for Gemini 2.5 models", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ foods: [] }) }] } }],
      }),
    );
    const client = createGeminiClient({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      fetch: fetchMock,
    });

    await client.identify({ bytes: Buffer.from("x"), mimeType: "image/jpeg" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  test("throws when the model request fails", async () => {
    const client = createGeminiClient({
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
      fetch: vi.fn(async () => jsonResponse({ error: { message: "nope" } }, 500)),
    });

    await expect(client.identify({ bytes: Buffer.from("x"), mimeType: "image/jpeg" })).rejects.toThrow(
      /food identification failed/,
    );
  });
});
