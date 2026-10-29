import { describe, expect, test } from "vitest";
import { FOOD_IDENTIFY_PROMPT } from "../src/identify-food.js";

describe("food identify prompt", () => {
  test("asks for a specific visible product and forbids guessed brands", () => {
    const prompt = FOOD_IDENTIFY_PROMPT.toLowerCase();
    expect(prompt).toMatch(/never guess|do not guess/);
    expect(prompt).toContain("generic");
    expect(prompt).toMatch(/one entry per|one food/);
  });
});
