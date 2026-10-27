/**
 * Featured product slot definitions for the redesigned Products page.
 * Mirrors the four-main-product structure of the MyOrganicSoil sales platform.
 *
 * Slugs use the brand-name pattern from generateProductSlug() so that clicking
 * a card opens the existing ProductDetail page without changes to routing.
 */

export interface FeaturedProductSlot {
  productId?: number;
  slug: string;
  displayTitle: string;
  productName: string;
  tagline: string;
  heroImage: string;
  thumbnailImage?: string;
  /** Branded bag studio shot — overlaid on top of the bestfor collage on the card */
  bagImage?: string;
  /** Product texture close-up — shown as a small badge in the lower-left corner */
  textureImage?: string;
  /** Optional small thumbnail strip — texture, bag back, etc. */
  altImages?: { src: string; label: string }[];
  blurb: string;
  sizes: string[];
  badge?: string;
  ctaLabel?: string;
  href?: string;
}

/** The 4 main products — full-bleed hero cards at the top of /products */
export const MAIN_PRODUCTS: FeaturedProductSlot[] = [
  {
    productId: 111,
    slug: "plantpal",
    displayTitle: "PlantPal Plus",
    productName: "All-Stage Potting Mix",
    tagline: "Seed to sale. Out of the bag.",
    heroImage: "/images/optimized/plantpal-bestfor.jpg",
    thumbnailImage: "/images/optimized/plantpal-lifestyle.jpg",
    bagImage: "/images/optimized/plantpal-with-veggies.jpg",
    altImages: [
      { src: "/images/optimized/plantpal-with-veggies.jpg", label: "In use" },
      { src: "/images/optimized/plantpal-bag-context.jpg", label: "Bag" },
    ],
    blurb:
      "All-stage potting mix with dairy compost, worm castings, clean wood fiber, calcium, and zinc sulfate. Seed starter, propagation, containers, and patio planters.",
    sizes: ["1.5 cu ft bag", "Tote / Super Sack", "Truckload"],
    badge: "Potting mix",
  },
  {
    slug: "worm-castings",
    displayTitle: "Worm Castings",
    productName: "Mikey's Worm Poop",
    tagline: "Pure vermicompost. Microbial powerhouse.",
    heroImage: "/images/optimized/mikeys-worm-poop-bestfor.jpg",
    thumbnailImage: "/images/optimized/mikeys-worm-poop-bestfor.jpg",
    bagImage: "/images/optimized/mikeys-worm-poop-bag-context.jpg",
    altImages: [
      { src: "/images/optimized/worm-castting-product-texture.jpg", label: "Texture" },
      { src: "/images/optimized/mikeys-worm-poop-lifestyle.jpg", label: "In use" },
    ],
    blurb:
      "Castings from our own worm farm. Add to any blend for a microbial boost, or apply straight as a top-dress. OMRI-eligible.",
    sizes: ["9 lb bag", "1 CF bag", "Tote / Super Sack", "Truckload"],
    badge: "Microbe boost",
  },
  {
    slug: "dairy-compost",
    displayTitle: "Dairy Compost",
    productName: "Simon's Gold",
    tagline: "The flagship. 60,000 tons a year.",
    heroImage: "/images/optimized/simons-gold-bestfor.jpg",
    thumbnailImage: "/images/optimized/simons-gold-lifestyle.jpg",
    bagImage: "/images/optimized/simons-gold-bag-context.jpg",
    altImages: [
      { src: "/images/optimized/compost-texture-look.jpg", label: "Texture" },
      { src: "/images/optimized/simons-gold-lifestyle.jpg", label: "In use" },
    ],
    blurb:
      "Composted Arizona dairy. The base material for nurseries, landscape contractors, and farms across the Southwest. Truckloads, totes, pallets, and bags.",
    sizes: ["9 lb bag", "1 CF bag", "Tote / Super Sack", "Bulk truckload"],
    badge: "Flagship",
  },
  {
    slug: "amendments",
    displayTitle: "Soil Amendments",
    productName: "Mineral & Biological",
    tagline: "Biochar, zeolite, mycorrhizae, more.",
    heroImage: "/images/optimized/amazonian-dark-earth-bestfor.jpg",
    thumbnailImage: "/images/optimized/zeolite-bestfor.jpg",
    altImages: [
      { src: "/images/optimized/biochar-product-texture-look.jpg", label: "Biochar" },
      { src: "/images/optimized/skm-product-texture-look.jpg", label: "SKM" },
      { src: "/images/optimized/zeolite-bestfor.jpg", label: "Zeolite" },
    ],
    blurb:
      "Mineral and biological amendments to mix into any base. Carbo Charge (biochar), Amazonian Dark Earth, Zeolite, SKMicroSource, Stoned Ape's mycorrhizae.",
    sizes: ["1 CF bag", "Tote / Super Sack", "Bulk"],
    badge: "Curated",
    ctaLabel: "Shop the line",
    href: "#amendments-line",
  },
];

