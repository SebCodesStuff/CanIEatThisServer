export const CALORIE_PROMPT = `You estimate calories for foods that are already identified. Do not look at a photo.

Each food is one serving. Ignore weights and visible portion size.

If brand is present, search the web for the published calories of that brand, product, and variant for one serving.

If brand is null, estimate a typical serving of genericName from similar foods. Do not invent a brand.

Return one integer calorie value per food, in the same order.`;

export const CALORIE_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: { type: "INTEGER" },
} as const;

export function parseCalories(value: unknown, count: number): number[] {
  if (!Array.isArray(value) || value.length !== count || !value.every(isCalorie)) {
    throw new Error("calorie estimate failed");
  }
  return value;
}

function isCalorie(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
