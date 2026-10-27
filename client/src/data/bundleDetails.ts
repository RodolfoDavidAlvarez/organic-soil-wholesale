/**
 * Editorial content for the three native pickup-bundle detail pages.
 * Prices, bag counts, sizes and checkout IDs remain in shared/promoBundles.js.
 *
 * Sources reviewed:
 * - Downloads/Garden-Refresh-99.pdf, Garden-Refresh-Plus-149.pdf and
 *   Big-Garden-Setup-399.pdf (original designer flyers, inspected visually).
 * - payPickupProductContent.ts: current product ingredients and intended uses.
 * - json/Amendment Products.json: compost and castings application guidance.
 * - json/Mulch Products.json: mulch depth and clearance from stems/trunks.
 * - json/Potting Soil Products.json: PlantPal is a ready-to-use growing mix.
 *
 * Do not reuse old JSON prices, certification claims or fixed growth promises.
 * The Big Garden flyer headline volume conflicts with its item quantities;
 * coverage copy here deliberately relies on the named contents, not that total.
 * Branded bag artwork identifies products; it is not a customer-result photo
 * and some artwork shows a smaller package than the bundle contains.
 */

export type BundleProductKey = "plantpal" | "simons" | "mikeys" | "mulch";

export interface BundleProductDetail {
  productKey: BundleProductKey;
  name: string;
  role: string;
  purpose: string;
  use: string;
  href: string;
  textureImage: string;
  textureAlt: string;
  textureWidth: number;
  textureHeight: number;
  bagImage: string;
  bagAlt: string;
  bagWidth: number;
  bagHeight: number;
}

export interface BundleDetail {
  summary: string;
  bestFor: string[];
  coverageNote: string;
  packagingNote: string;
  products: BundleProductKey[];
  steps: Array<{ title: string; text: string }>;
  faqs: Array<{ question: string; answer: string }>;
}

export const BUNDLE_PRODUCT_DETAILS: Record<
  BundleProductKey,
  BundleProductDetail
> = {
  plantpal: {
    productKey: "plantpal",
    name: "PlantPal Plus",
    role: "Your growing mix",
    purpose:
      "A ready-to-use potting mix that gives roots a balance of nutrition, air and moisture.",
    use: "Use as the planting mix in beds, containers and planters. Water thoroughly after planting.",
    href: "/products/plantpal",
    textureImage: "/images/optimized/default-potting-soil-texture.jpg",
    textureAlt: "Planting mix texture held in two hands",
    textureWidth: 1920,
    textureHeight: 1558,
    bagImage: "/images/optimized/plantpal-bag-context.webp",
    bagAlt: "PlantPal branded package artwork",
    bagWidth: 1800,
    bagHeight: 1800,
  },
  simons: {
    productKey: "simons",
    name: "Simon's Gold",
    role: "Feed and rebuild the soil",
    purpose:
      "Composted dairy manure adds organic matter and slow-release nutrition while improving soil structure.",
    use: "Blend into existing soil before planting, or topdress around established plants and water in.",
    href: "/products/simons-gold",
    textureImage: "/images/optimized/compost-texture-look.jpg",
    textureAlt: "Fine dairy compost held above an open bulk bag",
    textureWidth: 1920,
    textureHeight: 1440,
    bagImage: "/images/optimized/simons-gold-bag-context.webp",
    bagAlt: "Simon's Gold branded package artwork",
    bagWidth: 1800,
    bagHeight: 1800,
  },
  mikeys: {
    productKey: "mikeys",
    name: "Mikey's Worm Poop",
    role: "Support the root zone",
    purpose:
      "Worm castings bring organic nutrition and support soil biology where roots grow.",
    use: "Mix into planting soil or apply a thin topdressing around plants. Follow the product directions for your planting.",
    href: "/products/mikeys-worm-poop",
    textureImage: "/images/optimized/worm-castting-product-texture.jpg",
    textureAlt: "Fine dark worm castings held in two hands",
    textureWidth: 1920,
    textureHeight: 1920,
    bagImage: "/images/optimized/mikeys-worm-poop-bag-context.webp",
    bagAlt: "Mikey's Worm Poop branded package artwork",
    bagWidth: 1800,
    bagHeight: 1800,
  },
  mulch: {
    productKey: "mulch",
    name: "Nature's Blanket Premium",
    role: "Protect the soil surface",
    purpose:
      "Enhanced wood-fiber mulch helps hold soil moisture, shade the root zone and limit weeds.",
    use: "Spread on the surface, usually 2–3 inches deep. Keep it a few inches away from plant stems and tree trunks.",
    href: "/products/natures-blanket-premium",
    textureImage: "/images/optimized/mulch-texture-hand.jpg",
    textureAlt: "Wood-fiber mulch texture held in a hand",
    textureWidth: 1200,
    textureHeight: 900,
    bagImage: "/images/optimized/natures-blanket-bag-context.webp",
    bagAlt: "Nature's Blanket branded package artwork",
    bagWidth: 1799,
    bagHeight: 1800,
  },
};

const packagingNote =
  "Product artwork is for identification. Bag sizes and quantities are listed with each included item.";

