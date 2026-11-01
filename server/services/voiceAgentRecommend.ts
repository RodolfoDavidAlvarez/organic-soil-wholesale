export type Recommendation = {
  productId: number;
  productName: string;
  format: string;
  quantity: number;
  reason: string;
};

const NATURES_BLANKET_2CF = {
  productId: 134,
  productName: "Nature's Blanket Mulch",
  format: "2CF Bag",
  unitPrice: 8.99,
  unit: "per bag",
  cubicFeetPerBag: 2,
};

const SIMONS_GOLD_1CF = {
  productId: 1000,
  productName: "Simon's Gold Dairy Compost",
  format: "1CF Bag",
  unitPrice: 14.95,
  unit: "per bag",
  cubicFeetPerBag: 1,
};

const SIMONS_GOLD_9LB = {
  productId: 1000,
  productName: "Simon's Gold Dairy Compost",
  format: "9lb Bag",
  unitPrice: 6.95,
  unit: "per bag",
};

const WORM_CASTINGS_1CF = {
  productId: 1001,
  productName: "Mikey's Worm Poop Castings",
  format: "1CF Bag",
  unitPrice: 34.9,
  unit: "per bag",
  cubicFeetPerBag: 1,
};

const WORM_CASTINGS_9LB = {
  productId: 1001,
  productName: "Mikey's Worm Poop Castings",
  format: "9lb Bag",
  unitPrice: 18.1,
  unit: "per bag",
};

export const VOICE_CATALOG = [
  NATURES_BLANKET_2CF,
  SIMONS_GOLD_1CF,
  SIMONS_GOLD_9LB,
  WORM_CASTINGS_1CF,
  WORM_CASTINGS_9LB,
];

export function findCatalogItem(productId: number, format: string) {
  return VOICE_CATALOG.find(
    (p) => p.productId === productId && p.format === format,
  );
}

export function mulchForArea(
  squareFeet: number,
  depthInches: number,
): Recommendation {
  const cubicFeetNeeded = (squareFeet * depthInches) / 12;
  const bags = Math.max(1, Math.ceil(cubicFeetNeeded / NATURES_BLANKET_2CF.cubicFeetPerBag));
  return {
    productId: NATURES_BLANKET_2CF.productId,
    productName: NATURES_BLANKET_2CF.productName,
    format: NATURES_BLANKET_2CF.format,
    quantity: bags,
    reason: `${bags} bag${bags === 1 ? "" : "s"} of 2 cubic foot Nature's Blanket covers ${squareFeet} square feet at ${depthInches} inch${depthInches === 1 ? "" : "es"} deep.`,
  };
}

export function compostTopdress(squareFeet: number): Recommendation {
  const bags = Math.max(1, Math.ceil(squareFeet / 100));
  return {
    productId: SIMONS_GOLD_1CF.productId,
    productName: SIMONS_GOLD_1CF.productName,
    format: SIMONS_GOLD_1CF.format,
    quantity: bags,
    reason: `${bags} bag${bags === 1 ? "" : "s"} of 1 cubic foot Simon's Gold dairy compost gives a half-inch topdress over ${squareFeet} square feet.`,
  };
}

export function wormCastingsBoost(plantCount: number): Recommendation {
  const totalLbs = Math.max(1, plantCount);
  if (totalLbs <= 9) {
    return {
      productId: WORM_CASTINGS_9LB.productId,
      productName: WORM_CASTINGS_9LB.productName,
      format: WORM_CASTINGS_9LB.format,
      quantity: 1,
      reason: `One 9 lb bag of Mikey's Worm Poop covers ${plantCount} plant${plantCount === 1 ? "" : "s"} at one pound per plant.`,
    };
  }
  const cubicFeetBags = Math.ceil(totalLbs / 30);
  return {
    productId: WORM_CASTINGS_1CF.productId,
    productName: WORM_CASTINGS_1CF.productName,
    format: WORM_CASTINGS_1CF.format,
    quantity: cubicFeetBags,
    reason: `${cubicFeetBags} bag${cubicFeetBags === 1 ? "" : "s"} of 1 cubic foot Mikey's Worm Poop covers ${plantCount} plants with about a pound each.`,
  };
}

export function bundleSuggestion(currentCart: { productId: number; quantity: number }[]) {
  const compostBags = currentCart
    .filter((i) => i.productId === SIMONS_GOLD_1CF.productId)
    .reduce((sum, i) => sum + i.quantity, 0);
  const wormBags = currentCart
    .filter((i) => i.productId === WORM_CASTINGS_1CF.productId)
    .reduce((sum, i) => sum + i.quantity, 0);
  if (compostBags >= 4 && wormBags === 0) {
    return {
      productId: WORM_CASTINGS_1CF.productId,
      productName: WORM_CASTINGS_1CF.productName,
      format: WORM_CASTINGS_1CF.format,
      quantity: 1,
      reason:
        "Our top growers add a single bag of worm castings to a compost order this size. Want me to add one?",
    } as Recommendation;
  }
  return null;
}
