export const FOOD_IDENTIFY_PROMPT = `You identify food in a photo.

When a brand, product line, or variant is printed on the package or is unmistakable, include those visible words. A specific name such as "Quaker Oats Protein oatmeal" is better than "oatmeal".

Never guess a brand, product line, or variant. If it is not visible, set that field to null.

Always set genericName to the everyday food name, such as "oatmeal", even when a brand is visible.

Set confidence to high when the label is clearly readable, medium when the food is recognizable but the label is partial, and low when you are unsure.`;

const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type ModelFood = {
  brand: string | null;
  product: string | null;
  variant: string | null;
  genericName: string;
  confidence: Confidence;
};

export type FoodItem = {
  name: string;
  brand: string | null;
  product: string | null;
  variant: string | null;
  genericName: string;
  confidence: Confidence;
};

export const FOOD_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    foods: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          brand: { type: "STRING", nullable: true },
          product: { type: "STRING", nullable: true },
          variant: { type: "STRING", nullable: true },
          genericName: { type: "STRING" },
          confidence: { type: "STRING", enum: [...CONFIDENCE_LEVELS] },
        },
        required: ["brand", "product", "variant", "genericName", "confidence"],
      },
    },
  },
  required: ["foods"],
} as const;

export function toFoodItem(raw: ModelFood): FoodItem {
  const genericName = blankToNull(raw.genericName);
  if (!genericName || !isConfidence(raw.confidence)) {
    throw new Error("food identification failed");
  }

  const brand = blankToNull(raw.brand);
  if (!brand) {
    return {
      name: genericName,
      brand: null,
      product: null,
      variant: null,
      genericName,
      confidence: raw.confidence,
    };
  }

  const product = blankToNull(raw.product);
  const variant = blankToNull(raw.variant);
  const name = [brand, product, variant].filter((part): part is string => part !== null).join(" ");

  return {
    name,
    brand,
    product,
    variant,
    genericName,
    confidence: raw.confidence,
  };
}

function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isConfidence(value: unknown): value is Confidence {
  return typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}