const pickupFaq = {
  question: "Is delivery included?",
  answer:
    "Phoenix yard pickup is included in the bundle price. Delivery is quoted separately at checkout. Call us if you need help planning your order.",
};

const bedFaq = {
  question: "Does this include the raised bed?",
  answer:
    "This is a bundle of bagged growing materials. The bed frame, plants, irrigation and tools are not included.",
};

export const BUNDLE_DETAILS: Record<string, BundleDetail> = {
  "garden-refresh": {
    summary:
      "Refresh the soil you already have, then finish with a protective layer of enhanced mulch.",
    bestFor: [
      "An existing raised bed",
      "Seasonal soil replenishment",
      "Gardeners who already have planting soil",
    ],
    coverageNote:
      "For refreshing an existing 4×8 bed. Compost and castings amend the soil; mulch stays on top. This bundle is not a complete fill for an empty bed.",
    packagingNote,
    products: ["mulch", "simons", "mikeys"],
    steps: [
      {
        title: "Refresh the existing soil",
        text: "Before planting, work Simon's Gold into the existing bed. Around established plants, topdress gently and water in.",
      },
      {
        title: "Add the worm castings",
        text: "Blend Mikey's Worm Poop into the planting area, or apply a thin layer around existing plants.",
      },
      {
        title: "Finish with mulch",
        text: "Water the bed, then spread Nature's Blanket on the surface. Use the depth your planting needs and keep stems clear.",
      },
    ],
    faqs: [
      {
        question: "Can I use this to fill an empty bed?",
        answer:
          "Garden Refresh is for soil you already have. Choose a bundle with PlantPal Plus if you need growing mix, and measure the fill depth before ordering.",
      },
      {
        question: "Do I mix all the bags together?",
        answer:
          "Mix or topdress with the compost and worm castings. Keep the mulch as a separate surface layer.",
      },
      bedFaq,
      pickupFaq,
    ],
  },
  "garden-refresh-plus": {
    summary:
      "Add fresh growing mix, feed the root zone with worm castings, and cover the surface with the included mulch.",
    bestFor: [
      "Topping up an existing bed",
      "Adding fresh growing mix",
      "A bed that needs both soil and surface cover",
    ],
    coverageNote:
      "Includes 15 cu ft of PlantPal Plus, 3 cu ft of castings and 6 cu ft of mulch. Measure the space you need to fill; the mulch is surface cover, not planting depth.",
    packagingNote,
    products: ["plantpal", "mulch", "mikeys"],
    steps: [
      {
        title: "Add the growing mix",
        text: "Use PlantPal Plus to top up the bed or fill the measured planting space. It is ready to use straight from the bag.",
      },
      {
        title: "Work in the castings",
        text: "Mix Mikey's Worm Poop into the root zone, or reserve some for a thin topdressing around established plants.",
      },
      {
        title: "Plant, water and cover",
        text: "Water thoroughly after planting. Spread Nature's Blanket over the surface and keep it away from stems.",
      },
    ],
    faqs: [
      {
        question: "Is the mulch really included?",
        answer:
          "Yes. The three 2 cu ft bags of Nature's Blanket are included in the displayed bundle price.",
      },
      {
        question: "Will this fill any 4×8 bed?",
        answer:
          "The amount you need depends on the bed's depth and how much soil is already there. Measure the empty space and count the mulch separately.",
      },
      bedFaq,
      pickupFaq,
    ],
  },
  "big-garden-setup": {
    summary:
      "A larger supply of growing mix, dairy compost, worm castings and enhanced mulch for multiple beds or a deeper reset.",
    bestFor: [
      "Multiple raised beds",
      "Larger soil top-ups",
      "Gardeners who need all four growing materials",
    ],
    coverageNote:
      "For multiple 4×8 beds, depending on depth and existing soil. Measure each bed before ordering. PlantPal Plus, compost and castings belong in the planting area; reserve mulch for the surface.",
    packagingNote,
    products: ["plantpal", "simons", "mikeys", "mulch"],
    steps: [
      {
        title: "Plan and fill the beds",
        text: "Measure each bed's unfilled depth, then distribute the PlantPal Plus growing mix where it is needed.",
      },
      {
        title: "Add compost and castings",
        text: "Blend Simon's Gold and Mikey's Worm Poop into the planting area. Follow product directions and the needs of your existing soil.",
      },
      {
        title: "Water and protect the surface",
        text: "Water after planting, then apply Nature's Blanket as the top layer. Keep plant stems and tree trunks clear.",
      },
    ],
    faqs: [
      {
        question: "How many beds will this fill?",
        answer:
          "It depends on planting depth and existing soil. Use the volume of each included growing material to plan the fill, and calculate mulch separately as surface cover.",
      },
      {
        question: "Can I use it across existing beds?",
        answer:
          "Yes. You can divide the growing mix, compost and castings between beds that need replenishing, then mulch the surface of each bed.",
      },
      bedFaq,
      pickupFaq,
    ],
  },
};

export function getBundleDetails(
  slug?: string | null,
): BundleDetail | undefined {
  return slug ? BUNDLE_DETAILS[slug] : undefined;
}
