import catalogSeo from "@/data/catalogSeo.json";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, PHOENIX_YARD_ADDRESS } from "@/config/contact";

export const SITE_URL = "https://organicsoilwholesale.com";
export const SEO_BUSINESS_NAME = "Organic Soil Wholesale by Soil Seed & Water";
export const SEO_ADDRESS = {
  streetAddress: "1634 N 19th Ave",
  addressLocality: "Phoenix",
  addressRegion: "AZ",
  postalCode: "85009",
  addressCountry: "US",
};

export const SEO_OPENING_HOURS = [
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

// Same product identities and catalog copy used by the static SEO generator.
// Live product pages own prices and availability; do not duplicate them here.
export const CATALOG_SEO = catalogSeo;
export const PAY_PICKUP_PRODUCT_SEO = catalogSeo.products;

export const absoluteUrl = (path = "") => {
  if (!path) return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
};

export const buildLocalBusinessSchema = () => ({
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "Store"],
  name: SEO_BUSINESS_NAME,
  alternateName: "Organic Soil Wholesale",
  description: "Phoenix organic soil, compost, worm castings, potting soil, and mulch supplier for pickup, pallets, super sacks, and qualifying delivery.",
  url: SITE_URL,
  telephone: CUSTOMER_SUPPORT_PHONE_DISPLAY,
  address: {
    "@type": "PostalAddress",
    ...SEO_ADDRESS,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 33.4668,
    longitude: -112.0997,
  },
  openingHoursSpecification: SEO_OPENING_HOURS,
  priceRange: "$$",
  paymentAccepted: "Credit Card, Cash, Purchase Order",
  areaServed: [
    { "@type": "State", name: "Arizona" },
    { "@type": "City", name: "Phoenix" },
    { "@type": "Place", name: "Delivery available within 300 miles of Phoenix or Congress, Arizona" },
  ],
});

export const buildProductsItemListSchema = () => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Organic Soil Wholesale pickup products",
  itemListElement: PAY_PICKUP_PRODUCT_SEO.map((product, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: absoluteUrl(`/products/${product.slug}`),
    name: product.name,
    description: product.description,
  })),
});

export const buildYardMapSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Place",
  name: "Organic Soil Wholesale Phoenix Yard Pickup Entrance",
  description: "Pickup entrance map for Organic Soil Wholesale. Customers should enter from the Grand Ave south entrance and follow the yard lane to check-in/loading.",
  url: absoluteUrl("/yard-map"),
  telephone: CUSTOMER_SUPPORT_PHONE_DISPLAY,
  address: {
    "@type": "PostalAddress",
    ...SEO_ADDRESS,
  },
  containedInPlace: {
    "@type": "LocalBusiness",
    name: SEO_BUSINESS_NAME,
    address: PHOENIX_YARD_ADDRESS,
  },
});
