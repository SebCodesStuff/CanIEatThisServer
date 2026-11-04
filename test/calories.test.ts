import { describe, expect, test } from "vitest";
import { CALORIE_PROMPT, CALORIE_RESPONSE_SCHEMA, parseCalories } from "../src/calories.js";

describe("calorie prompt", () => {
  test("looks up a branded serving and estimates a generic one", () => {
    const prompt = CALORIE_PROMPT.toLowerCase();
    expect(prompt).toMatch(/already identified/);
    expect(prompt).toMatch(/do not look at a photo/);
    expect(prompt).toMatch(/one serving/);
    expect(prompt).toMatch(/weight/);
    expect(prompt).toMatch(/search the web/);
    expect(prompt).toMatch(/brand/);
    expect(prompt).toMatch(/variant/);
    expect(prompt).toMatch(/estimat/);
    expect(prompt).toMatch(/similar/);
    expect(prompt).toMatch(/do not invent a brand/);
  });
});

describe("calorie response schema", () => {
  test("is an integer array", () => {
    expect(CALORIE_RESPONSE_SCHEMA).toMatchObject({
      type: "ARRAY",
      items: { type: "INTEGER" },
    });
  });
});

describe("parseCalories", () => {
  test("returns the calorie integers when they line up with the foods", () => {
    expect(parseCalories([160, 0], 2)).toEqual([160, 0]);
  });

  test("rejects a missing array, a length mismatch, and a value that is not a non-negative integer", () => {
    expect(() => parseCalories({ calories: [1] }, 1)).toThrow(/calorie estimate failed/);
    expect(() => parseCalories(null, 0)).toThrow(/calorie estimate failed/);
    expect(() => parseCalories([1], 2)).toThrow(/calorie estimate failed/);
    expect(() => parseCalories([1.5], 1)).toThrow(/calorie estimate failed/);
    expect(() => parseCalories([-1], 1)).toThrow(/calorie estimate failed/);
    expect(() => parseCalories(["10"], 1)).toThrow(/calorie estimate failed/);
  });
});
