/** OMRI certificate assets synced from SSW1 Airtable Certifications table. */

export type OmriCertificate = {
  sswId: string;
  name: string;
  websiteId: number | null;
  websiteSlug: string | null;
  goodThrough?: string | null;
  pdf: string;
  image: string;
};

export const OMRI_LOGO_SRC = "/omri-logo.png";
export const USCC_LOGO_SRC = "/uscc-logo.png";

export const OMRI_CERTIFICATES: OmriCertificate[] = [
  {
    sswId: "SSW-025",
    name: "Zeolite",
    websiteId: 1011,
    websiteSlug: "zeolite",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-025.pdf",
    image: "/documents/certifications/omri/images/web/ssw-025.webp",
  },
  {
    sswId: "SSW-026",
    name: "SKMicrosource",
    websiteId: 1012,
    websiteSlug: "skmicrosource",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-026.pdf",
    image: "/documents/certifications/omri/images/web/ssw-026.webp",
  },
  {
    sswId: "SSW-012",
    name: "Cultivator's Rose Blend",
    websiteId: 103,
    websiteSlug: "cultivators-rose-blend",
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-012.pdf",
    image: "/documents/certifications/omri/images/web/ssw-012.webp",
  },
  {
    sswId: "SSW-027",
    name: "Desert Defender",
    websiteId: 1013,
    websiteSlug: "desert-defender",
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-027.pdf",
    image: "/documents/certifications/omri/images/web/ssw-027.webp",
  },
  {
    sswId: "SSW-028",
    name: "CannaBag",
    websiteId: null,
    websiteSlug: null,
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-028.pdf",
    image: "/documents/certifications/omri/images/web/ssw-028.webp",
  },
  {
    sswId: "SSW-002",
    name: "Mikey's Worm Poop",
    websiteId: 1001,
    websiteSlug: "mikeys-worm-poop",
    goodThrough: "2024-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-002.pdf",
    image: "/documents/certifications/omri/images/web/ssw-002.webp",
  },
  {
    sswId: "SSW-010",
    name: "PropaGrow",
    websiteId: 114,
    websiteSlug: "propagrow",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-010.pdf",
    image: "/documents/certifications/omri/images/web/ssw-010.webp",
  },
  {
    sswId: "SSW-015",
    name: "Oasis Blend",
    websiteId: 1010,
    websiteSlug: "oasis-blend",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-015.pdf",
    image: "/documents/certifications/omri/images/web/ssw-015.webp",
  },
  {
    sswId: "SSW-001",
    name: "Simon's Gold",
    websiteId: 1000,
    websiteSlug: "simons-gold",
    goodThrough: "2024-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-001.pdf",
    image: "/documents/certifications/omri/images/web/ssw-001.webp",
  },
  {
    sswId: "SSW-024",
    name: "Amazonian Dark Earth",
    websiteId: 1002,
    websiteSlug: "amazonian-dark-earth",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-024.pdf",
    image: "/documents/certifications/omri/images/web/ssw-024.webp",
  },
  {
    sswId: "SSW-020",
    name: "Pomona Blend",
    websiteId: 1008,
    websiteSlug: "pomona-blend",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-020.pdf",
    image: "/documents/certifications/omri/images/web/ssw-020.webp",
  },
  {
    sswId: "SSW-019",
    name: "Seriokai's Secret Blend",
    websiteId: 1007,
    websiteSlug: "seriokais-secret-blend",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-019.pdf",
    image: "/documents/certifications/omri/images/web/ssw-019.webp",
  },
  {
    sswId: "SSW-004",
    name: "Garden Craft Blend",
    websiteId: null,
    websiteSlug: null,
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-004.pdf",
    image: "/documents/certifications/omri/images/web/ssw-004.webp",
  },
  {
    sswId: "SSW-006",
    name: "Artemis Root Boost Blend",
    websiteId: 1005,
    websiteSlug: "artemis-root-boost-blend",
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-006.pdf",
    image: "/documents/certifications/omri/images/web/ssw-006.webp",
  },
  {
    sswId: "SSW-008",
    name: "Turf Daddy Blend",
    websiteId: 1004,
    websiteSlug: "turf-daddy-blend",
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-008.pdf",
    image: "/documents/certifications/omri/images/web/ssw-008.webp",
  },
  {
    sswId: "SSW-007",
    name: "Tee Top Divot Repair Blend",
    websiteId: 1003,
    websiteSlug: "tee-top-divot-repair-blend",
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-007.pdf",
    image: "/documents/certifications/omri/images/web/ssw-007.webp",
  },
  {
    sswId: "SSW-009",
    name: "PlugBoost",
    websiteId: 112,
    websiteSlug: "plugboost",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-009.pdf",
    image: "/documents/certifications/omri/images/web/ssw-009.webp",
  },
  {
    sswId: "SSW-016",
    name: "Bacchus Blend",
    websiteId: 1006,
    websiteSlug: "bacchus-blend",
    goodThrough: "2025-09-01",
    pdf: "/documents/certifications/omri/pdf/ssw-016.pdf",
    image: "/documents/certifications/omri/images/web/ssw-016.webp",
  },
  {
    sswId: "SSW-003",
    name: "SuperBooster",
    websiteId: 4000,
    websiteSlug: "superbooster",
    goodThrough: "2025-06-01",
    pdf: "/documents/certifications/omri/pdf/ssw-003.pdf",
    image: "/documents/certifications/omri/images/web/ssw-003.webp",
  },
];

const bySlug = new Map(
  OMRI_CERTIFICATES.filter((c) => c.websiteSlug).map((c) => [c.websiteSlug as string, c]),
);
const byId = new Map(
  OMRI_CERTIFICATES.filter((c) => c.websiteId != null).map((c) => [c.websiteId as number, c]),
);

export function getOmriCertificate(opts: {
  slug?: string | null;
  productId?: number | null;
}): OmriCertificate | undefined {
  if (opts.slug && bySlug.has(opts.slug)) return bySlug.get(opts.slug);
  if (opts.productId != null && byId.has(opts.productId)) return byId.get(opts.productId);
  return undefined;
}

export function isOmriCertLabel(label: string): boolean {
  return /omri/i.test(label);
}

export function isUsccCertLabel(label: string): boolean {
  return /us\s*compost|uscc/i.test(label);
}
