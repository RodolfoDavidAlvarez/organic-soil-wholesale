import {
  GIVEAWAY_CUSTOMER_TYPES,
  GIVEAWAY_FOLLOW_COPY,
  GIVEAWAY_GARDEN_STATUSES,
  GIVEAWAY_GROWING_OPTIONS,
  GIVEAWAY_SOCIAL_CHANNELS,
  GIVEAWAY_SOURCE,
} from "@shared/giveawayEntries.js";

/**
 * Phoenix Fall Garden Giveaway landing page (/win).
 * Entries are open. Server also defaults open unless GIVEAWAY_ENTRIES_OPEN=false.
 */
export const GIVEAWAY_DRAFT = {
  acceptingEntries: true,
  source: GIVEAWAY_SOURCE,
  campaignName: "September Big Garden Giveaway",
  eyebrow: "Phoenix. September is bigger than August.",
  headline: "Three winners. One huge garden giveaway.",
  subheadline:
    "Enter free in about 30 seconds for a chance to win a $5,000 garden — everything needed to set up two beds in the Phoenix Valley.",
  announcement: {
    date: "Saturday, October 3, 2026",
    time: "10:00 AM Phoenix time",
    event: "Big Garden Giveaway announcement",
    callRule: "Keep your phone nearby from 10–11 AM Phoenix time. We’ll call selected winners around 10:15–11 AM. You do not need to watch to win, but you must answer our call to claim your prize. If you do not answer, we will select another winner for that prize.",
  },
  cta: "Sign up in 30 seconds",
  heroImage: "/images/giveaway/complete-fall-garden-hero-v9.png",
  heroImageAlt:
    "Near-ground view of two tall eight-by-four raised beds full of harvest-ready vegetables, with open trellises, four product pallets, and separate raw-mulch and pea-gravel totes",
  video: {
    src: "/videos/giveaway/phoenix-september-garden-prize-web.mp4",
    poster: "/images/giveaway/phoenix-september-garden-prize-email-thumb.jpg",
    title: "September Big Garden Giveaway prize video",
  },
  prizeHighlights: [
    "3 Phoenix-area winners",
    "$5,000 garden: two beds, soil, compost, castings, mulch, and more",
    "Free entry in about 30 seconds",
  ],
  prizes: [
    {
      rank: "Grand Prize",
      title: "$5,000 Complete Garden",
      featured: true,
      items: [
        "Everything needed to set up 2 garden beds",
        "Two heavy-duty 4×8 raised garden bed kits",
        "Planting soil, dairy compost, and worm castings",
        "Mulch, gravel, soil cloth, and wood chips",
        "Beds, pathways, and garden instruction",
      ],
    },
    {
      rank: "Second Prize",
      title: "One Raised-Bed Starter Garden",
      featured: false,
      items: [
        "One 4×8 raised garden bed kit",
        "Natural 2×8 lumber and 4 fabricated steel corner posts",
        "Self-tapping assembly hardware",
        "Starter planting soil, compost, worm castings, and mulch package",
        "Setup instructions and a Phoenix planting guide",
      ],
    },
    {
      rank: "Third Prize",
      title: "A Full Pallet of Planting Soil",
      featured: false,
      items: [
        "One full pallet of premium planting soil",
        "Suitable for raised beds, containers, and garden projects",
        "Phoenix-area prize fulfillment",
      ],
    },
  ],
  supportVisuals: [
    {
      title: "Two full-size beds.",
      caption:
        "Each concept bed uses natural 2×8 lumber, three boards per side, with fabricated metal corner assemblies.",
      image: "/images/giveaway/rectangular-bed-view-v1.png",
      alt: "Straight wide view of two long rectangular raised beds with four product pallets behind them",
      items: [],
    },
    {
      title: "The build and ground prep.",
      caption:
        "The raw-mulch tote and pea-gravel tote are separate. Final supplied quantities remain pending approval.",
      image: "/images/giveaway/two-bed-components-v2.png",
      alt: "Organized raised-bed components with separate raw-mulch and pea-gravel totes, lumber, metal posts, cloth, screws, and dark mulch bags",
      items: [
        "Raw mulch tote",
        "Pea gravel tote",
        "Nature’s Blanket bags",
        "Landscape cloth",
        "2×8 lumber + posts",
        "Assembly hardware",
      ],
    },
  ],
  form: {
    title: "Sign up for the big giveaway.",
    intro: "Tell us who you are and what you want to grow. One entry per email. No purchase necessary.",
    followCopy: GIVEAWAY_FOLLOW_COPY,
    customerTypes: GIVEAWAY_CUSTOMER_TYPES,
    gardenStatuses: GIVEAWAY_GARDEN_STATUSES,
    growingOptions: GIVEAWAY_GROWING_OPTIONS,
    socialChannels: GIVEAWAY_SOCIAL_CHANNELS,
    emailConsent:
      "Email me important updates about this giveaway.",
    rulesConsent:
      "I am 18 or older, this is my only entry for this email, no purchase is necessary, and I can receive a prize in the Phoenix Valley or qualifying nearby areas. I understand that I must answer the winner call on October 3 to claim a prize; otherwise another winner will be selected.",
  },
} as const;