/** Specialty blends row — orchard/vineyard targeted */
export const SPECIALTY_BLENDS: FeaturedProductSlot[] = [
  {
    productId: 1007,
    slug: "seriokais-secret-blend",
    displayTitle: "Seriokai's Secret",
    productName: "Avocado & Citrus Plant Food",
    tagline: "For groves and backyards.",
    heroImage: "/images/optimized/seriokais-secret-blend-bestfor.jpg",
    bagImage: "/images/optimized/seriokai10lbs.jpg",
    textureImage: "/images/optimized/default-potting-soil-texture.jpg",
    blurb:
      "Built for avocado, lemon, lime, orange, and grapefruit. Balanced macros, slow-release minerals, microbial inoculant.",
    sizes: ["1 CF bag", "Tote", "Bulk"],
  },
  {
    productId: 1006,
    slug: "bacchus-blend",
    displayTitle: "Bacchus Blend",
    productName: "Vineyard Blend",
    tagline: "Wine, table, raisin grapes.",
    heroImage: "/images/optimized/bacchus-blend-bestfor.jpg",
    bagImage: "/images/optimized/bacchus1cf.jpg",
    textureImage: "/images/optimized/default-potting-soil-texture.jpg",
    blurb:
      "Designed with vineyard managers for soil structure, root expansion, and water efficiency in AZ and CA grape rows.",
    sizes: ["1 CF bag", "Tote", "Bulk"],
  },
  {
    productId: 1008,
    slug: "pomona-blend",
    displayTitle: "Pomona Blend",
    productName: "Pome & Stone Fruit Food",
    tagline: "Peach, plum, apple, pistachio.",
    heroImage: "/images/optimized/pomona-blend-bestfor.jpg",
    bagImage: "/images/optimized/pomona10lbs.jpg",
    textureImage: "/images/optimized/default-potting-soil-texture.jpg",
    blurb:
      "The orchard blend. Used at Wilcox pistachio operations and stone-fruit growers across central AZ.",
    sizes: ["1 CF bag", "Tote", "Bulk"],
  },
];

/** Mulch row */
export const MULCH_PRODUCTS: FeaturedProductSlot[] = [
  {
    productId: 134,
    slug: "natures-blanket",
    displayTitle: "Nature's Blanket",
    productName: "Organic Mulch",
    tagline: "Wood fiber + dairy compost.",
    heroImage: "/images/optimized/natures-blanket-lifestyle.jpg",
    thumbnailImage: "/images/optimized/natures-blanket-bestfor.jpg",
    bagImage: "/images/optimized/natures-blanket-bag-context.jpg",
    textureImage: "/images/optimized/mulch-texture-hand.jpg",
    blurb:
      "Wood fiber mulch enhanced with Simon's Gold dairy compost. Suppresses weeds, holds moisture, and slowly feeds the soil.",
    sizes: ["2 CF bag", "Tote", "Flatbed (22 pallets)"],
  },
  {
    productId: 3000,
    slug: "natures-blanket-premium",
    displayTitle: "Nature's Blanket Premium",
    productName: "Premium Dark Mulch",
    tagline: "Dark, dense, dressy.",
    heroImage: "/images/optimized/natures-blanket-premium-lifestyle.jpg",
    thumbnailImage: "/images/optimized/natures-blanket-premium-bestfor.jpg",
    bagImage: "/images/optimized/natures-blanket-bag-studio.jpg",
    textureImage: "/images/optimized/mulch-texture-hand.jpg",
    blurb:
      "Premium dark mulch enriched with worm castings and dairy compost for healthy soil cover, moisture retention, weed suppression, and clean landscape finish.",
    sizes: ["2 CF bag", "Tote", "Bulk pickup", "Loose truckload", "Flatbed (22 pallets)"],
  },
];

/** Other amendments row — small grid of utility products */
export const OTHER_AMENDMENTS: FeaturedProductSlot[] = [
  {
    productId: 1002,
    slug: "amazonian-dark-earth",
    displayTitle: "Amazonian Dark Earth",
    productName: "Biochar Mineral",
    tagline: "Carbon for soil structure.",
    heroImage: "/images/optimized/amazonian-dark-earth-bestfor.jpg",
    bagImage: "/images/optimized/amazonian1cf.jpg",
    textureImage: "/images/optimized/biochar-product-texture-look.jpg",
    blurb: "Charcoal-based amendment that builds long-term soil structure and water retention.",
    sizes: ["1 CF bag", "Tote", "Bulk"],
  },
  {
    productId: 1011,
    slug: "zeolite",
    displayTitle: "Zeolite",
    productName: "Mineral Soil Conditioner",
    tagline: "Holds nutrients. Releases slow.",
    heroImage: "/images/optimized/zeolite-lifestyle.jpg",
    thumbnailImage: "/images/optimized/zeolite-bestfor.jpg",
    bagImage: "/images/optimized/zeolite10lbs.jpg",
    textureImage: "/images/optimized/default-potting-soil-texture.jpg",
    blurb: "Volcanic mineral that holds onto nitrogen and slowly releases it. CEC powerhouse.",
    sizes: ["1 CF bag", "Tote", "Bulk"],
  },
  {
    productId: 1012,
    slug: "skmicrosource",
    displayTitle: "SKMicroSource",
    productName: "Microbial Inoculant",
    tagline: "Living microbiome.",
    heroImage: "/images/optimized/skmicrosource-lifestyle.jpg",
    thumbnailImage: "/images/optimized/skmicrosource-bestfor.jpg",
    bagImage: "/images/optimized/sk-microsource10lbs.jpg",
    textureImage: "/images/optimized/skm-product-texture-look.jpg",
    blurb: "Diverse microbial inoculant to seed and maintain healthy soil biology.",
    sizes: ["1 CF bag", "Tote"],
  },
  {
    productId: 1009,
    slug: "stoned-apes-blend",
    displayTitle: "Stoned Ape's Blend",
    productName: "Mycorrhizal Root Enhancer",
    tagline: "Root-boost mycorrhizae.",
    heroImage: "/images/optimized/stoned-apes-blend-bestfor.jpg",
    bagImage: "/images/optimized/stoned-ape10lbs.jpg",
    textureImage: "/images/optimized/default-potting-soil-texture.jpg",
    blurb: "Fungal inoculant that builds a root–microbe symbiosis. Pairs with any base soil.",
    sizes: ["1 CF bag", "Tote"],
  },
];
