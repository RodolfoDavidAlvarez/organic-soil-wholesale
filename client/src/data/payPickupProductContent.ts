/**
 * Shared content for the 4 pay-and-pickup main products.
 * Used on /products cards and product detail pages — add new mains here.
 */
export interface IngredientDetail {
  name: string;
  text: string;
}

export interface PayPickupProductContent {
  /** Customer-facing product type label (overrides API productType when set) */
  displayType?: string;
  description: string;
  /** Ingredients / components — rendered under an "Includes" label */
  includes: string[];
  /** Optional short story for each ingredient (product detail) */
  ingredientDetails?: IngredientDetail[];
  /** Long ingredient list, collapsed until the shopper opens it */
  ingredientDisclosure?: {
    /** Includes chip that opens the list */
    trigger: string;
    summary: string;
    items: string[];
  };
  /** Product-specific benefits or uses — optional, unique per product */
  benefits?: string[];
  startingPriceContext?: string;
  sizeSummaries?: string[];
  /** Public URL for downloadable spec sheet PDF */
  specSheetUrl?: string;
  specSheetLabel?: string;
}

export const PAY_PICKUP_PRODUCT_CONTENT: Record<number, PayPickupProductContent> = {
  1000: {
    description:
      "Slow-release nutrition and clean organic matter for feeding, rebuilding, and conserving soil. Easy to spread in beds, trees, and planted areas.",
    includes: ["Composted dairy manure"],
    benefits: ["Slow-release organic matter", "Improves soil structure", "Supports water conservation"],
    startingPriceContext: "for a 9 lb bag",
    sizeSummaries: ["9 lb bag", "40 lb bag (1 cu ft)", "super sack (~2,000 lb)", "bulk pickup (per ton)", "truckload (~24 tons)"],
  },
  1001: {
    description:
      "Nutrient-rich worm castings for pre-season feeding, root zones, top dressing, and mixing into soil blends.",
    includes: ["Premium worm castings"],
    benefits: ["Feeds root zones naturally", "Helps retain moisture", "Supports stronger soil biology"],
    startingPriceContext: "for a 9 lb bag",
    sizeSummaries: ["9 lb bag", "40 lb bag (1 cu ft)", "super sack (~2,000 lb)", "truckload (~24 tons)"],
  },
  111: {
    displayType: "All-Stage Potting Mix",
    description:
      "All-stage potting mix for seed starts, propagation, containers, and patio planters. Nutrition comes from our Super Booster organic concentrate.",
    includes: [
      "Dairy compost",
      "Worm castings",
      "Clean wood fiber",
      "Super Booster organic concentrate",
    ],
    ingredientDisclosure: {
      trigger: "Super Booster organic concentrate",
      summary: "We put our Super Booster organic concentrate in this mix.",
      items: [
        "Clean wood fiber",
        "Worm castings",
        "Biochar",
        "Kelp meal",
        "Zeolite",
        "Azomite",
        "Bioblend (Trackaderma, root shield)",
        "Mycorrhizal granular endo package",
        "Cyanobacteria",
        "Volcanic tuff (sulfur and potassium)",
        "Organic dairy compost",
        "Manganese",
        "Iron",
        "Magnesium",
        "Boron",
        "Zinc",
        "Calcium",
        "Molybdenum",
        "Cobalt",
        "Copper",
      ],
    },
    benefits: ["All-stage potting mix", "Balanced organic nutrition", "Ready out of the bag"],
    startingPriceContext: "for a 1.5 cu ft bag (~50 lb)",
    sizeSummaries: ["1.5 cu ft bag (~50 lb)", "super sack (2.2 cu yd)", "truckload (~60 cu yd)"],
  },
  3000: {
    description:
      "Premium dark mulch for clean landscape finish, moisture retention, and long-lasting soil cover.",
    includes: ["Wood fiber", "Worm castings", "Dairy compost"],
    benefits: [
      "Suppresses weeds",
      "Adds organic matter to beds",
      "Retains soil moisture",
      "Keeps root zones cooler",
    ],
    startingPriceContext: "for a 2 cu ft bag (~60 lb)",
    sizeSummaries: ["2 cu ft bag (~60 lb)", "super sack (2.2 cu yd)", "bulk pickup (per cu yd)", "truckload (~60 cu yd)"],
  },
  1034: {
    displayType: "All-Organic Insecticide",
    description:
      "32 oz ready-to-use spray. Plant-based essential oils. 3-in-1 fungicide, insecticide, and miticide. No neem oil, soap, or synthetic chemicals.",
    includes: [
      "Bergamot",
      "Cinnamon bark",
      "Cedarwood",
      "Clove",
      "Oregano",
      "Peppermint",
      "Rosemary",
      "White thyme",
    ],
    benefits: [
      "Pet friendly, bee friendly, and bird safe",
      "For vegetables, citrus, herbs, and ornamentals",
      "Also labeled for aquaponics, ponds, and indoor plants",
    ],
    startingPriceContext: "for a 32 oz bottle",
    sizeSummaries: ["32 oz bottle", "1 gallon"],
  },
  134: {
    displayType: "Organic Mulch",
    description:
      "Wood fiber mulch with dairy compost for weed suppression, moisture retention, and a clean landscape finish.",
    includes: ["Wood fiber", "Dairy compost"],
    benefits: [
      "Suppresses weeds",
      "Retains soil moisture",
      "Slow-release soil feeding",
      "Clean finished look",
    ],
    startingPriceContext: "for a 2 cu ft bag",
    sizeSummaries: ["2 cu ft bag", "super sack (2.2 cu yd)"],
  },
};

export const getPayPickupProductContent = (productId?: number): PayPickupProductContent | undefined =>
  productId ? PAY_PICKUP_PRODUCT_CONTENT[productId] : undefined;

export const getPayPickupProductDescription = (productId?: number, fallback = ""): string =>
  getPayPickupProductContent(productId)?.description ?? fallback;

export const getPayPickupProductType = (productId?: number, fallback?: string): string | undefined =>
  getPayPickupProductContent(productId)?.displayType ?? fallback;
