import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROMO_BUNDLES } from "../../shared/promoBundles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "..");
const distRoot = path.join(clientRoot, "dist");
const templatePath = path.join(distRoot, "index.html");

const SITE_URL = "https://organicsoilwholesale.com";
const BUSINESS_NAME = "Organic Soil Wholesale by Soil Seed & Water";
const PHONE = "(623) 263-3386";
const ADDRESS = {
  streetAddress: "1634 N 19th Ave",
  addressLocality: "Phoenix",
  addressRegion: "AZ",
  postalCode: "85009",
  addressCountry: "US",
};

const absoluteUrl = (pathname = "") => {
  if (!pathname) return SITE_URL;
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) return pathname;
  return `${SITE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
};

// Use product imagery: the retired flyer graphics contain stale volume text.
const bundlePreview = (bundle) => bundle.slug === "garden-refresh"
  ? { path: "/images/bundles/natures-blanket-premium-texture-640.webp", width: "640", height: "480" }
  : { path: "/images/bundles/plantpal-texture-640.webp", width: "640", height: "519" };

const openingHours = [
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "08:00",
    closes: "13:00",
  },
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "14:00",
    closes: "16:00",
  },
];

// Shared with the rendered catalog. Prices and availability come from the live
// product API, so static SEO metadata must not publish a separate price list.
const catalogSeo = JSON.parse(await readFile(path.join(clientRoot, "src/data/catalogSeo.json"), "utf8"));
const products = catalogSeo.products;

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "Store"],
  name: BUSINESS_NAME,
  alternateName: "Organic Soil Wholesale",
  description: "Phoenix organic soil, compost, worm castings, potting soil, and mulch supplier for pickup, pallets, super sacks, and qualifying delivery.",
  url: SITE_URL,
  telephone: PHONE,
  address: {
    "@type": "PostalAddress",
    ...ADDRESS,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 33.4668,
    longitude: -112.0997,
  },
  openingHoursSpecification: openingHours,
  priceRange: "$$",
  paymentAccepted: "Credit Card, Cash, Purchase Order",
  areaServed: [
    { "@type": "State", name: "Arizona" },
    { "@type": "City", name: "Phoenix" },
    { "@type": "Place", name: "Delivery available within 300 miles of Phoenix or Congress, Arizona" },
  ],
};

const productSchema = (product) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: product.name,
  alternateName: product.title,
  description: product.description,
  image: absoluteUrl(product.image),
  brand: { "@type": "Brand", name: "Soil Seed & Water" },
  category: product.category,
  url: absoluteUrl(`/products/${product.slug}`),
});

const itemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Organic Soil Wholesale pickup products",
  itemListElement: products.map((product, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: absoluteUrl(`/products/${product.slug}`),
    name: product.name,
    description: product.description,
  })),
};

const routes = [
  ...Object.entries(JSON.parse(await readFile(path.join(clientRoot, 'src/pages/representative-card-data.json'), 'utf8'))).map(([slug, rep]) => ({
    path: '/rep/' + slug,
    title: rep.name + ' | Soil Seed & Water',
    description: 'Connect with ' + rep.name + ' at Soil Seed & Water. Local soil sales, online shopping, and direct contact details.',
    canonical: 'https://www.organicsoilwholesale.com/rep/' + slug,
    image: 'https://www.organicsoilwholesale.com/representative-assets/ssw-logo.png',
    schemas: [{ '@context': 'https://schema.org', '@type': 'Person', name: rep.name, jobTitle: rep.role, telephone: rep.tel, email: rep.email, url: 'https://www.organicsoilwholesale.com/rep/' + slug, worksFor: { '@type': 'Organization', name: 'Soil Seed & Water' } }],
  })),
  {
    path: "/",
    title: "Organic Soil Wholesale | Phoenix Compost, Soil & Mulch Pickup",
    description: "Organic Soil Wholesale by Soil Seed & Water sells Arizona compost, worm castings, potting soil, and mulch for pickup, pallets, super sacks, and qualifying delivery within 300 miles.",
    keywords: "organic soil Phoenix, compost Phoenix, mulch Phoenix, worm castings Phoenix, potting soil Phoenix",
    canonical: SITE_URL,
    schemas: [localBusinessSchema, itemListSchema],
  },
  {
    path: "/products",
    title: `${catalogSeo.title} | Organic Soil Wholesale`,
    description: catalogSeo.description,
    keywords: catalogSeo.keywords,
    canonical: absoluteUrl("/products"),
    schemas: [localBusinessSchema, itemListSchema],
  },
  {
    path: "/offers",
    title: "Soil & Raised Garden Bed Deals | Organic Soil Wholesale",
    description: `Compare Phoenix pickup bundles: ${PROMO_BUNDLES.map((bundle) => `${bundle.title} $${bundle.salePrice}`).join(", ")}. Explore the raised garden bed package, too.`,
    canonical: absoluteUrl("/offers"),
    image: absoluteUrl("/garden-bed/bundle-960.webp"),
    imageType: "image/webp",
    imageWidth: "960",
    imageHeight: "640",
    schemas: [
      localBusinessSchema,
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Phoenix pickup garden bundles",
        itemListElement: PROMO_BUNDLES.map((bundle, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: bundle.title,
          url: absoluteUrl(`/offers/${bundle.slug}`),
        })),
      },
    ],
  },
  ...PROMO_BUNDLES.map((bundle) => ({
    path: `/offers/${bundle.slug}`,
    title: `${bundle.title} | Organic Soil Wholesale`,
    description: `${bundle.title}: ${bundle.lpLine} ${bundle.phoenixYardPickup ? "Phoenix yard pickup" : "Congress pickup or delivery"} for $${bundle.salePrice} plus tax. Raised bed not included.`,
    canonical: absoluteUrl(`/offers/${bundle.slug}`),
    image: absoluteUrl(bundlePreview(bundle).path),
    imageType: "image/webp",
    imageWidth: bundlePreview(bundle).width,
    imageHeight: bundlePreview(bundle).height,
    schemas: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: bundle.title,
        description: bundle.description,
        sku: String(bundle.productId),
        image: absoluteUrl(bundlePreview(bundle).path),
        brand: { "@type": "Brand", name: "Soil Seed & Water" },
        url: absoluteUrl(`/offers/${bundle.slug}`),
        offers: {
          "@type": "Offer",
          price: bundle.salePrice,
          priceCurrency: "USD",
          url: absoluteUrl(`/offers/${bundle.slug}`),
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Deals", item: absoluteUrl("/offers") },
          { "@type": "ListItem", position: 2, name: bundle.title, item: absoluteUrl(`/offers/${bundle.slug}`) },
        ],
      },
    ],
  })),
  {
    path: "/pickup",
    title: "Organic Soil Pickup in Phoenix | Organic Soil Wholesale",
    description: "Buy organic soil, compost, worm castings, potting soil, and mulch online. Pick up at the Organic Soil Wholesale Phoenix yard at 1634 N 19th Ave.",
    keywords: "organic soil pickup Phoenix, compost near me, worm castings Phoenix, mulch pickup Phoenix, potting soil pickup",
    canonical: absoluteUrl("/pickup"),
    schemas: [localBusinessSchema, itemListSchema],
  },
  ...products.map((product) => ({
    path: `/products/${product.slug}`,
    title: `${product.title} | Organic Soil Wholesale`,
    description: product.description,
    keywords: product.keywords,
    canonical: absoluteUrl(`/products/${product.slug}`),
    image: absoluteUrl(product.image),
    imageType: product.imageType,
    imageWidth: product.imageWidth,
    imageHeight: product.imageHeight,
    schemas: [
      localBusinessSchema,
      productSchema(product),
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Products", item: absoluteUrl("/products") },
          { "@type": "ListItem", position: 2, name: product.name, item: absoluteUrl(`/products/${product.slug}`) },
        ],
      },
    ],
  })),
  {
    path: "/yard-map",
    title: "Phoenix Yard Pickup Map | Organic Soil Wholesale",
    description: "Pickup directions for Organic Soil Wholesale at 1634 N 19th Ave, Phoenix. Enter through the Grand Ave south entrance.",
    keywords: "Organic Soil Wholesale pickup map, 1634 N 19th Ave, Phoenix yard pickup, Grand Ave entrance",
    canonical: absoluteUrl("/yard-map"),
    schemas: [
      localBusinessSchema,
      {
        "@context": "https://schema.org",
        "@type": "Place",
        name: "Organic Soil Wholesale Phoenix Yard Pickup Entrance",
        description: "Customers should enter from the Grand Ave south entrance and follow the yard lane to check-in/loading.",
        url: absoluteUrl("/yard-map"),
        telephone: PHONE,
        address: { "@type": "PostalAddress", ...ADDRESS },
      },
    ],
  },
  {
    path: "/about",
    title: "About Organic Soil Wholesale | Soil Seed & Water",
    description: "Organic Soil Wholesale by Soil Seed & Water supplies Arizona compost, worm castings, potting soil, and mulch for landscape, garden, farm, and nursery projects.",
    keywords: "about Organic Soil Wholesale, Soil Seed & Water, Arizona compost supplier",
    canonical: absoluteUrl("/about"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/operations",
    title: "Our Operations: From Compost to Your Garden | Organic Soil Wholesale",
    description: "See how Soil Seed & Water brings together dairy composting, worm production, soil blending and Phoenix pickup. Explore our process and educational videos.",
    keywords: "Arizona composting operation, worm compost production, dairy compost, Soil Seed and Water operations, Congress Arizona",
    canonical: absoluteUrl("/operations"),
    image: absoluteUrl("/images/operations/compost-windrows-1200.webp"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/contact",
    title: "Contact Organic Soil Wholesale | Soil Seed & Water",
    description: "Call Organic Soil Wholesale at (623) 263-3386 or visit the Phoenix pickup yard at 1634 N 19th Ave.",
    keywords: "Organic Soil Wholesale phone, Soil Seed & Water contact, Phoenix compost supplier contact",
    canonical: absoluteUrl("/contact"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/survey",
    title: "How did we do? | Organic Soil Wholesale",
    description: "Tell Organic Soil Wholesale how your Phoenix yard visit or order felt. Short, honest feedback. Under a minute.",
    keywords: "Organic Soil Wholesale survey, Phoenix yard feedback, Soil Seed and Water customer survey",
    canonical: absoluteUrl("/survey"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/survey/garden-class",
    title: "How did Saturday feel? | The Garden Reset",
    description: "Honest notes on The Garden Reset at Organic Soil Wholesale. For people who registered or came on Saturday, August 22.",
    keywords: "Garden Reset survey, Phoenix garden class feedback, Organic Soil Wholesale class",
    canonical: absoluteUrl("/survey/garden-class"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/faq",
    title: "Organic Soil Wholesale FAQ | Pickup, Delivery & Bulk Soil",
    description: "Answers about Organic Soil Wholesale pickup, delivery, product formats, truckloads, pallets, super sacks, and organic soil products.",
    keywords: "Organic Soil Wholesale FAQ, compost pickup questions, soil delivery questions, bulk soil FAQ",
    canonical: absoluteUrl("/faq"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/products/garden-bed-kit",
    title: "4 × 8 Garden Bed Kit — $599 Launch Offer | Organic Soil Wholesale",
    description: "Request a $599 garden bed kit with four steel posts, lumber, pea gravel, and soil cloth. Limited-time launch offer. No payment today. Delivery, soil and mulch separate.",
    canonical: absoluteUrl("/products/garden-bed-kit"),
    image: absoluteUrl("/images/garden-bed/garden-bed-kit.webp"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/keep-growing",
    title: "Keep Growing With Us | Soil Seed & Water",
    description: "Be first to hear about future giveaways, garden tips, new products, and local events from Soil Seed & Water.",
    canonical: absoluteUrl("/keep-growing"),
    schemas: [localBusinessSchema],
  },
  {
    path: "/win",
    title: "Giveaway Complete · Keep Growing With Us | Soil Seed & Water",
    description: "Our October 3 giveaway is complete. Keep growing with Soil Seed & Water for future giveaways, garden tips, new products, and local events.",
    keywords: "Soil Seed & Water community, future giveaways, garden tips, Phoenix garden events",
    canonical: absoluteUrl("/win"),
    image: absoluteUrl("/images/giveaway/complete-fall-garden-hero-v9.png"),
    imageType: "image/png",
    imageWidth: "1536",
    imageHeight: "1024",
    schemas: [localBusinessSchema],
  },
  {
    path: "/careers",
    title: "Careers at Soil Seed & Water | Phoenix, Arizona",
    description: "Explore current career opportunities with Soil Seed & Water in Phoenix, Arizona. View open positions and apply online.",
    keywords: "Soil Seed and Water careers, Phoenix jobs, gardening careers Phoenix, soil jobs Arizona",
    canonical: "https://www.organicsoilwholesale.com/careers",
    image: "https://www.organicsoilwholesale.com/images/recruitment/sales-representative-hiring-square-2026.png",
    imageType: "image/png",
    imageWidth: "1254",
    imageHeight: "1254",
    schemas: [localBusinessSchema],
  },
  {
    path: "/careers/sales",
    title: "Sales Representative Career | Soil Seed & Water",
    description: "Apply for the Sales Representative position with Soil Seed & Water in Phoenix, Arizona. Gardening, organic growing, soil biology, and computer skills are preferred.",
    keywords: "Phoenix sales job, gardening job Phoenix, soil sales representative, organic growing careers",
    canonical: "https://www.organicsoilwholesale.com/careers/sales",
    image: "https://www.organicsoilwholesale.com/images/recruitment/sales-representative-hiring-square-2026.png",
    imageType: "image/png",
    imageWidth: "1254",
    imageHeight: "1254",
    schemas: [
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Sales Representative",
        description: "Help gardeners and growers choose products that build healthier soil. Gardening, organic growing, soil biology, customer service, and computer skills are preferred.",
        datePosted: "2026-09-02",
        employmentType: ["FULL_TIME", "PART_TIME"],
        directApply: true,
        hiringOrganization: {
          "@type": "Organization",
          name: "Soil Seed & Water",
          sameAs: "https://www.organicsoilwholesale.com",
        },
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Phoenix",
            addressRegion: "AZ",
            addressCountry: "US",
          },
        },
      },
    ],
  },
  {
    path: "/careers/truck-driver",
    title: "CDL Truck Driver in Congress, Arizona | Soil Seed & Water",
    description: "Apply for the CDL Truck Driver position with Soil Seed & Water in Congress, Arizona. Commercial driving, walking-floor, equipment, and bulk-material experience are valued.",
    keywords: "CDL truck driver Congress Arizona, commercial driver job Arizona, walking floor driver, bulk material driver",
    canonical: "https://www.organicsoilwholesale.com/careers/truck-driver",
    image: "https://www.organicsoilwholesale.com/images/pickup-formats/bulk-walking-floor-delivery.jpg",
    imageType: "image/jpeg",
    imageWidth: "1400",
    imageHeight: "1400",
    schemas: [
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "CDL Truck Driver",
        description: "Drive and deliver bulk soil materials safely from the Soil Seed & Water Congress operation. A current CDL is required; tractor-trailer, walking-floor, equipment, and bulk-material experience are valued.",
        datePosted: "2026-09-03",
        directApply: true,
        hiringOrganization: {
          "@type": "Organization",
          name: "Soil Seed & Water",
          sameAs: "https://www.organicsoilwholesale.com",
        },
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Congress",
            addressRegion: "AZ",
            addressCountry: "US",
          },
        },
      },
    ],
  },
  {
    path: "/free-worm-castings",
    title: "This offer is no longer available | Organic Soil Wholesale",
    description: "The August free worm castings community gift has ended. Browse current Phoenix pickup deals or products.",
    canonical: absoluteUrl("/free-worm-castings"),
    robots: "noindex, nofollow",
    schemas: [],
  },
  ...["/checkout", "/qr", "/check-in", "/order-confirmation", "/pay-and-pickup"].map((route) => ({
    path: route,
    title: "Organic Soil Wholesale",
    description: "Operational page for Organic Soil Wholesale customers.",
    canonical: absoluteUrl(route),
    robots: "noindex, nofollow",
    schemas: [],
  })),
];

const escapeAttr = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const cleanHead = (html) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+name=["']description["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\s+name=["']keywords["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\s+name=["']robots["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\s+property=["']twitter:[^"']+["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>\s*/gi, "\n");

const headForRoute = (route) => {
  const image = route.image || absoluteUrl("/images/og-image.jpg");
  const robots = route.robots || "index, follow";
  return `
    <title>${escapeAttr(route.title)}</title>
    <meta name="description" content="${escapeAttr(route.description)}" />
    ${route.keywords ? `<meta name="keywords" content="${escapeAttr(route.keywords)}" />` : ""}
    <meta name="robots" content="${escapeAttr(robots)}" />
    <link rel="canonical" href="${escapeAttr(route.canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeAttr(route.canonical)}" />
    <meta property="og:title" content="${escapeAttr(route.title)}" />
    <meta property="og:description" content="${escapeAttr(route.description)}" />
    <meta property="og:image" content="${escapeAttr(image)}" />
    ${route.imageType ? `<meta property="og:image:secure_url" content="${escapeAttr(image)}" />` : ""}
    ${route.imageType ? `<meta property="og:image:type" content="${escapeAttr(route.imageType)}" />` : ""}
    ${route.imageWidth ? `<meta property="og:image:width" content="${escapeAttr(route.imageWidth)}" />` : ""}
    ${route.imageHeight ? `<meta property="og:image:height" content="${escapeAttr(route.imageHeight)}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapeAttr(route.canonical)}" />
    <meta name="twitter:title" content="${escapeAttr(route.title)}" />
    <meta name="twitter:description" content="${escapeAttr(route.description)}" />
    <meta name="twitter:image" content="${escapeAttr(image)}" />
    ${route.schemas.map((schema) => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`).join("\n    ")}
  `;
};

const rlsFaqs = [
  {
    question: "What materials can I order?",
    answer: "Browse Turf Daddy Blend, Artemis Root Boost Blend, Nature's Blanket Premium, Simon's Gold, Mikey's Worm Poop, and PlantPal. Formats, current pricing, and availability are shown in the live catalog.",
  },
  {
    question: "Can I order online?",
    answer: "Eligible products and formats can be purchased through checkout. Specialty materials, topsoil, and delivery planning can be sent to the supply team for confirmation.",
  },
  {
    question: "Where is Phoenix pickup?",
    answer: "Pickup is fulfilled by Organic Soil Wholesale at 1634 N 19th Ave, Phoenix, AZ 85009. Choose an eligible pickup option and available time during checkout. Confirm loose-bulk arrangements before traveling.",
  },
  {
    question: "Can you deliver to my jobsite?",
    answer: "Delivery depends on the material, order size, destination, truck access, and schedule. Request a job quote to confirm availability and the delivered price.",
  },
  {
    question: "How do I estimate cubic yards?",
    answer: "Multiply the area in square feet by depth in inches, then divide by 324. This estimate excludes compaction and waste. Materials sold by weight need a supplier conversion.",
  },
];

const rlsGuides = JSON.parse(await readFile(path.join(clientRoot, "src/features/landscaper-supply/material-guides.json"), "utf8"));
const rlsProducts = rlsGuides.map((guide) => [guide.name, guide.summary]);

const rlsLocalBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "Store",
  "@id": "https://regenerativelandscapersupply.com/#business",
  name: "Regenerative Landscaper Supply",
  alternateName: "Regenerative Landscape Supply",
  url: "https://regenerativelandscapersupply.com/",
  logo: "https://regenerativelandscapersupply.com/rls-mark.svg",
  image: "https://regenerativelandscapersupply.com/images/optimized/mulch-texture-hand.jpg",
  description: "Landscape materials for professional crews in Phoenix and across Arizona, including compost, worm castings, turf blends, planting amendments, potting mix, and mulch. Ordering and fulfillment through Soil Seed & Water's Organic Soil Wholesale.",
  telephone: "+1-623-263-3386",
  address: { "@type": "PostalAddress", ...ADDRESS },
  parentOrganization: {
    "@type": "Organization",
    name: "Soil Seed & Water",
    url: "https://soilseedandwater.com/",
  },
  areaServed: [
    { "@type": "City", name: "Phoenix", containedInPlace: { "@type": "State", name: "Arizona" } },
    { "@type": "State", name: "Arizona" },
  ],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-623-263-3386",
    contactType: "customer service",
    areaServed: "US-AZ",
    availableLanguage: "English",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Landscape materials",
    itemListElement: rlsProducts.map(([name, description]) => ({ "@type": "OfferCatalog", name, description })),
  },
};

const rlsFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: rlsFaqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

const rlsStaticContent = `
  <main id="main-content" class="rls-seo-fallback">
    <header><a href="/" aria-label="Regenerative Landscaper Supply home">Regenerative Landscaper Supply</a></header>
    <h1>Landscape materials for the job ahead</h1>
    <p>Regenerative Landscaper Supply helps professional landscape crews source compost, soil blends, worm castings, planting amendments, potting mix, and mulch in Phoenix and across Arizona. Build a material list with current catalog pricing, purchase eligible items online, or request a job quote for specialty materials and delivery planning.</p>
    <p><a href="#materials">Browse landscape materials</a> · <a href="tel:+16232633386">Call (623) 263-3386</a></p>
    <section id="materials"><h2>Materials for landscape crews</h2><ul>${rlsGuides.map((guide) => `<li><a href="/materials/${guide.slug}"><strong>${guide.name}</strong></a> — ${guide.summary}</li>`).join("")}</ul></section>
    <section><h2>Phoenix pickup and Arizona jobsite delivery</h2><p>Phoenix pickup is fulfilled at Organic Soil Wholesale, 1634 N 19th Ave, Phoenix, AZ 85009. Select an eligible pickup option and available time during checkout. Jobsite delivery is confirmed based on material, load size, destination, truck access, and schedule. Specialty blends, topsoil, and delivery planning are available by quote.</p></section>
    <section><h2>Landscape material planning</h2><p>Estimate loose volume in cubic yards with: area in square feet × depth in inches ÷ 324. This estimate excludes compaction and waste. Materials sold by weight require a supplier conversion.</p></section>
    <section><h2>Frequently asked questions</h2>${rlsFaqs.map(({ question, answer }) => `<article><h3>${question}</h3><p>${answer}</p></article>`).join("")}</section>
    <p>Regenerative Landscaper Supply is a Soil Seed &amp; Water brand. Ordering and fulfillment are supported by Organic Soil Wholesale.</p>
  </main>`;

const writeRlsSeoSite = async (template) => {
  const canonical = "https://regenerativelandscapersupply.com/";
  const title = "Landscape Materials for Contractors in Phoenix, AZ | Regenerative Landscaper Supply";
  const description = "Order compost, turf blends, worm castings, planting amendments, potting mix, and mulch for landscape jobs in Phoenix and across Arizona. Live pricing, Phoenix pickup, and jobsite delivery quotes.";
  const image = "https://regenerativelandscapersupply.com/images/optimized/mulch-texture-hand.jpg";
  const graph = [
    { "@context": "https://schema.org", "@type": "WebSite", "@id": `${canonical}#website`, url: canonical, name: "Regenerative Landscaper Supply", publisher: { "@id": "https://soilseedandwater.com/#organization" }, inLanguage: "en-US" },
    { "@context": "https://schema.org", "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description, isPartOf: { "@id": `${canonical}#website` }, about: { "@id": "https://regenerativelandscapersupply.com/#business" }, inLanguage: "en-US" },
    rlsLocalBusinessSchema,
    rlsFaqSchema,
  ];
  const head = `
    <title>${escapeAttr(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="author" content="Regenerative Landscaper Supply" />
    <meta name="theme-color" content="#31543d" />
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" type="image/svg+xml" href="/rls-mark.svg" />
    <meta property="og:type" content="website" /><meta property="og:site_name" content="Regenerative Landscaper Supply" />
    <meta property="og:url" content="${canonical}" /><meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" /><meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="Landscape mulch material supplied by Regenerative Landscaper Supply" />
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" /><meta name="twitter:image" content="${image}" />
    ${graph.map((schema) => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`).join("\n")}
  `;
  const rlsHtml = cleanHead(template)
    .replace(/<!-- Each route preloads exactly[\s\S]*?<\/script>/, '<link rel="preload" as="image" href="/images/optimized/mulch-texture-hand.jpg" fetchpriority="high" />')
    .replace(/<div id="root"><\/div>/, `<div id="root">${rlsStaticContent}</div>`)
    .replaceAll('href="/favicon.ico"', 'href="/rls-mark.svg"')
    .replaceAll('href="/favicon-16x16.png"', 'href="/rls-mark.svg"')
    .replaceAll('href="/favicon-32x32.png"', 'href="/rls-mark.svg"')
    .replaceAll('href="/favicon.png"', 'href="/rls-mark.svg"')
    .replace('href="/site.webmanifest"', 'href="/rls.webmanifest"')
    .replace('<meta name="author" content="Organic Soil Wholesale" />', '<meta name="author" content="Regenerative Landscaper Supply" />')
    .replace('<meta name="msapplication-TileColor" content="#7BA05B" />', '<meta name="msapplication-TileColor" content="#31543D" />')
    .replace('<meta name="theme-color" content="#7BA05B" />', '<meta name="theme-color" content="#31543D" />')
    .replace("</head>", `${head}\n  </head>`);
  await writeFile(path.join(distRoot, "index.html"), rlsHtml);
  const materialPages = await Promise.all(rlsGuides.map(async (guide) => {
    const url = `https://regenerativelandscapersupply.com/materials/${guide.slug}`;
    const pageTitle = guide.title;
    const pageHead = `
      <title>${escapeAttr(pageTitle)}</title><meta name="description" content="${escapeAttr(guide.description)}" />
      <meta name="robots" content="index, follow, max-image-preview:large" /><link rel="canonical" href="${url}" />
      <meta property="og:type" content="product" /><meta property="og:site_name" content="Regenerative Landscaper Supply" />
      <meta property="og:url" content="${url}" /><meta property="og:title" content="${escapeAttr(pageTitle)}" />
      <meta property="og:description" content="${escapeAttr(guide.description)}" /><meta property="og:image" content="https://regenerativelandscapersupply.com${guide.image}" />
      <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeAttr(pageTitle)}" />
      <meta name="twitter:description" content="${escapeAttr(guide.description)}" /><meta name="twitter:image" content="https://regenerativelandscapersupply.com${guide.image}" />
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: guide.name,
        category: guide.category,
        description: guide.details,
        image: `https://regenerativelandscapersupply.com${guide.image}`,
        url,
        brand: { "@type": "Brand", name: "Soil Seed & Water" },
        manufacturer: { "@type": "Organization", name: "Soil Seed & Water", url: "https://soilseedandwater.com/" },
      })}</script>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: canonical },
          { "@type": "ListItem", position: 2, name: "Landscape materials", item: `${canonical}#materials` },
          { "@type": "ListItem", position: 3, name: guide.name, item: url },
        ],
      })}</script>
    `;
    const body = `<main id="main-content" class="rls-seo-fallback"><p><a href="/">Regenerative Landscaper Supply</a> / <a href="/#materials">Landscape materials</a> / ${guide.name}</p><h1>${guide.name}</h1><p>${guide.summary}</p><p>${guide.details}</p><img src="${guide.image}" alt="${escapeAttr(`${guide.name} for landscape projects`)}"/><h2>Where it fits on the job</h2><ul>${guide.uses.map((use) => `<li>${use}</li>`).join("")}</ul><p>Application rates and coverage vary with the material and site conditions. Confirm the recommended quantity and current availability before you schedule the crew.</p><h2>Phoenix pickup and Arizona delivery</h2><p>Pickup is fulfilled through Organic Soil Wholesale at 1634 N 19th Ave, Phoenix, AZ 85009. Jobsite delivery depends on the material, load size, destination, truck access, and schedule.</p><p><a href="/#materials">See live formats and prices</a> · <a href="/quote?product=${encodeURIComponent(guide.name)}">Request a job quote</a></p></main>`;
    const html = cleanHead(template).replace(/<!-- Each route preloads exactly[\s\S]*?<\/script>/, `<link rel="preload" as="image" href="${guide.image}" fetchpriority="high" />`).replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`).replaceAll('href="/favicon.ico"', 'href="/rls-mark.svg"').replaceAll('href="/favicon-16x16.png"', 'href="/rls-mark.svg"').replaceAll('href="/favicon-32x32.png"', 'href="/rls-mark.svg"').replaceAll('href="/favicon.png"', 'href="/rls-mark.svg"').replace('href="/site.webmanifest"', 'href="/rls.webmanifest"').replace('<meta name="author" content="Organic Soil Wholesale" />', '<meta name="author" content="Regenerative Landscaper Supply" />').replace('<meta name="msapplication-TileColor" content="#7BA05B" />', '<meta name="msapplication-TileColor" content="#31543D" />').replace('<meta name="theme-color" content="#7BA05B" />', '<meta name="theme-color" content="#31543D" />').replace("</head>", `${pageHead}\n  </head>`);
    const target = path.join(distRoot, "materials", guide.slug, "index.html");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, html);
    return { url, slug: guide.slug };
  }));
  await writeFile(path.join(distRoot, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /quote\nDisallow: /order-confirmation\nDisallow: /admin/\nDisallow: /portal/\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nSitemap: ${canonical}sitemap.xml\n`);
  await writeFile(path.join(distRoot, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[canonical, ...materialPages.map((page) => page.url)].map((url) => `<url><loc>${url}</loc><changefreq>weekly</changefreq><priority>${url === canonical ? "1.0" : "0.8"}</priority></url>`).join("")}</urlset>\n`);
  await writeFile(path.join(distRoot, "llms.txt"), `# Regenerative Landscaper Supply\n\n> Landscape materials for professional crews in Phoenix and across Arizona. A Soil Seed &amp; Water brand, with ordering and fulfillment supported by Organic Soil Wholesale.\n\n## Main site\n- https://regenerativelandscapersupply.com/ — Current materials, formats, live catalog pricing, material-list builder, volume calculator, pickup details, and quote requests.\n\n## Material guides\n${rlsGuides.map((guide) => `- https://regenerativelandscapersupply.com/materials/${guide.slug} — ${guide.name}: ${guide.summary}`).join("\n")}\n\n## Ordering and service\n- Eligible products and formats can be purchased online; specialty materials, topsoil, and delivery planning can be requested by quote.\n- Phoenix pickup is fulfilled by Organic Soil Wholesale at 1634 N 19th Ave, Phoenix, AZ 85009. Confirm loose-bulk pickup arrangements before traveling.\n- Jobsite delivery is confirmed by material, load size, destination, truck access, and schedule.\n- Volume estimate: area in square feet × depth in inches ÷ 324 = estimated cubic yards; excludes compaction and waste.\n- Customer support: (623) 263-3386.\n\n## Parent brand and fulfillment\n- Soil Seed &amp; Water: https://soilseedandwater.com/\n- Organic Soil Wholesale: https://organicsoilwholesale.com/\n`);
};

// Useful visible content is available before JavaScript runs. React replaces
// this fallback after loading, so crawlers and customers see the same facts.
const publicRouteBody = (route) => {
  const bundle = PROMO_BUNDLES.find((item) => route.path === `/offers/${item.slug}`);
  const product = products.find((item) => route.path === `/products/${item.slug}`);
  const header = `<header><a href="/">Organic Soil Wholesale</a><nav aria-label="Main navigation"><a href="/products">Shop soil</a> · <a href="/offers">Deals</a> · <a href="/operations">Our operations</a> · <a href="/contact">Contact</a></nav></header>`;
  let body = '';
  if (bundle) {
    body = `<h1>${escapeAttr(bundle.title)}</h1><p>${escapeAttr(bundle.description)}</p><p><strong>$${bundle.salePrice} plus tax</strong> · ${escapeAttr(bundle.bagLabel)} · ${escapeAttr(bundle.volumeLabel)}</p><h2>What is included</h2><ul>${bundle.items.map((item) => `<li>${escapeAttr(item.name)}: ${escapeAttr(item.amount)}</li>`).join('')}</ul><h2>Local pickup</h2><p>Order online for pickup at 1634 N 19th Ave, Phoenix, AZ 85009. Tuesday–Saturday, 8 am–1 pm and 2–4 pm. Delivery is quoted separately. Bed frame, plants, irrigation and tools are not included.</p><p>Coverage depends on bed size, fill depth and existing soil. Keep mulch on the surface.</p>`;
  } else if (route.path === '/offers') {
    body = `<h1>Garden bundles &amp; deals</h1><p>Compare bagged materials for Phoenix pickup.</p><ul>${PROMO_BUNDLES.map((item) => `<li><a href="/offers/${item.slug}">${escapeAttr(item.title)}</a> — $${item.salePrice} plus tax, ${escapeAttr(item.bagLabel)}. ${escapeAttr(item.includedLabel)}</li>`).join('')}</ul><h2>Heavy-duty raised garden bed bundle</h2><p>A 4 × 8 ft bed, 2 ft deep, with growing materials. <a href="/garden-bed-offer.html">See the current community offer and eligibility</a>. Assembly and plants are not included.</p>`;
  } else if (product) {
    body = `<h1>${escapeAttr(product.title)}</h1><p>${escapeAttr(product.description)}</p><p>Choose your size and quantity on this page for current pricing. Buy eligible formats online for pickup, or estimate delivery using your ZIP code.</p>`;
  } else if (route.path === '/' || route.path === '/products') {
    body = `<h1>${route.path === "/products" ? "Shop organic soil, compost and mulch" : "Organic soil. Happy gardens. Better value."}</h1><p>Shop dairy compost, worm castings, potting soil and enhanced mulch for Phoenix pickup and Arizona delivery.</p><ul>${products.map((item) => `<li><a href="/products/${item.slug}">${escapeAttr(item.title)}</a>: ${escapeAttr(item.description)}</li>`).join('')}</ul><h2>Healthy soil works in three ways</h2><p>Our focus is microbiology, plant nutrition and physical soil structure: organic matter, room for roots and air, and moisture retention.</p><p>Pickup at 1634 N 19th Ave, Phoenix, AZ 85009. Tuesday–Saturday, 8 am–1 pm and 2–4 pm. Delivery pricing depends on the material, load, access and destination.</p>`;
  } else if (route.path === '/operations') {
    body = `<h1>From raw material to living soil</h1><p>See Soil Seed &amp; Water's dairy composting, worm farming, blending and loading operations. We add cyanobacteria, also known as blue-green algae, to the water used on our dairy-compost windrows.</p><p>Explore real production photos and videos on this page, then <a href="/products">choose soil for your project</a>.</p>`;
  }
  return body ? `<div style="max-width:72rem;margin:auto;padding:2rem;font:1rem/1.6 system-ui;color:#264027">${header}<main>${body}<p><a href="tel:+16232633386">Call (623) 263-3386</a> for help choosing materials and delivery.</p><noscript><p>Enable JavaScript to select quantities and check out online, or call us to order.</p></noscript></main></div>` : '';
};

const writeRoute = async (template, route) => {
  const html = cleanHead(template).replace("</head>", () => `${headForRoute(route)}\n  </head>`).replace('<div id="root"></div>', () => `<div id="root">${publicRouteBody(route)}</div>`);
  const target =
    route.path === "/"
      ? path.join(distRoot, "index.html")
      : path.join(distRoot, route.path.replace(/^\//, ""), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
};

const template = await readFile(templatePath, "utf8");
if (process.env.VITE_DEFAULT_BRAND === "rls") {
  await writeRlsSeoSite(template);
  console.log("Generated Regenerative Landscaper Supply SEO, AI crawler, sitemap, and static content files.");
} else {
  await Promise.all(routes.map((route) => writeRoute(template, route)));
  console.log(`Generated SEO HTML for ${routes.length} routes.`);
}
