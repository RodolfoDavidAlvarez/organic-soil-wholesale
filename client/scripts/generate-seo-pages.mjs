import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const products = [
  {
    name: "Simon's Gold",
    category: "Dairy Compost",
    slug: "simons-gold",
    title: "Simon's Gold Dairy Compost",
    description: "Slow-release dairy compost for feeding, rebuilding, and conserving soil in beds, trees, planted areas, and Arizona landscape projects.",
    image: "/images/optimized/dansgold9lbs-1.jpg",
    keywords: "dairy compost, organic compost Phoenix, Arizona compost, soil amendment, bulk compost, compost for gardens, compost for trees",
    offers: [
      ["9 lb Bag", 12.46],
      ["40 lb Bag (1 cu ft)", 24.9],
      ["Super Sack (~2,000 lb)", 150],
      ["Truckload (~24 tons)", 720],
    ],
  },
  {
    name: "Mikey's Worm Poop",
    category: "Worm Castings",
    slug: "mikeys-worm-poop",
    title: "Mikey's Worm Poop Worm Castings",
    description: "Nutrient-rich worm castings for root zones, top dressing, seed starts, garden beds, and soil biology support.",
    image: "/images/optimized/mikeys-worm-poop9lbs.jpg",
    keywords: "worm castings, vermicompost, worm poop fertilizer, root zone amendment, soil biology, worm castings Phoenix",
    offers: [
      ["9 lb Bag", 18.1],
      ["40 lb Bag (1 cu ft)", 34.9],
      ["Super Sack (~2,000 lb)", 399],
    ],
  },
  {
    name: "PlantPal",
    category: "All-Stage Nursery Mix",
    slug: "plantpal",
    title: "PlantPal All-Stage Nursery Mix",
    description: "All-stage nursery potting mix for seed starts, propagation, containers, nurseries, and patio planters.",
    image: "/images/optimized/plantpal10lbs.jpg",
    keywords: "nursery potting mix, all stage potting soil, PlantPal, container soil, seed starter mix, propagation soil, Phoenix potting soil",
    offers: [
      ["1 cu ft Bag", 10.99],
      ["Super Sack (2.2 cu yd)", 247.28],
      ["Truckload (22 pallets)", 4896.05],
    ],
  },
  {
    name: "Nature's Blanket Premium",
    category: "Premium Dark Mulch",
    slug: "natures-blanket-premium",
    title: "Nature's Blanket Premium Dark Mulch",
    description: "Dark premium mulch for landscape finish, moisture retention, weed suppression, gardens, farms, and commercial properties.",
    image: "/images/optimized/natures-blanket-bag-studio.jpg",
    keywords: "premium mulch, dark mulch, organic mulch Phoenix, landscape mulch, mulch delivery, Nature's Blanket Premium",
    offers: [
      ["2 cu ft Bag", 10.99],
      ["Super Sack (2.2 cu yd)", 137.5],
      ["Truckload (~90 cu yd)", 2700],
    ],
  },
  {
    name: "Sabrina Kills Bugs",
    category: "All-Organic Insecticide",
    slug: "sabrina-kills-bugs",
    title: "Sabrina Kills Bugs",
    description: "32 oz plant-based insecticide spray. 3-in-1 fungicide, insecticide, and miticide. No neem oil or soap.",
    image: "/images/products/sabrina-kills-bugs-share.jpg",
    imageType: "image/jpeg",
    imageWidth: "1200",
    imageHeight: "1200",
    keywords: "Sabrina Kills Bugs, organic insecticide, plant based insecticide Phoenix, garden spray",
    offers: [
      ["32 oz Bottle", 18.99],
      ["1 Gallon", 89.99],
    ],
  },
];

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
  offers: product.offers.map(([name, price]) => ({
    "@type": "Offer",
    name: `${product.name} - ${name}`,
    price,
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: absoluteUrl(`/products/${product.slug}`),
    seller: {
      "@type": "LocalBusiness",
      name: BUSINESS_NAME,
    },
  })),
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
    title: "Wholesale Organic Soil Products | Organic Soil Wholesale",
    description: "Buy the four fastest pickup products online: dairy compost, worm castings, PlantPal nursery mix, and Nature's Blanket Premium mulch.",
    keywords: "wholesale compost, organic soil catalog, worm castings wholesale, premium potting soil, organic mulch Phoenix",
    canonical: absoluteUrl("/products"),
    schemas: [localBusinessSchema, itemListSchema],
  },
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

const writeRoute = async (template, route) => {
  const html = cleanHead(template).replace("</head>", () => `${headForRoute(route)}\n  </head>`);
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
