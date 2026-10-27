import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useRoute, Link } from "wouter";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SEO from "@/components/layout/SEO";
import { OptimizedImage } from "@/components/OptimizedImage";
import { generateProductSlug } from "@/utils/generateSlug";
import { extractYouTubeVideoId, YouTubePlayer } from "@/components/YouTubePlayer";
import { useQuoteCart } from "@/contexts/QuoteCartContext";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { getPayPickupProductContent, getPayPickupProductDescription, getPayPickupProductType } from "@/data/payPickupProductContent";
import {
  cartItemAllowsPhoenixYardPickup,
  isPayOnlineProduct,
  shouldHidePhoenixYardBulkSize,
} from "@shared/phoenixYardPickup.js";
import { PayPickupProductFacts } from "@/components/PayPickupProductFacts";
import TrustStrip from "@/components/TrustStrip";
import { ProductCertificationMarks } from "@/components/ProductCertificationMarks";
import AmazonReviewCarousel from "@/components/AmazonReviewCarousel";
import { amazonReviewsForProduct } from "@/data/amazonReviews";
import { getOmriCertificate } from "@/data/omriCertifications";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { SITE_URL, SEO_BUSINESS_NAME, absoluteUrl, buildLocalBusinessSchema } from "@/config/seo";
import { trackEcommerceEvent, trackEvent } from "@/lib/analytics";
import { HOURS_LABEL, PICKUP_LOCATIONS } from "@shared/pickupSchedule.js";
import { DeliveryQuoteWidget, type TruckingQuote } from "@/components/DeliveryQuoteWidget";
import { loadDeliveryDraft, saveDeliveryDraft } from "@/lib/deliveryDraft";
import { OrderCallbackDialog } from "@/components/OrderCallbackDialog";
import {
  cartFlatbedSpots,
  FLATBED_CAPACITY,
  isWalkingFloorDeliveryFormat,
  spotsForFormat,
} from "@/lib/flatbedSpots";
import type { CartItem } from "@/contexts/QuoteCartContext";
import {
  ArrowLeft,
  Leaf,
  ShoppingBag,
  FileText,
  Minus,
  Plus,
  Check,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Play,
  ImagePlus,
  Phone,
  MessageCircle,
  X,
  MapPin,
  ExternalLink,
  Download,
  ChevronDown,
  Clock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiProduct = {
  id: number;
  name: string;
  displayTitle?: string | null;
  display_title?: string | null;
  productType?: string | null;
  product_type?: string | null;
  category?: string | null;
  description?: string | null;
  marketingNote?: string | null;
  marketing_note?: string | null;
  story?: string | null;
  usage?: string | null;
  features?: string | null;
  targetAudience?: string | null;
  target_audience?: string | null;
  recommendedUses?: string | null;
  recommended_uses?: string | null;
  ingredients?: string | null;
  price?: number | string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  texturePhotoUrl?: string | null;
  texture_photo_url?: string | null;
  additionalImages?: string[] | null;
  additional_images?: string[] | null;
  videoUrls?: string[] | null;
  video_urls?: string[] | null;
  productVideoUrl?: string | null;
  product_video_url?: string | null;
  sizePriceOptions?: unknown;
  size_price_options?: unknown;
  npk?: string | null;
  certifications?: string | null;
  seoKeywords?: string | null;
  seo_keywords?: string | null;
  slug?: string | null;
};

type PriceTier = {
  size: string;
  price: number;
  msrp: number | null;
  unit: string;
  qty: number | null;
};

type SizeChoice = PriceTier & {
  kind: "single" | "pallet" | "bulk";
  displayLabel: string;
  subLabel: string;
  cartLabel: string;
  displayPrice: number;
  /** Strikethrough list price when a volume discount applies */
  compareAtPrice?: number;
  badge?: string;
  secondaryPriceLabel?: string;
};

type SizeCategory = {
  key: string;
  label: string;
  price: number;
  priceLabel: string;
  secondaryPriceLabel?: string;
  image: string;
  choices: SizeChoice[];
};

/** Volume incentive: pallet vs buying the same bags individually. */
const PALLET_VOLUME_DISCOUNT = 0.2;

const applyPalletDiscount = (listPrice: number) =>
  Number((listPrice * (1 - PALLET_VOLUME_DISCOUNT)).toFixed(2));

type Product = {
  id: number;
  slug: string;
  name: string;
  displayTitle: string;
  category: string;
  productType?: string;
  description: string;
  marketingNote?: string;
  usage?: string;
  targetAudience: string[];
  npk?: string;
  certifications: string[];
  imageUrl?: string;
  texturePhotoUrl?: string;
  additionalImages: string[];
  videoUrls: string[];
  priceTiers: PriceTier[];
  seoKeywords?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseDollars = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const extractQty = (size: string): number | null => {
  const m = size.match(/\((\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

const fmt = (n: number): string => {
  if (n >= 1000) return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  return `$${n.toFixed(2)}`;
};

/** Hero bag photo per main pay-and-pickup product. Mirrors the HERO_OVERRIDES
 *  map in PayPickupGrid.tsx so the cart line item shows the SAME photo the
 *  customer just tapped on the list. Update both maps together.
 *  Bag-in-context (Graphic 3) for bagged amendments; 2 CF studio bag for mulch. */
const HERO_BAG_PHOTO: Record<number, string> = {
  1000: "/images/optimized/simons-gold-bag-context.jpg",
  1001: "/images/optimized/mikeys-worm-poop-bag-context.jpg",
  111: "/images/optimized/plantpal-with-veggies.jpg",
  134: "/images/optimized/natures-blanket-bag-context.jpg",
  3000: "/images/optimized/natures-blanket-bag-studio.jpg",
};

/** New Graphics 2.0 lifestyle / use-case shots — inserted right after the hero bag. */
const NEW_GRAPHICS_2_GALLERY: Record<number, string[]> = {
  1000: [
    "/images/optimized/simons-gold-new-graphics-2-uses.jpg",
    "/images/optimized/simons-gold-new-graphics-2-lifestyle.jpg",
  ],
  1001: [
    "/images/optimized/mikeys-worm-new-graphics-2-uses.jpg",
    "/images/optimized/mikeys-worm-new-graphics-2-lifestyle.jpg",
  ],
  111: ["/images/optimized/plantpal-new-graphics-2-lifestyle.jpg"],
};

const GALLERY_DUPLICATE_GROUPS: Record<number, Record<string, string>> = {
  1000: {
    "/images/optimized/compost-texture-look.jpg": "simons-gold-hands-compost",
    "/uploads/products/1000/gallery-1/1763501397590-hb1oj0.webp": "simons-gold-hands-compost",
  },
  1001: {
    "/mikeys-worm-poop-bestfor.jpg": "mikeys-worm-hands",
    "/images/optimized/mikeys-worm-poop-bestfor.jpg": "mikeys-worm-hands",
    "/images/optimized/worm-castting-product-texture.jpg": "mikeys-worm-hands",
    "/uploads/products/1001/gallery-1/1763526684797-jzp3n6.webp": "mikeys-worm-hands",
    "/uploads/products/1001/gallery-1/1763526761040-2t7vpc.webp": "mikeys-worm-hands",
  },
};

const BLOCKED_GALLERY_IMAGES: Record<number, Set<string>> = {
  111: new Set([
    "ppl-7-5qt-texture.jpg",
    "/ppl-7-5qt-texture.jpg",
    "/images/optimized/ppl-7-5qt-texture.jpg",
    "/images/optimized/compost-texture-look.jpg",
    "/images/optimized/default-potting-soil-texture.jpg",
  ]),
  3000: new Set(["/uploads/products/3000/gallery-1/1764113182186-ohei8u.webp"]),
};

const normalizedGalleryUrl = (url: string) => {
  const clean = url.trim().toLowerCase().replace(/\?.*$/, "").replace(/#.*$/, "");
  if (!clean) return "";
  if (!clean.startsWith("/") && !clean.startsWith("http://") && !clean.startsWith("https://")) {
    return `/${clean}`;
  }
  try {
    const parsed = new URL(clean, window.location.origin);
    return parsed.pathname.toLowerCase();
  } catch {
    return clean;
  }
};

const isBlockedGalleryImage = (productId: number, url: string) => {
  const blocked = BLOCKED_GALLERY_IMAGES[productId];
  if (!blocked) return false;
  const normalized = normalizedGalleryUrl(url);
  if (blocked.has(normalized)) return true;
  const base = normalized.split("/").pop() ?? "";
  if (!base) return false;
  if (blocked.has(base) || blocked.has(`/${base}`)) return true;
  for (const entry of blocked) {
    const entryBase = entry.split("/").pop() ?? "";
    if (entryBase && entryBase === base) return true;
  }
  return false;
};

const guideImageDedupeKey = (url: string) => {
  const normalized = normalizedGalleryUrl(url);
  if (!normalized) return "";
  if (normalized.includes("plantpal-bag-in-context") || normalized.includes("plantpal-bag-context")) {
    return "plantpal-bag-context";
  }
  if (normalized.includes("plantpal-with-veggies")) return "plantpal-with-veggies";
  return normalized.replace(/-2(?=\.(jpg|jpeg|webp|png)$)/, "");
};

const uniqueGuideImages = (images: string[]) => {
  const seen = new Set<string>();
  return images.filter((url) => {
    const key = guideImageDedupeKey(url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const SWIPE_THRESHOLD_PX = 48;

/** Horizontal swipe for mobile lightbox nav. Returns true once if a swipe just fired (skip tap-zoom). */
function useLightboxSwipe(opts: {
  enabled: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const { enabled, onSwipeLeft, onSwipeRight } = opts;

  const onTouchStart = useCallback(
    (event: ReactTouchEvent) => {
      if (!enabled) return;
      const touch = event.touches[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
      swipedRef.current = false;
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (event: ReactTouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!enabled || !start) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.15) return;
      swipedRef.current = true;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  const consumeSwipe = useCallback(() => {
    if (!swipedRef.current) return false;
    swipedRef.current = false;
    return true;
  }, []);

  return {
    swipeHandlers: {
      onTouchStart,
      onTouchEnd,
    },
    consumeSwipe,
  };
}

/** Secondary CTA: request a personal callback when sizing/fulfillment is unclear. */
function CallMeHelpButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-[#264027]/18 bg-gradient-to-r from-[#eef3eb] to-[#f7f4ef] px-3.5 py-2.5 text-left shadow-sm transition hover:border-[#264027]/35 hover:shadow-md active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 touch-manipulation"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#264027] text-white shadow-[0_6px_14px_-6px_rgba(38,64,39,0.7)]">
        <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#b38a58] ring-2 ring-[#eef3eb]">
          <Phone className="h-2 w-2 text-white" strokeWidth={2.5} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#264027] group-hover:text-[#1c2e1d]">
          Not sure? Call me
        </span>
        <span className="block text-xs font-medium text-stone-500">
          I’ll text or call — we’ll pick the right size together
        </span>
      </span>
    </button>
  );
}

const galleryDedupeKey = (productId: number, url: string) => {
  const normalized = normalizedGalleryUrl(url);
  return GALLERY_DUPLICATE_GROUPS[productId]?.[normalized] ?? normalized;
};

const SIZE_CATEGORY_PHOTO: Record<string, string> = {
  "9lb Bag": "/images/sizes/9lb-bag-single.jpg",
  "Pallet (144 x 9lb)": "/images/sizes/9lb-pallet.jpg",
  "1CF Bag": "/images/sizes/1cf-bag-single.png",
  "1.5CF Bag": "/images/sizes/1cf-bag-single.png",
  "1.5 cu ft Bag (~50 lb)": "/images/sizes/1cf-bag-single.png",
  "Pallet (50 x 1CF)": "/images/sizes/1cf-pallet.jpg",
  "Pallet (30 x 1.5CF)": "/images/sizes/1cf-pallet.jpg",
  "2CF Bag": "/images/sizes/2cf-bag-single.png",
  "Pallet (25 x 2CF)": "/images/sizes/2cf-pallet.jpg",
  Tote: "/images/sizes/2-2cy-tote.png",
  "Truckload (~24 tons)": "/images/size-formats/walking-floor-delivery.webp",
  "Truckload (24 tons)": "/images/size-formats/walking-floor-delivery.webp",
  "Truckload (22 pallets)": "/images/optimized/mixed-truckload-example.jpg",
  "Flatbed (22 pallets)": "/images/optimized/mixed-truckload-example.jpg",
  "Truckload (~60 cu yd)": "/images/size-formats/walking-floor-delivery.webp",
  "Bulk Pickup": "/images/categories/sizes/CY of Bulk for pick only.png",
};

const productMsrpOverrides: Record<number, Record<string, { price: number; priceLabel?: string }>> = {
  1000: {
    "1CF Bag": { price: 24.9 },
    Tote: { price: 149 },
    "Truckload (~24 tons)": { price: 720 },
  },
  1001: {
    "Truckload (~24 tons)": { price: 4800 },
  },
  111: {
    "1.5CF Bag": { price: 10.99 },
  },
  3000: {
    "Truckload (22 pallets)": { price: 2700 },
    "Truckload (~60 cu yd)": { price: 1440 },
  },
};

const normalizeProductId = (productId?: number | string) => Number(productId);

const isPlantPalOrSoilCraftBag = (productId?: number | string) => {
  const id = normalizeProductId(productId);
  return id === 137 || id === 111;
};

const isOneOrOneHalfCf = (size: string) => /1(?:\.5)?\s*(?:cf|cu\s*ft)/i.test(size);

const categoryLabel = (size: string, productId?: number | string) => {
  const id = normalizeProductId(productId);
  if (size.includes("9lb")) return "9 lb Bag";
  if (isOneOrOneHalfCf(size)) return isPlantPalOrSoilCraftBag(productId) ? "1.5 cu ft Bag (~50 lb)" : "40 lb Bag (1 cu ft)";
  if (size.includes("2CF")) return "2 cu ft Bag (~60 lb)";
  if (size.includes("Tote")) return id === 137 || id === 111 || id === 3000 ? "Super Sack (2.2 cu yd)" : "Super Sack (~2,000 lb)";
  if (size.includes("Bulk Pickup")) return "Bulk Pickup";
  if (size.includes("Truckload") || size.includes("Bulk")) {
    // Flatbed pallet truckload (mixed bags/totes) — keep distinct from loose walking-floor.
    if (/pallet/i.test(size)) return size.includes("22") ? "Flatbed (22 pallets)" : "Flatbed truckload";
    // All loose delivery is one standardized 24-ton semi walking-floor load.
    return "Truckload (24 tons)";
  }
  return size;
};

/** Short size/weight line reused on Step 2 (single + pallet). */
const bagSizeMetricLabel = (size: string, productId?: number | string) => {
  if (size.includes("9lb") || size.includes("9 lb")) return "9 lb";
  if (isOneOrOneHalfCf(size)) {
    return isPlantPalOrSoilCraftBag(productId) ? "1.5 cu ft (~50 lb)" : "1 cu ft (~40–50 lb)";
  }
  if (size.includes("2CF") || size.includes("2 cu")) return "2 cu ft (~60 lb)";
  return categoryLabel(size, productId);
};

const priceForTier = (productId: number, tier: PriceTier) => {
  const override = productMsrpOverrides[productId]?.[tier.size];
  const price = override?.price ?? tier.msrp ?? tier.price;
  return {
    price,
    priceLabel: override?.priceLabel ?? fmt(price),
  };
};

/** Soil amendments sold primarily by ton (compost, castings). */
const isTonBasisAmendment = (productId: number) => productId === 1000 || productId === 1001;

/** Light materials where 24 tons ≈ 60 cu yd (potting soils, mulch). */
const isLightVolumeMaterial = (productId: number) =>
  productId === 111 || productId === 137 || productId === 3000;

/** Loose walking-floor truckload — always one standardized 24-ton semi load. */
const isLooseFullTruckload = (productId: number, size: string) =>
  /truckload/i.test(size) &&
  !/pallet|flatbed/i.test(size) &&
  (isTonBasisAmendment(productId) || isLightVolumeMaterial(productId));

const looseTruckloadTonPrice = (price: number) => Number((price / 24).toFixed(2));

const isTruckloadCategoryKey = (key: string) => /truckload|flatbed/i.test(key);
const isBulkPickupCategoryKey = (key: string) => /bulk pickup/i.test(key);
const isFlatbedTruckloadKey = (key: string) => /flatbed|22 pallets/i.test(key);

/**
 * V4 dual-unit copy for bulk pickup + loose truckload.
 * Loose delivery = 24-ton semi walking-floor standard.
 * Amendments: ton basis. Light soils/mulch: show ~60 cu yd conversion.
 */
const BULK_DUAL_UNITS: Record<
  number,
  {
    pickupPrimaryUnit: "cu yd" | "ton";
    pickupSecondary: string;
    truckloadSecondary: string;
    truckloadVolume: string;
  }
> = {
  // Amendments — priced / sold by the ton.
  1000: {
    pickupPrimaryUnit: "ton",
    pickupSecondary: "$18 / cu yd equivalent",
    truckloadSecondary: "$30 / ton",
    truckloadVolume: "24-ton walking-floor semi",
  },
  1001: {
    pickupPrimaryUnit: "ton",
    pickupSecondary: "$120 / cu yd equivalent",
    truckloadSecondary: "$200 / ton",
    truckloadVolume: "24-ton walking-floor semi",
  },
  // Light materials — same 24-ton load ≈ 60 cu yd.
  111: {
    pickupPrimaryUnit: "cu yd",
    pickupSecondary: "$200 / ton equivalent",
    truckloadSecondary: "Est. 60 cu yd per truckload · $36/cu yd",
    truckloadVolume: "24-ton walking-floor semi · est. 60 cu yd per truckload",
  },
  137: {
    pickupPrimaryUnit: "cu yd",
    pickupSecondary: "$300 / ton equivalent",
    truckloadSecondary: "Est. 60 cu yd per truckload · $60/cu yd",
    truckloadVolume: "24-ton walking-floor semi · est. 60 cu yd per truckload",
  },
  3000: {
    pickupPrimaryUnit: "cu yd",
    pickupSecondary: "$110 / ton equivalent",
    truckloadSecondary: "Est. 60 cu yd per truckload · $24/cu yd",
    truckloadVolume: "24-ton walking-floor semi · est. 60 cu yd per truckload",
  },
};

const palletSizeForBag = (size: string, productId?: number | string) => {
  if (size.includes("9lb")) return { size: "Pallet (144 x 9lb)", qty: 144, cartLabel: "Pallet of 9 lb Bags" };
  if (isOneOrOneHalfCf(size)) {
    // PlantPal / Soil Craft ship 1.5 cu ft bags at 30 per pallet (V5 pricing sheet);
    // standard 1CF bags stay at 50 per pallet.
    if (isPlantPalOrSoilCraftBag(productId)) {
      return { size: "Pallet (30 x 1.5CF)", qty: 30, cartLabel: "Pallet of 1.5 cu ft Bags" };
    }
    return { size: "Pallet (50 x 1CF)", qty: 50, cartLabel: "Pallet of 1CF Bags" };
  }
  if (size.includes("2CF")) return { size: "Pallet (25 x 2CF)", qty: 25, cartLabel: "Pallet of 2CF Bags" };
  return null;
};

const singleCartLabelForSize = (size: string, productId?: number | string) => {
  if (size.includes("9lb")) return "9 lb Bag";
  if (isOneOrOneHalfCf(size)) return isPlantPalOrSoilCraftBag(productId) ? "1.5 cu ft Bag (~50 lb)" : "40 lb Bag (1 cu ft)";
  if (size.includes("2CF")) return "2 cu ft Bag (~60 lb)";
  return categoryLabel(size, productId);
};

const imageForChoice = (choice: SizeChoice, fallback: string) => {
  return SIZE_CATEGORY_PHOTO[choice.size] || fallback;
};

/** Flatbed isn't a product SKU — customers pick bag/pallet/tote and fill the load. */
const isRetiredFlatbedSkuTier = (size: string) => {
  const normalized = size.toLowerCase();
  if (normalized.includes("22") && normalized.includes("pallet")) return true;
  if (normalized.includes("flatbed") && (normalized.includes("truck") || normalized.includes("pallet"))) {
    return true;
  }
  return false;
};

const shouldHidePayPickupTier = (productId: number | string, size: string) => {
  if (isRetiredFlatbedSkuTier(size)) return true;
  return shouldHidePhoenixYardBulkSize(productId, size);
};

const schemaTierLabel = (size: string, productId?: number | string) => {
  if (size.startsWith("Pallet") && size.includes("9lb")) return "Pallet of 9 lb Bags";
  if (size.startsWith("Pallet") && isOneOrOneHalfCf(size)) {
    return isPlantPalOrSoilCraftBag(productId) ? "Pallet of 1.5 cu ft bags" : "Pallet of 1 cu ft bags";
  }
  if (size.startsWith("Pallet") && size.includes("2CF")) return "Pallet of 2 cu ft Bags";
  return categoryLabel(size, productId);
};

const parsePriceTiers = (raw: unknown): PriceTier[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((opt: any) => opt && (opt.isActive !== false && opt.is_active !== false))
    .map((opt: any): PriceTier | null => {
      const size = (opt.size || opt.label || opt.key || "").toString().trim();
      if (!size) return null;
      const price = parseDollars(opt.price) ?? (parseDollars(opt.priceCents ?? opt.price_cents) !== null ? (parseDollars(opt.priceCents ?? opt.price_cents)! / 100) : null);
      if (price === null) return null;
      const msrp = parseDollars(opt.msrp);
      const unit = (opt.unit || opt.description || "").toString().trim();
      const qty = extractQty(size);
      return { size, price, msrp, unit, qty };
    })
    .filter((t): t is PriceTier => t !== null);
};

const isBagTier = (tier: PriceTier): boolean => {
  const s = tier.size.toLowerCase();
  return s.includes("bag") && !s.includes("pallet") && !s.includes("tote") && !s.includes("truck") && !s.includes("bulk");
};

const buildSizeCategories = (product: Product): SizeCategory[] => {
  const categoryMap = new Map<string, SizeCategory>();
  const dual = BULK_DUAL_UNITS[product.id];

  product.priceTiers
    .filter((tier) => !shouldHidePayPickupTier(product.id, tier.size))
    .forEach((tier) => {
    if (tier.size.startsWith("Pallet")) return;

    const pricing = priceForTier(product.id, tier);
    const key = categoryLabel(tier.size, product.id);
    const looseFullTruckload = isLooseFullTruckload(product.id, tier.size);
    const bulkPickup = tier.size.includes("Bulk Pickup");
    const isTruckload =
      /truckload|flatbed/i.test(tier.size) ||
      /truckload|flatbed/i.test(key) ||
      (tier.size.includes("Bulk") && !bulkPickup);
    const unitFromTier = /ton/i.test(tier.unit) ? "ton" : /cu\s*yd/i.test(tier.unit) ? "cu yd" : null;
    const pickupUnit = unitFromTier ?? dual?.pickupPrimaryUnit ?? "cu yd";
    // Loose full loads: charge the full truck ($720 / $4800 / $1440), show $/ton as secondary.
    const displayPrice = pricing.price;
    const palletTruckload = isTruckload && isFlatbedTruckloadKey(key + " " + tier.size);
    const tonEquivalent = looseFullTruckload ? looseTruckloadTonPrice(pricing.price) : null;

    let priceLabel = pricing.priceLabel;
    let secondaryPriceLabel: string | undefined;
    if (looseFullTruckload) {
      priceLabel = pricing.priceLabel;
      // Amendments: $/ton only. Light materials: ~60 cu yd conversion on the same 24-ton load.
      secondaryPriceLabel =
        dual?.truckloadSecondary ??
        (isTonBasisAmendment(product.id)
          ? `$${tonEquivalent!.toFixed(0)} / ton`
          : `Est. 60 cu yd per truckload · $${(pricing.price / 60).toFixed(0)}/cu yd`);
    } else if (bulkPickup) {
      priceLabel = `$${displayPrice.toFixed(2)}/${pickupUnit}`;
      secondaryPriceLabel = dual?.pickupSecondary;
    } else if (palletTruckload) {
      secondaryPriceLabel = "Bags, totes, or mixed · 22 pallet spots";
    } else if (isTruckload && !palletTruckload) {
      priceLabel = pricing.priceLabel;
      secondaryPriceLabel = dual?.truckloadSecondary;
    }

    const bagMetric = bagSizeMetricLabel(tier.size, product.id);

    categoryMap.set(key, {
      key,
      label: key,
      price: displayPrice,
      priceLabel,
      secondaryPriceLabel,
      image:
        SIZE_CATEGORY_PHOTO[key] ||
        SIZE_CATEGORY_PHOTO[tier.size] ||
        product.imageUrl ||
        product.texturePhotoUrl ||
        "",
      choices: [
        {
          ...tier,
          kind: isTruckload || bulkPickup ? "bulk" : "single",
          displayLabel: palletTruckload
            ? "Flatbed delivery"
            : looseFullTruckload || key.includes("Truckload")
            ? "Loose truckload"
            : bulkPickup
            ? `Per ${pickupUnit}`
            : key.includes("Super Sack")
            ? "Super Sack"
            : "Single bag",
          subLabel: palletTruckload
            ? "22 pallet spots"
            : looseFullTruckload || key.includes("Truckload")
            ? dual?.truckloadVolume ?? "24-ton walking-floor semi"
            : bulkPickup
            ? dual?.pickupSecondary ?? "Loose bulk, weighed at pickup"
            : key.includes("Super Sack")
              ? product.id === 137 || product.id === 111 || product.id === 3000 ? "2.2 cubic yards" : "about 2,000 lb"
              : bagMetric,
          cartLabel: palletTruckload
            ? "Flatbed (22 pallets)"
            : looseFullTruckload
            ? "Truckload (24 tons)"
            : bulkPickup
            ? `Bulk Pickup (${pickupUnit})`
            : key.includes("Truckload") || key.includes("Flatbed") || key.includes("Super Sack")
            ? key
            : singleCartLabelForSize(tier.size, product.id),
          displayPrice,
          secondaryPriceLabel,
          unit: looseFullTruckload || palletTruckload
            ? "per truckload"
            : bulkPickup
            ? `per ${pickupUnit}`
            : tier.unit,
        },
      ],
    });
  });

  const attachPalletChoice = (
    category: SizeCategory,
    tier: PriceTier,
    qty: number,
    palletSize: string,
    cartLabel: string,
  ) => {
    const unitPrice = category.choices.find((choice) => choice.kind === "single")?.displayPrice;
    const listPrice = qty && unitPrice ? qty * unitPrice : priceForTier(product.id, tier).price;
    const displayPrice = applyPalletDiscount(listPrice);
    const bagMetric = bagSizeMetricLabel(palletSize, product.id);

    category.choices.unshift({
      ...tier,
      size: palletSize,
      qty,
      unit: "per pallet",
      kind: "pallet",
      displayLabel: "Pallet",
      subLabel: `${qty} × ${bagMetric}`,
      cartLabel,
      displayPrice,
      compareAtPrice: listPrice,
      badge: "20% off",
    });
  };

  product.priceTiers
    .filter((tier) => !shouldHidePayPickupTier(product.id, tier.size))
    .forEach((tier) => {
    if (!tier.size.startsWith("Pallet")) return;

    const baseKey = tier.size.includes("9lb")
      ? "9 lb Bag"
      : isOneOrOneHalfCf(tier.size)
        ? categoryLabel("1CF Bag", product.id)
        : tier.size.includes("2CF")
          ? categoryLabel("2CF Bag", product.id)
          : categoryLabel(tier.size, product.id);
    const category = categoryMap.get(baseKey);
    if (!category) return;

    const palletMeta = palletSizeForBag(tier.size, product.id);
    const qty = palletMeta?.qty ?? tier.qty;
    if (!qty) return;

    attachPalletChoice(
      category,
      tier,
      qty,
      palletMeta?.size ?? tier.size,
      palletMeta?.cartLabel ?? "Pallet",
    );
  });

  categoryMap.forEach((category) => {
    const single = category.choices.find((choice) => choice.kind === "single");
    if (!single || category.choices.some((choice) => choice.kind === "pallet")) return;

    const palletMeta = palletSizeForBag(single.size, product.id);
    if (!palletMeta) return;

    attachPalletChoice(
      category,
      single,
      palletMeta.qty,
      palletMeta.size,
      palletMeta.cartLabel,
    );
  });

  return Array.from(categoryMap.values());
};

const parseList = (value?: string | null, delimiter = /[|,]/): string[] =>
  value ? value.split(delimiter).map((s) => s.trim()).filter(Boolean) : [];

const usageSteps = (usage?: string) =>
  usage
    ? usage
        .split(/(?<=\.)\s+/)
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

const PRODUCT_DETAIL_CONTENT: Record<number, {
  includes?: string[];
  benefits?: string[];
  usageSteps: string[];
  bestFor: string[];
  note: string;
  seoKeywords: string[];
  guideImages: string[];
}> = {
  1000: {
    usageSteps: [
      "Mix with existing soil or potting soil when planting to improve organic matter and soil structure.",
      "Top dress beds, trees, and planted areas with a light layer, then water thoroughly.",
      "Use as a steady compost amendment when you want cleaner biology, moisture support, and long-term soil improvement.",
    ],
    bestFor: [
      "Home gardeners",
      "Vegetable beds",
      "Fruit trees",
      "Raised beds",
      "Nurseries",
      "Organic farms",
      "Soil rebuilding",
      "Arizona gardens",
    ],
    note: "Strong fit when you want pure dairy compost, slow-release nutrition, improved soil structure, and better water conservation.",
    seoKeywords: [
      "dairy compost",
      "organic dairy compost",
      "soil amendment",
      "compost for gardens",
      "compost for trees",
      "Arizona compost",
      "bulk compost Phoenix",
      "organic matter for soil",
    ],
    guideImages: [
      "/images/optimized/simons-gold-new-graphics-2-uses.jpg",
      "/images/optimized/simons-gold-new-graphics-2-lifestyle.jpg",
      "/images/product-guides/simons-gold-03.webp",
      "/images/product-guides/simons-gold-04.webp",
    ],
  },
  1001: {
    usageSteps: [
      "Mix into potting soil, raised beds, or garden soil to add concentrated worm castings near the root zone.",
      "Top dress plants lightly during the growing season, then water in to activate nutrients.",
      "Use when plants need gentle feeding, better moisture retention, and stronger soil biology.",
    ],
    bestFor: [
      "Home gardeners",
      "Vegetable beds",
      "Fruit trees",
      "Container growers",
      "Nurseries",
      "Organic farms",
      "Seed starts",
      "Root zones",
    ],
    note: "Best when you want nutrient-rich worm castings for stronger root zones, moisture retention, and steady natural plant feeding.",
    seoKeywords: [
      "worm castings",
      "organic worm castings",
      "vermicompost",
      "worm poop fertilizer",
      "natural plant food",
      "worm castings Phoenix",
      "soil biology",
      "root zone amendment",
    ],
    guideImages: [
      "/images/optimized/mikeys-worm-new-graphics-2-uses.jpg",
      "/images/optimized/mikeys-worm-new-graphics-2-lifestyle.jpg",
      "/images/product-guides/mikeys-worm-poop-03.webp",
      "/images/product-guides/mikeys-worm-poop-04.webp",
    ],
  },
  111: {
    usageSteps: [
      "Use PlantPal Plus directly in pots and containers — no mixing required.",
      "Fill containers or transplant nursery stock into PlantPal Plus as your all-stage growing medium.",
      "Water thoroughly after planting and maintain regular moisture while roots establish.",
    ],
    bestFor: [
      "Nurseries",
      "Home gardeners",
      "Container growers",
      "Seed starts",
      "Propagation",
      "Indoor plants",
      "Patio planters",
      "Vegetables and herbs",
    ],
    note: "Built for container growers who need a balanced all-stage potting mix with strong root development.",
    seoKeywords: [
      "all stage potting mix",
      "all stage potting soil",
      "PlantPal",
      "container gardening soil",
      "seed starter mix",
      "propagation soil",
      "organic potting mix Phoenix",
      "potting mix Arizona",
    ],
    guideImages: [
      "/images/optimized/plantpal-with-veggies.jpg",
      "/images/optimized/plantpal-new-graphics-2-lifestyle.jpg",
      "/images/optimized/plantpal-bag-context.jpg",
      "/images/optimized/plantpal-bestfor.jpg",
    ],
  },
  137: {
    includes: ["Dairy compost", "Worm castings", "Perlite", "Peat-free coir"],
    benefits: ["Ready-to-use planting soil", "Supports root development", "Balanced for containers and beds"],
    usageSteps: [
      "Fill containers, raised beds, or planting holes with Soil Craft as a ready-to-use growing medium.",
      "Plant directly into the blend; no extra amendments are needed for most everyday garden and container uses.",
      "Water thoroughly after planting and keep moisture consistent while roots establish.",
    ],
    bestFor: [
      "Home gardeners",
      "Container growers",
      "Raised beds",
      "Nurseries",
      "Potted plants",
      "Vegetable beds",
      "Flowers",
      "Patio gardens",
    ],
    note: "Built for easy planting when you need balanced organic potting soil, strong roots, and clean growing conditions.",
    seoKeywords: [
      "organic potting soil",
      "premium potting soil",
      "raised bed soil",
      "container gardening soil",
      "garden soil Phoenix",
      "ready to plant soil",
      "nursery potting mix",
      "Soil Craft blend",
    ],
    guideImages: [
      "/images/product-guides/soil-craft-01.webp",
      "/images/product-guides/soil-craft-02.webp",
      "/images/product-guides/soil-craft-03.webp",
      "/images/product-guides/soil-craft-04.webp",
    ],
  },
  3000: {
    usageSteps: [
      "Spread evenly over clean landscape beds at a depth of about 2-3 inches.",
      "Keep mulch pulled slightly away from trunks, stems, and crowns to protect plant health.",
      "Water after application so the mulch settles and begins supporting moisture retention and temperature control.",
    ],
    bestFor: [
      "Landscapers",
      "Home gardeners",
      "Trees and shrubs",
      "Flower beds",
      "Raised beds",
      "Pathways",
      "Commercial beds",
      "Weed suppression",
    ],
    note: "Use it when you want the best all-around healthy soil mulch: premium wood fiber blended with worm castings and dairy compost for cleaner beds, moisture retention, cooler roots, and long-lasting soil cover.",
    seoKeywords: [
      "organic mulch",
      "premium mulch",
      "wood fiber mulch",
      "worm castings mulch",
      "dairy compost mulch",
      "healthy soil mulch",
      "landscape mulch Phoenix",
      "mulch for garden beds",
      "weed suppression mulch",
      "moisture retention mulch",
      "bulk mulch delivery",
    ],
    guideImages: [
      "/images/product-guides/natures-blanket-premium-01.webp",
      "/images/product-guides/natures-blanket-premium-02.webp",
      "/images/product-guides/natures-blanket-premium-03.webp",
      "/images/product-guides/natures-blanket-premium-04.webp",
    ],
  },
  1034: {
    usageSteps: [
      "Shake well before use.",
      "Spray plants and surrounding areas.",
      "Use up to twice daily, or until the end of the pest life cycle. Store in a cool, dry area.",
    ],
    bestFor: [
      "Home gardens",
      "Indoor plants",
      "Vegetables",
      "Citrus",
      "Herbs",
      "Ornamentals",
      "Nurseries",
      "Landscapers",
    ],
    note: "32 oz plant-based spray for garden and household pests, including ants and roaches. Pet friendly, bee friendly, and bird safe. No neem oil or soap.",
    seoKeywords: [
      "sabrina kills bugs",
      "organic insecticide",
      "garden pest spray",
      "fungicide insecticide miticide",
    ],
    guideImages: [],
  },
};

const mergeUnique = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const audienceLabel = (item: string) => {
  const value = item.toLowerCase();
  if (value.includes("home gardener")) return "Home gardeners";
  if (value.includes("fruit")) return "Fruit trees";
  if (value.includes("vegetable")) return "Vegetable beds";
  if (value.includes("nursery")) return "Nurseries";
  if (value.includes("organic")) return "Organic farms";
  if (value.includes("drought")) return "Dry Arizona sites";
  if (value.includes("floriculture")) return "Flowers";
  if (value.includes("cannabis")) return "Specialty growers";
  if (value.includes("garden installation")) return "New installs";
  return item;
};

const priorityAudiences = (items: string[]) => {
  const order = ["Home gardeners", "Vegetable beds", "Fruit trees", "Flowers", "New installs", "Nurseries", "Organic farms", "Dry Arizona sites"];
  const unique = Array.from(new Set(items.map(audienceLabel)));
  return unique.sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
};

const PRODUCT_AUDIENCE_FALLBACKS: Record<number, string[]> = {
  1000: PRODUCT_DETAIL_CONTENT[1000].bestFor,
  1001: PRODUCT_DETAIL_CONTENT[1001].bestFor,
  111: PRODUCT_DETAIL_CONTENT[111].bestFor,
  137: PRODUCT_DETAIL_CONTENT[137].bestFor,
  3000: [
    ...PRODUCT_DETAIL_CONTENT[3000].bestFor,
    "Water retention",
  ],
};

const bestFitAudiences = (product: Product) => {
  const fallback = PRODUCT_AUDIENCE_FALLBACKS[product.id] || [];
  const combined = [...product.targetAudience, ...fallback];
  return priorityAudiences(combined).slice(0, 8);
};

const bestFitNote = (product: Product) => {
  return PRODUCT_DETAIL_CONTENT[product.id]?.note || "Strong fit when you want steady nutrition, cleaner soil biology, and better performance in beds, trees, or planted areas.";
};

const normalizeProduct = (record: ApiProduct): Product => {
  const additionalImages = (Array.isArray(record.additionalImages) ? record.additionalImages : Array.isArray(record.additional_images) ? record.additional_images : []) as string[];

  const videoUrls = (() => {
    if (Array.isArray(record.videoUrls)) return record.videoUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    if (Array.isArray(record.video_urls)) return record.video_urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    const single = record.productVideoUrl ?? record.product_video_url;
    return typeof single === "string" && single.trim().length > 0 ? [single.trim()] : [];
  })();

  const priceTiers = parsePriceTiers(record.sizePriceOptions ?? record.size_price_options);

  return {
    id: record.id,
    slug: record.slug ?? generateProductSlug(record.product_type ?? record.productType ?? undefined, record.name) ?? record.id.toString(),
    name: record.name ?? "Product",
    displayTitle: record.displayTitle ?? record.display_title ?? record.name ?? "Product",
    category: record.category ?? "Soil amendment",
    productType: getPayPickupProductType(
      record.id,
      record.productType ?? record.product_type ?? undefined,
    ),
    description: record.description ?? "",
    marketingNote: record.marketingNote ?? record.marketing_note ?? undefined,
    usage: record.usage ?? undefined,
    targetAudience: parseList(record.targetAudience ?? record.target_audience),
    npk: record.npk ?? undefined,
    certifications: parseList(record.certifications),
    imageUrl: record.imageUrl ?? record.image_url ?? undefined,
    texturePhotoUrl: record.texturePhotoUrl ?? record.texture_photo_url ?? undefined,
    additionalImages,
    videoUrls,
    priceTiers,
    seoKeywords: record.seoKeywords ?? record.seo_keywords ?? undefined,
  };
};

const fetchProduct = async (identifier: string): Promise<Product> => {
  const response = await fetch(`/api/public/products/${identifier}`);
  if (!response.ok) throw new Error("Product not found");
  return normalizeProduct(await response.json());
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function IngredientDisclosure({ summary, items }: { summary: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div id="inside-the-mix">
      <p className="text-sm leading-relaxed text-stone-700">{summary}</p>
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#264027]/15 bg-white px-4 text-sm font-bold text-[#264027] shadow-sm transition hover:border-[#264027]/30 hover:bg-[#f4f7f2]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide the ingredients" : "See the ingredients"}
        <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-[#264027]/12 bg-[#f4f7f2] px-3.5 py-2.5 text-sm font-semibold text-[#264027]"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ProductDetail = () => {
  const [, params] = useRoute<{ slug: string }>("/products/:slug");
  const [, navigate] = useLocation();
  const { addItem, openDrawer, items: cartItems } = useQuoteCart();
  const { toast } = useToast();
  const slug = params?.slug ?? "";

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["publicProduct", slug],
    queryFn: () => fetchProduct(slug),
    enabled: Boolean(slug),
  });

  const productDetailContent = product ? PRODUCT_DETAIL_CONTENT[product.id] : undefined;

  // --- Gallery ---
  type GalleryItem = { type: "image"; url: string } | { type: "video"; url: string; videoId: string };

  const galleryItems = useMemo((): GalleryItem[] => {
    if (!product) return [];
    const items: GalleryItem[] = [];
    const seen = new Set<string>();

    // CRITICAL: the list card (PayPickupGrid → PayPickupCard) overrides
    // product.imageUrl with HERO_BAG_PHOTO so the BAG photo is shown, not the
    // lifestyle / dirt-close-up that the API returns as imageUrl. The detail
    // page MUST use the same override or the hero will not match the card the
    // customer just tapped.
    const heroBagOverride = HERO_BAG_PHOTO[product.id];
    const productPhotos = [heroBagOverride, product.imageUrl, product.texturePhotoUrl, ...product.additionalImages]
      .filter((u): u is string => Boolean(u?.trim()))
      .filter((url) => !isBlockedGalleryImage(product.id, url));

    const pushImage = (url: string) => {
      const trimmed = url.trim();
      const key = galleryDedupeKey(product.id, trimmed);
      if (seen.has(key) || seen.has(trimmed)) return;
      seen.add(key);
      seen.add(trimmed);
      items.push({ type: "image", url: trimmed });
    };

    // 1) Hero bag, 2) OMRI certificate (Airtable-synced asset), then New Graphics 2.0 / remaining photos.
    // Small cert logos stay beside the title; the certificate document lives in the gallery.
    if (productPhotos[0]) pushImage(productPhotos[0]);

    const omriCert = product.id === 111 ? undefined : getOmriCertificate({ slug: product.slug, productId: product.id });
    if (omriCert?.image) pushImage(omriCert.image);

    (NEW_GRAPHICS_2_GALLERY[product.id] ?? []).forEach(pushImage);
    productPhotos.slice(1).forEach(pushImage);

    product.videoUrls.forEach((videoUrl) => {
      const videoId = extractYouTubeVideoId(videoUrl);
      if (!videoId) return;
      const key = `video:${videoId}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ type: "video", url: videoUrl, videoId });
      }
    });

    return items;
  }, [product]);

  const heroImage = galleryItems.find((i) => i.type === "image")?.url ?? null;
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [galleryZoom, setGalleryZoom] = useState(1);
  const [isGuideGalleryOpen, setIsGuideGalleryOpen] = useState(false);
  const [activeGuideImageIndex, setActiveGuideImageIndex] = useState(0);
  const [guideZoom, setGuideZoom] = useState(1);
  const activeGalleryItem = galleryItems[activeGalleryIndex];
  const guideImages = useMemo(
    () => uniqueGuideImages(productDetailContent?.guideImages ?? []),
    [productDetailContent?.guideImages],
  );
  const activeGuideImage = guideImages[activeGuideImageIndex];

  const GALLERY_ZOOM_STEPS = [1, 1.5, 2.25] as const;

  const stepZoom = useCallback((setter: typeof setGalleryZoom, direction: 1 | -1) => {
    setter((current) => {
      const idx = GALLERY_ZOOM_STEPS.findIndex((step) => Math.abs(step - current) < 0.01);
      const from = idx === -1 ? 0 : idx;
      return GALLERY_ZOOM_STEPS[Math.min(GALLERY_ZOOM_STEPS.length - 1, Math.max(0, from + direction))];
    });
  }, []);

  const resetGalleryZoom = useCallback(() => setGalleryZoom(1), []);
  const resetGuideZoom = useCallback(() => setGuideZoom(1), []);

  useEffect(() => {
    resetGalleryZoom();
  }, [activeGalleryIndex, isGalleryOpen, resetGalleryZoom]);

  useEffect(() => {
    resetGuideZoom();
  }, [activeGuideImageIndex, isGuideGalleryOpen, resetGuideZoom]);

  const openGalleryAt = useCallback((index: number) => {
    if (!galleryItems.length) return;
    setActiveGalleryIndex(((index % galleryItems.length) + galleryItems.length) % galleryItems.length);
    resetGalleryZoom();
    requestAnimationFrame(() => setIsGalleryOpen(true));
  }, [galleryItems.length, resetGalleryZoom]);

  const openHeroGallery = useCallback(() => {
    if (!galleryItems.length) return;
    openGalleryAt(activeGalleryIndex);
  }, [activeGalleryIndex, galleryItems.length, openGalleryAt]);

  const goToPrev = useCallback(() => {
    if (!galleryItems.length) return;
    setActiveGalleryIndex((p) => (p - 1 + galleryItems.length) % galleryItems.length);
  }, [galleryItems.length]);

  const goToNext = useCallback(() => {
    if (!galleryItems.length) return;
    setActiveGalleryIndex((p) => (p + 1) % galleryItems.length);
  }, [galleryItems.length]);

  const stepGalleryZoom = useCallback((direction: 1 | -1) => {
    stepZoom(setGalleryZoom, direction);
  }, [stepZoom]);

  const toggleGalleryZoom = useCallback(() => {
    setGalleryZoom((current) => (current > 1 ? 1 : 2.25));
  }, []);

  const openGuideImageAt = useCallback((index: number) => {
    if (!guideImages.length) return;
    setActiveGuideImageIndex(((index % guideImages.length) + guideImages.length) % guideImages.length);
    resetGuideZoom();
    requestAnimationFrame(() => setIsGuideGalleryOpen(true));
  }, [guideImages.length, resetGuideZoom]);

  const goToPrevGuideImage = useCallback(() => {
    if (!guideImages.length) return;
    setActiveGuideImageIndex((p) => (p - 1 + guideImages.length) % guideImages.length);
  }, [guideImages.length]);

  const goToNextGuideImage = useCallback(() => {
    if (!guideImages.length) return;
    setActiveGuideImageIndex((p) => (p + 1) % guideImages.length);
  }, [guideImages.length]);

  const stepGuideZoom = useCallback((direction: 1 | -1) => {
    stepZoom(setGuideZoom, direction);
  }, [stepZoom]);

  const toggleGuideZoom = useCallback(() => {
    setGuideZoom((current) => (current > 1 ? 1 : 2.25));
  }, []);

  const { swipeHandlers: gallerySwipeHandlers, consumeSwipe: consumeGallerySwipe } = useLightboxSwipe({
    enabled: isGalleryOpen && galleryZoom <= 1 && galleryItems.length > 1,
    onSwipeLeft: goToNext,
    onSwipeRight: goToPrev,
  });

  const { swipeHandlers: guideSwipeHandlers, consumeSwipe: consumeGuideSwipe } = useLightboxSwipe({
    enabled: isGuideGalleryOpen && guideZoom <= 1 && guideImages.length > 1,
    onSwipeLeft: goToNextGuideImage,
    onSwipeRight: goToPrevGuideImage,
  });

  const handleGalleryImageActivate = useCallback(() => {
    if (consumeGallerySwipe()) return;
    toggleGalleryZoom();
  }, [consumeGallerySwipe, toggleGalleryZoom]);

  const handleGuideImageActivate = useCallback(() => {
    if (consumeGuideSwipe()) return;
    toggleGuideZoom();
  }, [consumeGuideSwipe, toggleGuideZoom]);

  // Arrow keys navigate the open lightbox (skip while zoomed so pan/scroll stays natural).
  useEffect(() => {
    if (!isGalleryOpen && !isGuideGalleryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isGalleryOpen && galleryZoom <= 1 && galleryItems.length > 1) {
        event.preventDefault();
        if (event.key === "ArrowLeft") goToPrev();
        else goToNext();
        return;
      }
      if (isGuideGalleryOpen && guideZoom <= 1 && guideImages.length > 1) {
        event.preventDefault();
        if (event.key === "ArrowLeft") goToPrevGuideImage();
        else goToNextGuideImage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isGalleryOpen,
    isGuideGalleryOpen,
    galleryZoom,
    guideZoom,
    galleryItems.length,
    guideImages.length,
    goToPrev,
    goToNext,
    goToPrevGuideImage,
    goToNextGuideImage,
  ]);

  const galleryNavButtonClass =
    "absolute top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-white shadow-md ring-1 ring-white/35 backdrop-blur-md transition hover:bg-black/45 active:scale-95 sm:h-14 sm:w-14";

  const msrpPreview = useMemo(() => {
    if (!product?.priceTiers.length) return null;
    return product.priceTiers.find((tier) => isBagTier(tier) && tier.msrp) ?? product.priceTiers.find((tier) => tier.msrp) ?? null;
  }, [product?.priceTiers]);

  const sizeCategories = useMemo(() => {
    if (!product) return [];
    return buildSizeCategories(product);
  }, [product]);

  const [selectedCategoryKey, setSelectedCategoryKey] = useState("");
  const [selectedChoiceSize, setSelectedChoiceSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackPending, setCallbackPending] = useState<CartItem[]>([]);
  const [deliveryQuote, setDeliveryQuote] = useState<TruckingQuote | null>(null);
  const [deliveryZip, setDeliveryZip] = useState("");
  const [deliveryRoughAccess, setDeliveryRoughAccess] = useState(false);
  const [deliverySemiAccess, setDeliverySemiAccess] = useState(true);

  const selectedCategory = useMemo(
    () => sizeCategories.find((category) => category.key === selectedCategoryKey),
    [selectedCategoryKey, sizeCategories]
  );

  const needsChoice = (selectedCategory?.choices.length ?? 0) > 1;
  /** Drill-down chain: sizes → sub-options (if any) → configure (qty / delivery / CTAs). */
  const buyStep: "sizes" | "subchoice" | "configure" = !selectedCategory
    ? "sizes"
    : needsChoice && !selectedChoiceSize
      ? "subchoice"
      : "configure";
  const subchoiceStepLabel = useMemo(() => {
    if (!selectedCategory || !needsChoice) return "Choose option";
    const kinds = new Set(selectedCategory.choices.map((c) => c.kind));
    if (kinds.has("pallet") && kinds.has("single")) return "Bag or pallet";
    if (selectedCategory.choices.length === 2) {
      return selectedCategory.choices.map((c) => c.displayLabel).join(" or ");
    }
    return "Choose option";
  }, [needsChoice, selectedCategory]);
  const isTruckloadSelected = Boolean(selectedCategory && isTruckloadCategoryKey(selectedCategory.key));
  const isBulkPickupSelected = Boolean(selectedCategory && isBulkPickupCategoryKey(selectedCategory.key));
  const isFlatbedCategorySelected = Boolean(
    selectedCategory && isFlatbedTruckloadKey(selectedCategory.key),
  );
  const selectedChoice = useMemo(
    () =>
      selectedCategory?.choices.find((choice) => choice.size === selectedChoiceSize) ??
      (needsChoice ? undefined : selectedCategory?.choices[0]),
    [needsChoice, selectedCategory, selectedChoiceSize]
  );

  const selectedAddsFlatbedSpots = selectedChoice
    ? spotsForFormat(selectedChoice.cartLabel, quantity) > 0
    : isFlatbedCategorySelected;
  const isLooseTruckloadSelected = Boolean(
    isTruckloadSelected && !isFlatbedCategorySelected && !selectedAddsFlatbedSpots,
  );
  const fulfillmentMode: "flatbed" | "loose_truckload" | "bulk_pickup" | "yard_pickup" | null =
    !selectedCategory
      ? null
      : isLooseTruckloadSelected
        ? "loose_truckload"
        : selectedAddsFlatbedSpots || isFlatbedCategorySelected
          ? "flatbed"
          : isBulkPickupSelected
            ? "bulk_pickup"
            : "yard_pickup";

  const selectedTotal = (selectedChoice?.displayPrice ?? 0) * quantity;
  const canPayOnline = product ? isPayOnlineProduct(product.id) : false;
  const phoenixYardPickupOk = product
    ? cartItemAllowsPhoenixYardPickup({
        productId: product.id,
        format: selectedChoice?.cartLabel || selectedCategory?.key || "",
      })
    : false;
  const pendingFlatbedSpots = selectedChoice ? spotsForFormat(selectedChoice.cartLabel, quantity) : 0;

  const scrollBuyIntoView = useCallback(() => {
    // Wait for Step 2 DOM to paint — rAF alone often fires too early.
    window.setTimeout(() => {
      document.getElementById("buy")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  const goBuyStepBack = useCallback(() => {
    // One step up the chain: configure → subchoice → sizes.
    if (buyStep === "configure" && needsChoice) {
      setSelectedChoiceSize("");
      setQuantity(1);
      scrollBuyIntoView();
      return;
    }
    setSelectedCategoryKey("");
    setSelectedChoiceSize("");
    setQuantity(1);
    setDeliveryQuote(null);
    scrollBuyIntoView();
  }, [buyStep, needsChoice, scrollBuyIntoView]);

  const pricingSummary = useMemo(() => {
    if (!product) return null;

    if (selectedChoice && selectedCategory) {
      const isTruckload = isTruckloadCategoryKey(selectedCategory.key);
      const formatLine = needsChoice
        ? selectedChoice.kind === "pallet"
          ? `${selectedCategory.label} · Pallet`
          : `${selectedCategory.label} · Single`
        : selectedCategory.label.replace(/\s*\([^)]*\)\s*$/, "") || selectedCategory.label;
      const detail = isTruckload
        ? selectedChoice.subLabel
        : needsChoice
        ? selectedChoice.kind === "pallet"
          ? `${selectedChoice.subLabel} · 20% off`
          : selectedChoice.subLabel
        : selectedChoice.secondaryPriceLabel || undefined;
      const rawUnit = selectedChoice.unit?.replace(/^per\s/i, "") ?? "";
      const unitSuffix = isTruckload
        ? ""
        : /bag|pallet|tote|truckload|cu yd|ton/i.test(rawUnit)
        ? rawUnit
        : "";
      return {
        key: `choice-${selectedChoice.size}-${quantity}`,
        eyebrow: "Your selection",
        price: fmt(selectedChoice.displayPrice),
        unitSuffix,
        subtitle: formatLine,
        detail,
        totalLine:
          quantity > 1 ? `${quantity} × ${fmt(selectedChoice.displayPrice)} = ${fmt(selectedTotal)}` : undefined,
      };
    }

    if (selectedCategory) {
      return {
        key: `category-${selectedCategory.key}`,
        eyebrow: needsChoice ? "Selected size" : "Your selection",
        price: selectedCategory.priceLabel,
        subtitle: selectedCategory.label,
        detail: needsChoice
          ? "Choose pallet or single below"
          : selectedCategory.secondaryPriceLabel,
      };
    }

    if (msrpPreview?.msrp) {
      return {
        key: "overview",
        eyebrow: "Starts at",
        price: fmt(msrpPreview.msrp),
        subtitle: categoryLabel(msrpPreview.size, product.id),
      };
    }

    return null;
  }, [
    msrpPreview,
    needsChoice,
    product,
    quantity,
    selectedCategory,
    selectedChoice,
    selectedTotal,
  ]);

  // Reset gallery index on product change
  useEffect(() => {
    setActiveGalleryIndex(0);
    setSelectedCategoryKey("");
    setSelectedChoiceSize("");
    setQuantity(1);
    setDeliveryQuote(null);
    setDeliveryZip("");
    setDeliveryRoughAccess(false);
    setDeliverySemiAccess(true);
  }, [product?.id]);

  useEffect(() => {
    if (!isTruckloadSelected) {
      setDeliveryQuote(null);
      return;
    }
    // Re-enter truckload with the last ZIP the customer already typed.
    if (!deliveryZip) {
      const draft = loadDeliveryDraft();
      if (draft?.zip) setDeliveryZip(draft.zip);
    }
  }, [deliveryZip, isTruckloadSelected]);

  // Quantity changes the trucking load count — force a fresh ZIP estimate.
  useEffect(() => {
    if (!isTruckloadSelected) return;
    setDeliveryQuote(null);
  }, [quantity, isTruckloadSelected]);

  useEffect(() => {
    if (!selectedCategoryKey) return;
    scrollBuyIntoView();
  }, [selectedCategoryKey, scrollBuyIntoView]);

  useEffect(() => {
    if (!selectedChoiceSize) return;
    scrollBuyIntoView();
  }, [selectedChoiceSize, scrollBuyIntoView]);

  useEffect(() => {
    if (!product) return;
    if (window.location.hash === "#buy") {
      window.setTimeout(() => {
        document.getElementById("buy")?.scrollIntoView({ block: "start" });
      }, 0);
    } else {
      window.scrollTo(0, 0);
    }
    trackEvent("Product Detail Viewed", {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.displayTitle,
      category: product.category,
      pay_online: canPayOnline,
    });
    trackEcommerceEvent("view_item", {
      items: [{
        item_id: product.id,
        item_name: product.displayTitle,
        item_category: product.category,
      }],
      pay_online: canPayOnline,
      pickup_sales_channel: "osw_yard",
    });
  }, [product?.id]);

  const persistDeliveryDraft = useCallback(() => {
    if (!isLooseTruckloadSelected || !deliveryZip) return;
    saveDeliveryDraft({
      zip: deliveryZip,
      roughAccess: deliveryRoughAccess,
      semiAccess: deliverySemiAccess,
      quote: deliveryQuote,
      city: deliveryQuote?.breakdown.destinationCity ?? null,
      state: deliveryQuote?.breakdown.destinationState ?? null,
    });
  }, [
    deliveryQuote,
    deliveryRoughAccess,
    deliverySemiAccess,
    deliveryZip,
    isLooseTruckloadSelected,
  ]);

  const buildSelectionCartItem = useCallback((): CartItem | null => {
    if (!product || !selectedChoice) return null;
    return {
      productId: product.id,
      productName: product.displayTitle,
      productSlug: product.slug,
      format: selectedChoice.cartLabel,
      quantity,
      unitPrice: selectedChoice.displayPrice,
      listUnitPrice: selectedChoice.compareAtPrice,
      savingsPerUnit: selectedChoice.compareAtPrice != null
        ? Number((selectedChoice.compareAtPrice - selectedChoice.displayPrice).toFixed(2))
        : undefined,
      discountPercent: selectedChoice.kind === "pallet" ? 20 : undefined,
      unitsPerPallet: selectedChoice.kind === "pallet" ? selectedChoice.qty : undefined,
      unit: selectedChoice.unit || "per unit",
      mode: canPayOnline ? "pay" : "quote",
      imageUrl: HERO_BAG_PHOTO[product.id] || product.imageUrl || product.texturePhotoUrl,
      sizeImage: SIZE_CATEGORY_PHOTO[selectedChoice.size] || undefined,
    };
  }, [canPayOnline, product, quantity, selectedChoice]);

  const addSelectionToCart = useCallback((
    next?: "products" | "checkout" | "callback",
    opts?: {
      quiet?: boolean;
      focusStreet?: boolean;
      preferredFulfillment?: "pickup" | "delivery";
    },
  ) => {
    if (!product || !selectedChoice) return;
    // Truckload can + to cart or go Deliver without ZIP first — checkout prices delivery.

    trackEvent(
      next === "checkout"
        ? "Buy Now Clicked"
        : next === "callback"
          ? "Order Callback Clicked"
          : "Add To Cart Clicked",
      {
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.displayTitle,
        size_category: selectedCategory?.label ?? "",
        format: selectedChoice.cartLabel,
        quantity,
        unit_price: selectedChoice.displayPrice,
        mode: canPayOnline ? "pay" : "quote",
        next: next ?? "cart_drawer",
        delivery_zip: deliveryZip || undefined,
        delivery_fee: deliveryQuote?.costDollars,
        auto_address: Boolean(opts?.focusStreet),
      },
    );

    // When auto-advancing from Get price, draft was already saved with the fresh quote.
    if (isLooseTruckloadSelected && !opts?.focusStreet) persistDeliveryDraft();

    const cartLine = buildSelectionCartItem();
    if (!cartLine) return;
    addItem(cartLine);

    setJustAdded(true);
    const addedSpots = spotsForFormat(selectedChoice.cartLabel, quantity);
    const nextSpots = cartFlatbedSpots(cartItems) + addedSpots;
    // Soft confirmation — keep shopping. Order stays one tap away in the header.
    if (!opts?.quiet && !next) {
      const lineLabel =
        addedSpots > 0
          ? `${quantity}× ${product.displayTitle} · +${addedSpots} spot${addedSpots === 1 ? "" : "s"} (${Math.min(nextSpots, FLATBED_CAPACITY)}/${FLATBED_CAPACITY})`
          : `${quantity}× ${product.displayTitle} · ${selectedChoice.displayLabel}`;
      toast({
        title: addedSpots > 0 ? "Added to your flatbed" : "Added to your order",
        description: lineLabel,
        duration: 4500,
        action: (
          <ToastAction
            altText="View order"
            onClick={() => openDrawer()}
            className="border-[#264027]/25 bg-[#264027] text-white hover:bg-[#1f3320] hover:text-white"
          >
            View order
          </ToastAction>
        ),
      });
    }
    window.setTimeout(() => setJustAdded(false), 1400);

    if (opts?.focusStreet) {
      try {
        sessionStorage.setItem("osw-focus-street", "1");
      } catch {
        // ignore
      }
    }
    if (opts?.preferredFulfillment) {
      try {
        sessionStorage.setItem("osw-preferred-fulfillment", opts.preferredFulfillment);
      } catch {
        // ignore
      }
    }

    // Walking-floor forces delivery for the whole order — resolve in cart before checkout.
    const cartHasWalkingFloor = cartItems.some(
      (item) => item.mode === "pay" && isWalkingFloorDeliveryFormat(item.format),
    );
    if (
      next === "checkout" &&
      opts?.preferredFulfillment === "pickup" &&
      cartHasWalkingFloor &&
      !isLooseTruckloadSelected
    ) {
      try {
        sessionStorage.removeItem("osw-preferred-fulfillment");
      } catch {
        // ignore
      }
      openDrawer();
      toast({
        title: "Remove walking-floor to pick up",
        description:
          "A 24-ton walking-floor load must be delivered. Remove it from your order, then tap Pick up again — or continue with delivery for everything.",
        duration: 7000,
      });
      return;
    }

    if (next === "products") navigate("/products");
    if (next === "checkout") canPayOnline ? navigate("/checkout") : navigate("/order");
    if (next === "callback") {
      setCallbackPending([cartLine]);
      setCallbackOpen(true);
      return;
    }
    // Stay on the product page — no intrusive cart drawer.
  }, [
    addItem,
    buildSelectionCartItem,
    canPayOnline,
    cartItems,
    deliveryQuote?.costDollars,
    deliveryZip,
    isLooseTruckloadSelected,
    navigate,
    openDrawer,
    persistDeliveryDraft,
    product,
    quantity,
    scrollBuyIntoView,
    selectedCategory?.label,
    selectedChoice,
    toast,
  ]);

  const deliveryQuoteItems = useMemo(() => {
    if (!product || !selectedChoice || !isLooseTruckloadSelected) return [];
    return [
      {
        sizeOption: selectedChoice.cartLabel,
        quantity,
        unit: selectedChoice.unit,
        productName: product.displayTitle,
      },
    ];
  }, [isLooseTruckloadSelected, product, quantity, selectedChoice]);

  // --- SEO ---
  const resolvedUsageSteps = product
    ? mergeUnique([...usageSteps(product.usage), ...(productDetailContent?.usageSteps ?? [])]).slice(0, 3)
    : [];
  const syncedProductDescription = product
    ? getPayPickupProductDescription(product.id, product.marketingNote || product.description)
    : "";
  const seoDescription = syncedProductDescription || "Wholesale organic soil products from Soil Seed & Water.";
  const seoKeywords = mergeUnique([
    ...(product?.seoKeywords ? product.seoKeywords.split(",") : []),
    ...(productDetailContent?.seoKeywords ?? []),
    product?.category ?? "",
    product?.productType ?? "",
    "organic soil",
    "wholesale",
  ]).join(", ");
  const productStructuredData = product
    ? [
        buildLocalBusinessSchema(),
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.displayTitle,
          alternateName: product.name,
          description: seoDescription,
          image: galleryItems
            .filter((item): item is Extract<GalleryItem, { type: "image" }> => item.type === "image")
            .slice(0, 6)
            .map((item) => absoluteUrl(item.url)),
          brand: {
            "@type": "Brand",
            name: "Soil Seed & Water",
          },
          category: product.category || product.productType || "Organic soil product",
          sku: String(product.id),
          url: `${SITE_URL}/products/${product.slug}`,
          offers: product.priceTiers
            .filter((tier) => !shouldHidePayPickupTier(product.id, tier.size))
            .map((tier) => ({ tier, pricing: priceForTier(product.id, tier) }))
            .filter(({ pricing }) => Number.isFinite(pricing.price) && pricing.price > 0)
            .map(({ tier, pricing }) => ({
              "@type": "Offer",
              name: `${product.displayTitle} - ${schemaTierLabel(tier.size, product.id)}`,
              price: Number(pricing.price.toFixed(2)),
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/products/${product.slug}`,
              seller: {
                "@type": "LocalBusiness",
                name: SEO_BUSINESS_NAME,
              },
            })),
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Products", item: `${SITE_URL}/products` },
            { "@type": "ListItem", position: 2, name: product.displayTitle, item: `${SITE_URL}/products/${product.slug}` },
          ],
        },
      ]
    : undefined;

  return (
    <>
      <SEO
        title={product ? `${product.displayTitle} — Soil Seed & Water` : "Product Detail"}
        description={seoDescription}
        canonical={`https://organicsoilwholesale.com/products/${product?.slug ?? slug}`}
        keywords={seoKeywords}
        structuredData={productStructuredData}
      />

      <section
        className="bg-gradient-to-b from-[#eef3eb] via-[#f7f4ef] to-[#f3f6f2] py-2 sm:py-8 lg:py-4"
        aria-label="Product details"
      >
        <div className="container mx-auto px-3 sm:px-4 max-w-6xl xl:max-w-7xl">
          {/* Back */}
          <Button variant="ghost" className="mb-2 h-10 min-h-[40px] rounded-lg px-2 text-muted-foreground hover:text-foreground touch-manipulation sm:mb-4 sm:h-11 sm:min-h-[44px] sm:px-3 lg:hidden" asChild>
            <Link href="/products">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Link>
          </Button>

          {/* Loading */}
          {isLoading && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-[400px] rounded-2xl" />
              <Skeleton className="h-[400px] rounded-2xl" />
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-8 text-center">
              <h2 className="text-2xl font-semibold text-destructive">Product not available</h2>
              <p className="mt-2 text-muted-foreground">We couldn&apos;t find that product. It may have been archived or renamed.</p>
              <Button asChild className="mt-6"><Link href="/products">Return to catalog</Link></Button>
            </Card>
          )}

          {/* Product Content */}
          {!isLoading && product && (
            <div className="space-y-4 sm:space-y-8">

              {/* ============================================================ */}
              {/* HERO: Image + Product Info                                    */}
              {/* ============================================================ */}
              <div className="overflow-hidden rounded-2xl border border-[#264027]/12 bg-white shadow-[0_10px_40px_-24px_rgba(38,64,39,0.45)] sm:rounded-3xl">
                {/* Desktop: back sits in the top-left corner of the main card */}
                <div className="hidden border-b border-[#264027]/[0.06] px-4 pt-3 pb-2.5 lg:block lg:px-5">
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Products
                  </Link>
                </div>
                <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  {/* Image gallery */}
                  <div className="bg-gradient-to-br from-[#f4f7f2] via-white to-[#f8f1e7] p-3 sm:p-4 lg:self-start">
                    <div className="flex flex-col gap-3 lg:flex-row-reverse">
                      <div
                        className="group relative h-[245px] cursor-pointer rounded-xl bg-white touch-manipulation sm:h-[390px] lg:h-[460px] lg:flex-1"
                        role={galleryItems.length > 0 ? "button" : undefined}
                        tabIndex={galleryItems.length > 0 ? 0 : -1}
                        onClick={openHeroGallery}
                        onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                          if (galleryItems.length && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault(); openGalleryAt(activeGalleryIndex);
                          }
                        }}
                        aria-label={galleryItems.length > 0 ? "Open product gallery" : undefined}
                      >
                        {activeGalleryItem?.type === "image" ? (
                          <OptimizedImage
                            src={activeGalleryItem.url}
                            alt={product.displayTitle}
                            className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.02] sm:p-5 lg:p-6"
                          />
                        ) : activeGalleryItem?.type === "video" ? (
                          <>
                            <img
                              src={`https://img.youtube.com/vi/${activeGalleryItem.videoId}/hqdefault.jpg`}
                              alt={`${product.displayTitle} video`}
                              className="h-full w-full object-contain p-3 sm:p-5 lg:p-6"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
                                <Play className="h-6 w-6 fill-white" />
                              </span>
                            </div>
                          </>
                        ) : heroImage ? (
                          <OptimizedImage
                            src={heroImage}
                            alt={product.displayTitle}
                            className="h-full w-full object-contain p-3 sm:p-5 lg:p-6"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                            No image available
                          </div>
                        )}
                        {galleryItems.length > 1 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openGalleryAt(activeGalleryIndex);
                            }}
                            className="absolute bottom-3 right-3 flex min-h-[40px] items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/80"
                            aria-label="Open product gallery"
                          >
                            <Maximize2 className="h-3 w-3" />
                            {activeGalleryIndex + 1} / {galleryItems.length}
                          </button>
                        )}
                      </div>

                      {galleryItems.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 lg:w-20 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0">
                          {galleryItems.map((item, index) => {
                            const isActive = index === activeGalleryIndex;
                            return (
                              <button
                                key={`${item.type}-${item.url}`}
                                type="button"
                                onClick={() => setActiveGalleryIndex(index)}
                                aria-current={isActive ? "true" : undefined}
                                className={cn(
                                  "relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm transition touch-manipulation sm:h-16 sm:w-16 lg:h-20 lg:w-20",
                                  isActive ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/60"
                                )}
                                aria-label={`Show gallery item ${index + 1}`}
                              >
                                {item.type === "image" ? (
                                  <OptimizedImage src={item.url} alt="" className="h-full w-full object-contain bg-white p-1" width={120} q={55} />
                                ) : (
                                  <>
                                    <img src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`} alt="" className="h-full w-full object-contain bg-white p-1" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                                      <Play className="h-4 w-4 fill-white text-white" />
                                    </div>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="flex flex-col justify-start p-4 sm:p-6 lg:p-6">
                    {/* Title + cert logos on one line; NPK sits quietly under the name */}
                    <div className="flex items-center justify-between gap-3 sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-3xl">
                          {product.displayTitle}
                        </h1>
                        {product.npk && (
                          <p className="mt-1.5 text-xs font-medium tabular-nums tracking-wide text-stone-500">
                            NPK {product.npk}
                          </p>
                        )}
                      </div>
                      <ProductCertificationMarks
                        certifications={
                          product.id === 111
                            ? product.certifications.filter((cert) => !/omri/i.test(cert))
                            : product.certifications
                        }
                        productSlug={product.id === 111 ? undefined : product.slug}
                        productId={product.id === 111 ? undefined : product.id}
                        variant="detail"
                        className="shrink-0 flex-nowrap justify-end"
                      />
                    </div>

                    {/* Description */}
                    {syncedProductDescription && (
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {syncedProductDescription}
                      </p>
                    )}

                    {(() => {
                      const payPickupContent = product ? getPayPickupProductContent(product.id) : undefined;
                      const includes = payPickupContent?.includes ?? productDetailContent?.includes ?? [];
                      const benefits = payPickupContent?.benefits ?? productDetailContent?.benefits ?? [];
                      const specSheetUrl = payPickupContent?.specSheetUrl;
                      if (includes.length === 0 && benefits.length === 0 && !specSheetUrl) return null;
                      return (
                        <div className="mt-4 space-y-3 lg:mt-3">
                          <PayPickupProductFacts includes={includes} benefits={benefits} variant="detail" />
                          {payPickupContent?.ingredientDisclosure ? (
                            <IngredientDisclosure
                              summary={payPickupContent.ingredientDisclosure.summary}
                              items={payPickupContent.ingredientDisclosure.items}
                            />
                          ) : null}
                          {specSheetUrl && (
                            <a
                              href={specSheetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#b38a58] hover:text-primary hover:underline"
                              onClick={() =>
                                trackEvent("Product Spec Sheet Downloaded", {
                                  product_id: product.id,
                                  product_slug: product.slug,
                                  placement: "buy_box",
                                })
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              {payPickupContent?.specSheetLabel ?? "Download spec sheet"}
                            </a>
                          )}
                        </div>
                      );
                    })()}

                    {/* Step 1: open size list. Step 2 keeps a light panel so delivery/qty don't float. */}
                    <div
                      id="buy"
                      className={cn(
                        "mt-5 scroll-mt-28 lg:mt-4",
                        selectedCategory
                          ? "rounded-2xl border border-[#264027]/10 bg-[#f7f8f5] p-3 sm:p-3.5"
                          : "pt-1",
                      )}
                    >
                      {buyStep === "sizes" ? (
                        <div className="mb-3 flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">Choose a size</p>
                          {pricingSummary && (
                            <p className="text-sm text-muted-foreground">
                              from{" "}
                              <span className="font-bold text-primary">{pricingSummary.price}</span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="mb-3 space-y-2">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={goBuyStepBack}
                              aria-label={
                                buyStep === "configure" && needsChoice
                                  ? `Back to ${subchoiceStepLabel.toLowerCase()}`
                                  : "Back to sizes"
                              }
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#264027]/15 bg-white text-[#264027] shadow-sm transition hover:border-[#264027]/35 hover:bg-[#264027]/[0.04] touch-manipulation"
                            >
                              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
                            </button>
                            <div className="min-w-0">
                              <p className="text-sm font-bold leading-tight text-[#264027]">
                                {buyStep === "subchoice"
                                  ? subchoiceStepLabel
                                  : buyStep === "configure" && needsChoice
                                  ? selectedChoice?.displayLabel || "Your selection"
                                  : isLooseTruckloadSelected
                                  ? "Delivery"
                                  : isBulkPickupSelected
                                  ? "Pickup"
                                  : fulfillmentMode === "flatbed"
                                  ? "Flatbed load"
                                  : "Quantity"}
                              </p>
                              {buyStep === "subchoice" && (
                                <p className="mt-0.5 text-xs text-stone-500">
                                  {selectedCategory.label.replace(/\s*\([^)]*\)\s*$/, "") ||
                                    selectedCategory.label}
                                </p>
                              )}
                            </div>
                          </div>
                          {buyStep === "configure" &&
                            fulfillmentMode &&
                            fulfillmentMode !== "flatbed" && (
                            <div className="rounded-xl border border-[#264027]/12 bg-white/80 px-3 py-2.5">
                              <p className="text-sm font-semibold text-[#264027]">
                                {fulfillmentMode === "loose_truckload"
                                  ? "24-ton walking-floor delivery"
                                  : fulfillmentMode === "bulk_pickup"
                                  ? "Yard pickup · loose bulk"
                                  : phoenixYardPickupOk
                                    ? "Yard pickup"
                                    : "Pay online"}
                              </p>
                              <p className="mt-0.5 text-xs leading-snug text-stone-600">
                                {fulfillmentMode === "loose_truckload"
                                  ? "Standardized semi load. Enter ZIP below for delivery pricing."
                                  : fulfillmentMode === "bulk_pickup"
                                  ? phoenixYardPickupOk
                                    ? "Load at the yard — pick Phoenix or Congress at checkout."
                                    : "Loose bulk is not loading at Phoenix. Choose Congress pickup or delivery at checkout."
                                  : phoenixYardPickupOk
                                    ? "Pay online, then pick up at the Phoenix yard."
                                    : "Phoenix yard is not loading this product right now. Choose delivery or Congress pickup at checkout."}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {buyStep === "sizes" && sizeCategories.length > 0 && (
                        <div className="divide-y divide-[#264027]/10 border-y border-[#264027]/10">
                          {sizeCategories.map((category) => {
                            const shortLabel =
                              category.label.replace(/\s*\([^)]*\)\s*$/, "") || category.label;
                            const parenDetail = category.label.match(/\(([^)]+)\)/)?.[1];
                            const detail =
                              category.secondaryPriceLabel ||
                              parenDetail ||
                              null;
                            return (
                              <button
                                key={category.key}
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryKey(category.key);
                                  setSelectedChoiceSize("");
                                  setQuantity(1);
                                  setDeliveryQuote(null);
                                  trackEvent("Product Size Selected", {
                                    product_id: product.id,
                                    product_slug: product.slug,
                                    size_category: category.label,
                                    price: category.price,
                                  });
                                  scrollBuyIntoView();
                                }}
                                className="group flex w-full items-center gap-3 py-3 text-left transition hover:bg-[#264027]/[0.03] focus:outline-none focus-visible:bg-[#264027]/[0.05] touch-manipulation sm:gap-4 sm:py-3.5"
                              >
                                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#eef4eb] sm:h-[4.5rem] sm:w-[4.5rem]">
                                  {category.image ? (
                                    <OptimizedImage
                                      src={category.image}
                                      alt={category.label}
                                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[15px] font-bold leading-tight text-foreground sm:text-base">
                                    {shortLabel}
                                  </span>
                                  {detail && (
                                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground sm:text-[13px]">
                                      {detail}
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="block text-[15px] font-extrabold text-primary sm:text-base">
                                    {category.priceLabel}
                                  </span>
                                  <span className="mt-0.5 block text-xs font-semibold text-[#b38a58] opacity-0 transition group-hover:opacity-100 sm:opacity-100">
                                    Select →
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {selectedCategory && buyStep !== "sizes" && (
                        <div className="mt-3 space-y-3 lg:space-y-2.5">
                          {/* Single-option sizes keep the category photo. Multi-option chains skip it. */}
                          {!needsChoice && (
                            <div className="flex items-center gap-3 pb-1">
                              {selectedCategory.image && (
                                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#eef4eb] sm:h-20 sm:w-20">
                                  <OptimizedImage
                                    src={selectedCategory.image}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-bold leading-tight text-foreground sm:text-lg">
                                  {selectedCategory.label.replace(/\s*\([^)]*\)\s*$/, "") || selectedCategory.label}
                                </p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                  {selectedChoice?.subLabel ||
                                    selectedCategory.secondaryPriceLabel?.replace(/^\$[\d.]+\/\w+\s·\s/, "") ||
                                    selectedCategory.label.match(/\(([^)]+)\)/)?.[1] ||
                                    ""}
                                </p>
                                {selectedChoice && (
                                  <p className="mt-1 text-xl font-extrabold text-primary">
                                    {fmt(selectedTotal)}
                                    {quantity > 1 ? (
                                      <span className="ml-1.5 text-sm font-semibold text-muted-foreground">
                                        ({quantity} loads)
                                      </span>
                                    ) : null}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {needsChoice && (
                            <div className="grid gap-2.5">
                              {selectedCategory.choices
                                // Once chosen, only show that option — ← back swaps bag/pallet.
                                .filter((choice) =>
                                  buyStep === "configure"
                                    ? choice.size === selectedChoiceSize
                                    : true,
                                )
                                .map((choice) => {
                                const isSelected = choice.size === selectedChoiceSize;
                                const choiceImage = imageForChoice(choice, selectedCategory.image);
                                return (
                                  <button
                                    key={choice.size}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected && buyStep === "configure") return;
                                      setSelectedChoiceSize(choice.size);
                                      setQuantity(1);
                                      trackEvent("Product Purchase Type Selected", {
                                        product_id: product.id,
                                        product_slug: product.slug,
                                        size_category: selectedCategory.label,
                                        format: choice.cartLabel,
                                        price: choice.displayPrice,
                                      });
                                      scrollBuyIntoView();
                                    }}
                                    className={cn(
                                      "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3.5 text-left transition touch-manipulation sm:gap-4 sm:px-3.5",
                                      isSelected
                                        ? "border-[#264027] bg-[#264027] text-white shadow-md shadow-[#264027]/20"
                                        : "border-[#264027]/12 bg-white hover:border-[#264027]/30 hover:bg-[#f7f8f5]",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl sm:h-[4.25rem] sm:w-[4.25rem]",
                                        isSelected ? "bg-white ring-2 ring-white/80" : "bg-[#eef4eb] ring-1 ring-stone-200/70",
                                      )}
                                    >
                                      {choiceImage ? (
                                        <OptimizedImage
                                          src={choiceImage}
                                          alt={choice.displayLabel}
                                          className="h-full w-full object-contain p-1.5"
                                        />
                                      ) : null}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={cn(
                                            "text-[15px] font-bold sm:text-base",
                                            isSelected ? "text-white" : "text-foreground",
                                          )}
                                        >
                                          {choice.displayLabel}
                                        </span>
                                        {choice.badge && (
                                          <span
                                            className={cn(
                                              "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                                              isSelected
                                                ? "bg-[#b38a58] text-white"
                                                : "bg-amber-500 text-white",
                                            )}
                                          >
                                            {choice.badge}
                                          </span>
                                        )}
                                      </span>
                                      <span
                                        className={cn(
                                          "mt-0.5 block text-xs sm:text-[13px]",
                                          isSelected ? "text-white/80" : "text-muted-foreground",
                                        )}
                                      >
                                        {choice.subLabel}
                                        {choice.kind === "pallet" ? " · volume discount" : ""}
                                      </span>
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                                      <span className="text-right">
                                        {choice.compareAtPrice != null && (
                                          <span
                                            className={cn(
                                              "mr-1.5 text-xs line-through",
                                              isSelected ? "text-white/55" : "text-muted-foreground",
                                            )}
                                          >
                                            {fmt(choice.compareAtPrice)}
                                          </span>
                                        )}
                                        <span
                                          className={cn(
                                            "text-[15px] font-extrabold sm:text-base",
                                            isSelected ? "text-white" : "text-primary",
                                          )}
                                        >
                                          {fmt(choice.displayPrice)}
                                        </span>
                                      </span>
                                      <span
                                        className={cn(
                                          "inline-flex h-7 w-7 items-center justify-center rounded-full",
                                          isSelected
                                            ? "bg-[#b38a58] text-white"
                                            : "border border-[#264027]/20 bg-white text-transparent",
                                        )}
                                      >
                                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {isBulkPickupSelected && (
                            <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                                  Pickup yards
                                </p>
                                <p className="text-[11px] font-medium text-muted-foreground">
                                  Choose yard at checkout
                                </p>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {PICKUP_LOCATIONS.filter((loc) =>
                                  phoenixYardPickupOk || loc.id === "congress",
                                ).map((loc) => {
                                  const isCongress = loc.id === "congress";
                                  return (
                                    <div
                                      key={loc.id}
                                      className="rounded-lg border border-border/60 bg-white/90 px-3 py-2.5"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-foreground">
                                            {loc.pickupLocationLabel}
                                          </p>
                                          <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
                                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                            {loc.addressLine}
                                          </p>
                                        </div>
                                        <span
                                          className={cn(
                                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                            isCongress
                                              ? "bg-stone-100 text-stone-600"
                                              : "bg-stone-100 text-stone-600",
                                          )}
                                        >
                                          {isCongress ? "~30 min" : "Appt"}
                                        </span>
                                      </div>
                                      <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-stone-700">
                                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                        {isCongress
                                          ? `~30 min · ${HOURS_LABEL}`
                                          : "~1 week · slot at checkout · 12-ton max"}
                                      </p>
                                      <a
                                        href={loc.directionsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                                      >
                                        Directions
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {selectedChoice && (
                            <div className="flex items-center justify-between gap-3 pt-1">
                              <div className="inline-flex items-center gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  Qty
                                </span>
                                <div className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-white p-1">
                                  <button
                                    type="button"
                                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted touch-manipulation"
                                    aria-label="Decrease quantity"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => setQuantity((q) => q + 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted touch-manipulation"
                                    aria-label="Increase quantity"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              {needsChoice && (
                                <p className="text-right text-xl font-bold text-primary">
                                  {fmt(selectedTotal)}
                                  {quantity > 1 ? (
                                    <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                                      {quantity} × {fmt(selectedChoice.displayPrice)}
                                    </span>
                                  ) : null}
                                </p>
                              )}
                            </div>
                          )}

                          {isLooseTruckloadSelected && selectedChoice && (
                            <div className="space-y-2.5">
                              <div className="rounded-xl border border-[#b38a58]/25 bg-gradient-to-br from-[#faf6f0] to-white p-3 sm:p-3.5">
                                <DeliveryQuoteWidget
                                  key={`${selectedChoice.size}-${quantity}`}
                                  items={deliveryQuoteItems}
                                  productSubtotal={selectedTotal}
                                  initialZip={deliveryZip}
                                  compact
                                  onQuote={(quote, ctx) => {
                                    setDeliveryQuote(quote);
                                    setDeliveryZip(ctx.zip);
                                    setDeliveryRoughAccess(ctx.roughAccess);
                                    setDeliverySemiAccess(ctx.semiAccess);
                                    if (quote) {
                                      saveDeliveryDraft({
                                        zip: ctx.zip,
                                        roughAccess: ctx.roughAccess,
                                        semiAccess: ctx.semiAccess,
                                        quote,
                                        city: quote.breakdown.destinationCity ?? null,
                                        state: quote.breakdown.destinationState ?? null,
                                      });
                                    }
                                  }}
                                  onGetPriceSuccess={(quote, ctx) => {
                                    setDeliveryQuote(quote);
                                    setDeliveryZip(ctx.zip);
                                    setDeliveryRoughAccess(ctx.roughAccess);
                                    setDeliverySemiAccess(ctx.semiAccess);
                                    saveDeliveryDraft({
                                      zip: ctx.zip,
                                      roughAccess: ctx.roughAccess,
                                      semiAccess: ctx.semiAccess,
                                      quote,
                                      city: quote.breakdown.destinationCity ?? null,
                                      state: quote.breakdown.destinationState ?? null,
                                    });
                                    // Stay on PDP — customer can + add or Deliver when ready.
                                  }}
                                />
                              </div>
                              {canPayOnline && (
                                <div className="space-y-1.5">
                                  <div className="flex gap-2.5">
                                    <button
                                      type="button"
                                      disabled={!selectedChoice}
                                      onClick={() => addSelectionToCart("checkout")}
                                      className="group relative flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-b from-[#c49a68] to-[#b38a58] px-3 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(179,138,88,0.75)] transition hover:from-[#b38a58] hover:to-[#9c7648] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 touch-manipulation"
                                    >
                                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                                      <ShoppingBag className="relative h-4 w-4 shrink-0 drop-shadow-sm" />
                                      <span className="relative">Buy Now</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!selectedChoice}
                                      onClick={() => addSelectionToCart()}
                                      aria-label={justAdded ? "Added to order" : "Add to order"}
                                      title={justAdded ? "Added to order" : "Add truckload to order"}
                                      className={cn(
                                        "relative flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl transition touch-manipulation disabled:pointer-events-none disabled:opacity-50 active:scale-95",
                                        justAdded
                                          ? "bg-[#264027] text-white shadow-[0_8px_18px_-6px_rgba(38,64,39,0.65)]"
                                          : "border-2 border-[#264027]/25 bg-white text-[#264027] shadow-sm hover:border-[#264027] hover:bg-[#264027] hover:text-white hover:shadow-md",
                                      )}
                                    >
                                      {justAdded ? (
                                        <Check
                                          className="h-6 w-6 animate-in zoom-in-50 duration-300"
                                          strokeWidth={2.75}
                                        />
                                      ) : (
                                        <Plus className="h-6 w-6" strokeWidth={2.5} />
                                      )}
                                    </button>
                                  </div>
                                  <p className="text-center text-[11px] text-stone-500">
                                    Delivery only — walking-floor loads can&apos;t be picked up.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {canPayOnline && !isLooseTruckloadSelected && (
                            <div className="space-y-2.5">
                              {needsChoice && !selectedChoiceSize ? (
                                <Button
                                  size="lg"
                                  className="min-h-[48px] w-full rounded-xl bg-[#b38a58] text-base font-bold text-white shadow-md hover:bg-[#9c7648] touch-manipulation"
                                  disabled
                                >
                                  <ShoppingBag className="mr-2 h-4 w-4" />
                                  Choose bag or pallet
                                </Button>
                              ) : fulfillmentMode === "flatbed" ? (
                                <div className="space-y-1.5">
                                  <div className="flex gap-2.5">
                                    <button
                                      type="button"
                                      disabled={!selectedChoice}
                                      onClick={() => addSelectionToCart("checkout")}
                                      className="group relative flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-b from-[#c49a68] to-[#b38a58] px-3 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(179,138,88,0.75)] transition hover:from-[#b38a58] hover:to-[#9c7648] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 touch-manipulation"
                                    >
                                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                                      <ShoppingBag className="relative h-4 w-4 shrink-0 drop-shadow-sm" />
                                      <span className="relative">Buy Now</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!selectedChoice}
                                      onClick={() => addSelectionToCart()}
                                      aria-label={justAdded ? "Added to flatbed" : "Add to flatbed"}
                                      title={
                                        justAdded
                                          ? "Added to flatbed load"
                                          : pendingFlatbedSpots > 0
                                            ? `Add to flatbed · +${pendingFlatbedSpots} spot${pendingFlatbedSpots === 1 ? "" : "s"}`
                                            : "Add to flatbed load"
                                      }
                                      className={cn(
                                        "relative flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl transition touch-manipulation disabled:pointer-events-none disabled:opacity-50 active:scale-95",
                                        justAdded
                                          ? "bg-[#264027] text-white shadow-[0_8px_18px_-6px_rgba(38,64,39,0.65)]"
                                          : "border-2 border-[#264027]/25 bg-white text-[#264027] shadow-sm hover:border-[#264027] hover:bg-[#264027] hover:text-white hover:shadow-md",
                                      )}
                                    >
                                      {justAdded ? (
                                        <Check
                                          className="h-6 w-6 animate-in zoom-in-50 duration-300"
                                          strokeWidth={2.75}
                                        />
                                      ) : (
                                        <Plus className="h-6 w-6" strokeWidth={2.5} />
                                      )}
                                    </button>
                                  </div>
                                  <p className="text-center text-[11px] text-stone-500">
                                    Pickup or delivery — choose at checkout. Pallets need a scheduled slot.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="flex gap-2.5">
                                    <button
                                      type="button"
                                      disabled={!selectedChoice}
                                      onClick={() => addSelectionToCart("checkout")}
                                      className="group relative flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-b from-[#c49a68] to-[#b38a58] px-3 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(179,138,88,0.75)] transition hover:from-[#b38a58] hover:to-[#9c7648] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 touch-manipulation"
                                    >
                                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                                      <ShoppingBag className="relative h-4 w-4 shrink-0 drop-shadow-sm" />
                                      <span className="relative">Buy Now</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!selectedChoice}
                                      onClick={() => addSelectionToCart()}
                                      aria-label={justAdded ? "Added to order" : "Add to order"}
                                      title={justAdded ? "Added to order" : "Add to order"}
                                      className={cn(
                                        "relative flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl transition touch-manipulation disabled:pointer-events-none disabled:opacity-50 active:scale-95",
                                        justAdded
                                          ? "bg-[#264027] text-white shadow-[0_8px_18px_-6px_rgba(38,64,39,0.65)]"
                                          : "border-2 border-[#264027]/25 bg-white text-[#264027] shadow-sm hover:border-[#264027] hover:bg-[#264027] hover:text-white hover:shadow-md",
                                      )}
                                    >
                                      {justAdded ? (
                                        <Check
                                          className="h-6 w-6 animate-in zoom-in-50 duration-300"
                                          strokeWidth={2.75}
                                        />
                                      ) : (
                                        <Plus className="h-6 w-6" strokeWidth={2.5} />
                                      )}
                                    </button>
                                  </div>
                                  <p className="text-center text-[11px] text-stone-500">
                                    {isBulkPickupSelected
                                      ? phoenixYardPickupOk
                                        ? "Choose Congress or Phoenix at checkout."
                                        : "Congress pickup or delivery — Phoenix is not loading this bulk."
                                      : phoenixYardPickupOk
                                        ? "Bags ready in about 30 min · need delivery? Choose it at checkout."
                                        : "Delivery or Congress pickup at checkout. Phoenix yard is not loading this product right now."}
                                  </p>
                                </div>
                              )}
                              <CallMeHelpButton
                                disabled={!selectedChoice || (needsChoice && !selectedChoiceSize)}
                                onClick={() => addSelectionToCart("callback")}
                              />
                            </div>
                          )}
                          {canPayOnline && isLooseTruckloadSelected && selectedChoice && (
                            <CallMeHelpButton onClick={() => addSelectionToCart("callback")} />
                          )}
                          {!canPayOnline && (
                            <div className="space-y-2.5">
                              <Button
                                size="lg"
                                className="min-h-[48px] w-full rounded-xl font-semibold shadow-md touch-manipulation"
                                disabled={!selectedChoice || (needsChoice && !selectedChoiceSize)}
                                onClick={() => addSelectionToCart("checkout")}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Request a Quote
                              </Button>
                              <CallMeHelpButton
                                disabled={!selectedChoice || (needsChoice && !selectedChoiceSize)}
                                onClick={() => addSelectionToCart("callback")}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Amazon reviews for this SKU — right under the buy box */}
              {amazonReviewsForProduct(product.id).length > 0 ? (
                <AmazonReviewCarousel
                  productId={product.id}
                  productName={product.displayTitle}
                  variant="pdp"
                />
              ) : null}

              {(() => {
                const payPickupContent = getPayPickupProductContent(product.id);
                const ingredientDetails = payPickupContent?.ingredientDetails ?? [];
                const specSheetUrl = payPickupContent?.specSheetUrl;
                if (payPickupContent?.ingredientDisclosure || ingredientDetails.length === 0) return null;
                return (
                  <Card className="overflow-hidden rounded-2xl border border-[#264027]/12 bg-gradient-to-br from-white via-[#fbfaf7] to-[#eef4eb] p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b38a58]">
                          Inside the mix
                        </p>
                        <h2 className="mt-1 text-base font-semibold sm:text-lg">
                          What&apos;s in {product.displayTitle}
                        </h2>
                        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                          Short notes on each input — full details are in the spec sheet.
                        </p>
                      </div>
                      {specSheetUrl && (
                        <a
                          href={specSheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-full border border-[#264027]/20 bg-white px-3.5 py-2 text-sm font-bold text-primary shadow-sm transition hover:border-primary hover:bg-primary/5"
                          onClick={() =>
                            trackEvent("Product Spec Sheet Downloaded", {
                              product_id: product.id,
                              product_slug: product.slug,
                              placement: "ingredients_section",
                            })
                          }
                        >
                          <Download className="h-4 w-4" />
                          Spec sheet
                        </a>
                      )}
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {ingredientDetails.map((item, index) => (
                        <div
                          key={item.name}
                          className={cn(
                            "rounded-xl border px-3.5 py-3 shadow-sm",
                            index % 2 === 0
                              ? "border-[#264027]/12 bg-[#f4f7f2]"
                              : "border-[#b38a58]/20 bg-[#faf6f0]",
                          )}
                        >
                          <p className="text-sm font-bold text-[#264027]">{item.name}</p>
                          <p className="mt-1 text-sm leading-snug text-stone-600">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })()}

              {productDetailContent?.guideImages.length ? (
                <Card className="overflow-hidden rounded-2xl border border-[#264027]/12 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Product guide</p>
                      <h2 className="mt-1 text-base font-semibold sm:text-lg">What this product does</h2>
                    </div>
                    <p className="hidden max-w-sm text-right text-xs leading-relaxed text-muted-foreground sm:block">
                      Quick visual notes from the product guide.
                    </p>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {productDetailContent.guideImages.map((image, index) => (
                      <button
                        type="button"
                        key={image}
                        onClick={() => openGuideImageAt(index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openGuideImageAt(index);
                          }
                        }}
                        className="group relative aspect-square w-[168px] flex-shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-50 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-[190px] lg:w-[210px]"
                        aria-label={`Open ${product.displayTitle} guide image ${index + 1}`}
                      >
                        <OptimizedImage
                          src={image}
                          alt={`${product.displayTitle} guide ${index + 1}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          width={420}
                          q={72}
                        />
                        <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary opacity-0 shadow-sm ring-1 ring-black/5 transition group-hover:opacity-100 group-focus:opacity-100">
                          <Maximize2 className="h-4 w-4" />
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              ) : null}

              {/* ============================================================ */}
              {/* PRODUCT DETAILS: How to Use + Best For                        */}
              {/* ============================================================ */}
              {(resolvedUsageSteps.length > 0 || bestFitAudiences(product).length > 0) && (
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                  {resolvedUsageSteps.length > 0 && (
                    <Card className="rounded-2xl border border-[#264027]/12 bg-gradient-to-b from-white to-[#f4f7f2] p-5 shadow-sm sm:p-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Garden use</p>
                          <h2 className="mt-1 text-base font-semibold sm:text-lg">How to Use</h2>
                        </div>
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Quick guide</span>
                      </div>
                      <div className="space-y-3">
                        {resolvedUsageSteps.map((step, index) => (
                          <div key={step} className="flex gap-3 rounded-xl border border-[#264027]/8 bg-white/80 p-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <p className="text-sm leading-relaxed text-stone-600">{step}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  {bestFitAudiences(product).length > 0 && (
                    <Card className="rounded-2xl border border-[#b38a58]/25 bg-gradient-to-b from-white to-[#faf6f0] p-5 shadow-sm sm:p-6">
                      <div className="mb-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b38a58]">Best fit</p>
                        <h2 className="mt-1 text-base font-semibold sm:text-lg">Best For</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {bestFitAudiences(product).map((item) => (
                          <div key={item} className="flex min-h-[42px] items-center gap-2 rounded-xl border border-[#b38a58]/20 bg-white px-3 py-2 text-sm font-medium text-stone-700">
                            <Leaf className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 rounded-xl border border-[#b38a58]/20 bg-[#f7efe3] px-3 py-2 text-sm leading-relaxed text-[#6b5435]">
                        {bestFitNote(product)}
                      </p>
                    </Card>
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* VIDEO                                                         */}
              {/* ============================================================ */}
              {product.videoUrls.length > 0 && (() => {
                const videoId = extractYouTubeVideoId(product.videoUrls[0]);
                if (!videoId) return null;
                return (
                  <Card className="rounded-2xl border bg-white overflow-hidden shadow-sm">
                    <YouTubePlayer videoId={videoId} title={product.displayTitle} className="w-full" />
                  </Card>
                );
              })()}

              <TrustStrip page={`/products/${product.slug}`} />

              {/* ============================================================ */}
              {/* BOTTOM CTA                                                    */}
              {/* ============================================================ */}
              <div className="bg-gray-900 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center text-white">
                <h2 className="text-xl sm:text-2xl font-heading font-bold">
                  Need help with <span className="text-primary-light">{product.displayTitle}</span>?
                </h2>
                <p className="mt-2 text-sm text-white/70">Call us for delivery timing, bulk questions, or product fit.</p>
                <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
                  <Button size="lg" className="min-h-[48px] bg-primary hover:bg-primary/90 shadow-lg touch-manipulation" asChild>
                    <a href={CUSTOMER_SUPPORT_PHONE_TEL}>
                      <Phone className="mr-2 h-4 w-4" />
                      Call {CUSTOMER_SUPPORT_PHONE_DISPLAY}
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================== */}
      {/* GALLERY DIALOG                                                      */}
      {/* ================================================================== */}
      <Dialog open={isGalleryOpen} onOpenChange={setIsGalleryOpen}>
        <DialogContent
          hideCloseButton
          className="flex h-[100svh] max-h-[100svh] w-screen !max-w-[100vw] !gap-0 overflow-hidden rounded-none border-none bg-[#061827] !p-0 text-white shadow-2xl sm:h-[92vh] sm:max-h-[92vh] sm:max-w-6xl sm:rounded-2xl"
        >
          {galleryItems.length > 0 ? (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#07111e] px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="min-w-0 text-left">
                  <DialogTitle className="truncate text-base font-bold leading-tight text-white sm:text-lg">
                    {product?.displayTitle ?? "Product gallery"}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs text-white/55">
                    Product images and videos · {activeGalleryIndex + 1} of {galleryItems.length}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {activeGalleryItem?.type === "image" && (
                    <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                      <button
                        type="button"
                        onClick={() => stepGalleryZoom(-1)}
                        disabled={galleryZoom <= 1}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:opacity-35"
                        aria-label="Zoom out"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={toggleGalleryZoom}
                        className="min-w-[3.25rem] px-1 text-center text-xs font-bold text-white/85"
                        aria-label={galleryZoom > 1 ? "Reset zoom" : "Zoom in"}
                      >
                        {Math.round(galleryZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => stepGalleryZoom(1)}
                        disabled={galleryZoom >= 2.25}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:opacity-35"
                        aria-label="Zoom in"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 sm:inline-flex">
                    {activeGalleryIndex + 1} of {galleryItems.length}
                  </span>
                  <DialogClose className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#061827] shadow-lg shadow-black/30 transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/70">
                    <X className="h-4 w-4" />
                    Close
                  </DialogClose>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
                <div
                  className="relative flex min-h-0 flex-1 touch-pan-y bg-[#071b2b] p-3 sm:p-5"
                  {...gallerySwipeHandlers}
                >
                  <div
                    className={cn(
                      "h-full max-h-[calc(100svh-166px-env(safe-area-inset-bottom))] min-h-0 w-full rounded-xl bg-white shadow-2xl shadow-black/25 sm:max-h-[calc(92vh-190px)] sm:rounded-2xl",
                      galleryZoom > 1 ? "overflow-auto overscroll-contain" : "overflow-hidden",
                    )}
                  >
                    <div
                      key={activeGalleryIndex}
                      className={cn(
                        "flex min-h-full min-w-full animate-in items-center justify-center fade-in-0 duration-300",
                        galleryZoom > 1 ? "p-0" : "h-full w-full",
                      )}
                    >
                      {activeGalleryItem?.type === "video" ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <YouTubePlayer videoId={activeGalleryItem.videoId} title={product?.displayTitle ?? "Video"} className="w-full" autoPlay muted={false} />
                        </div>
                      ) : activeGalleryItem?.type === "image" ? (
                        <button
                          type="button"
                          onClick={handleGalleryImageActivate}
                          className={cn(
                            "block touch-manipulation focus:outline-none",
                            galleryZoom > 1 ? "cursor-zoom-out" : "h-full w-full cursor-zoom-in",
                          )}
                          aria-label={galleryZoom > 1 ? "Zoom out image" : "Zoom in image"}
                        >
                          <OptimizedImage
                            src={activeGalleryItem.url}
                            alt={product?.displayTitle ?? "Product"}
                            width={1600}
                            q={85}
                            className={cn(
                              "max-w-none object-contain transition-transform duration-200",
                              galleryZoom > 1
                                ? "p-0"
                                : "h-full max-h-full w-full max-w-full p-3 sm:p-4",
                            )}
                            style={
                              galleryZoom > 1
                                ? {
                                    width: `${galleryZoom * 100}%`,
                                    maxWidth: "none",
                                    height: "auto",
                                  }
                                : undefined
                            }
                          />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {galleryItems.length > 1 && galleryZoom <= 1 && (
                    <>
                      <button
                        type="button"
                        className={cn(galleryNavButtonClass, "left-2 sm:left-5")}
                        onClick={goToPrev}
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="h-7 w-7" strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className={cn(galleryNavButtonClass, "right-2 sm:right-5")}
                        onClick={goToNext}
                        aria-label="Next photo"
                      >
                        <ChevronRight className="h-7 w-7" strokeWidth={2.25} />
                      </button>
                    </>
                  )}
                  {activeGalleryItem?.type === "image" && galleryZoom <= 1 && (
                    <p className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm sm:hidden">
                      {galleryItems.length > 1 ? "Swipe for more · tap to zoom" : "Tap photo to zoom"}
                    </p>
                  )}
                </div>

                {galleryItems.length > 1 && (
                  <div className="border-t border-white/10 bg-[#07111e] px-3 py-3 sm:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="shrink-0 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                        {activeGalleryIndex + 1} / {galleryItems.length}
                      </p>
                      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
                        {galleryItems.map((item, index) => {
                          const isActive = index === activeGalleryIndex;
                          if (item.type === "image") {
                            return (
                              <button key={`${item.url}-${index}`} type="button" onClick={() => setActiveGalleryIndex(index)}
                                className={cn(
                                  "h-14 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white transition sm:h-16 sm:w-20",
                                  isActive ? "border-white ring-2 ring-white/60 scale-105" : "border-white/20 opacity-70 hover:opacity-100"
                                )}
                                aria-label={`Image ${index + 1}`} aria-current={isActive}>
                                <OptimizedImage src={item.url} alt="" className="h-full w-full object-contain bg-white p-1" />
                              </button>
                            );
                          }
                          return (
                            <button key={`${item.url}-${index}`} type="button" onClick={() => setActiveGalleryIndex(index)}
                              className={cn(
                                "relative h-14 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white transition sm:h-16 sm:w-20",
                                isActive ? "border-white ring-2 ring-white/60 scale-105" : "border-white/20 opacity-70 hover:opacity-100"
                              )}
                              aria-label={`Video ${index + 1}`} aria-current={isActive}>
                              <img src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`} alt="" className="h-full w-full object-contain bg-white p-1" />
                              <div className="absolute bottom-1 right-1 rounded-full bg-red-600 p-1">
                                <Play className="h-2.5 w-2.5 text-white fill-white" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#07111e] px-4 py-3 sm:px-5">
                <DialogTitle className="text-base font-bold text-white">Product gallery</DialogTitle>
                <DialogClose className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#061827]">
                  <X className="h-4 w-4" />
                  Close
                </DialogClose>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <ImagePlus className="h-12 w-12 text-white/40 mb-4" />
                <p className="text-sm text-white/60">No media available.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isGuideGalleryOpen} onOpenChange={setIsGuideGalleryOpen}>
        <DialogContent
          hideCloseButton
          className="flex h-[100svh] max-h-[100svh] w-screen !max-w-[100vw] !gap-0 overflow-hidden rounded-none border-none bg-[#061827] !p-0 text-white shadow-2xl sm:h-auto sm:max-h-[88vh] sm:max-w-4xl sm:rounded-2xl"
        >
          {activeGuideImage ? (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#07111e] px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="min-w-0 text-left">
                  <DialogTitle className="truncate text-base font-bold leading-tight text-white sm:text-lg">
                    {product?.displayTitle ?? "Product guide"}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs text-white/55">
                    Product guide · {activeGuideImageIndex + 1} of {guideImages.length}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                    <button
                      type="button"
                      onClick={() => stepGuideZoom(-1)}
                      disabled={guideZoom <= 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:opacity-35"
                      aria-label="Zoom out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleGuideZoom}
                      className="min-w-[3.25rem] px-1 text-center text-xs font-bold text-white/85"
                      aria-label={guideZoom > 1 ? "Reset zoom" : "Zoom in"}
                    >
                      {Math.round(guideZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => stepGuideZoom(1)}
                      disabled={guideZoom >= 2.25}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:opacity-35"
                      aria-label="Zoom in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 sm:inline-flex">
                    {activeGuideImageIndex + 1} of {guideImages.length}
                  </span>
                  <DialogClose className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#061827] shadow-lg shadow-black/30 transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/70">
                    <X className="h-4 w-4" />
                    Close
                  </DialogClose>
                </div>
              </div>

              <div
                className="relative flex min-h-0 flex-1 touch-pan-y bg-[#071b2b] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:max-h-[calc(88vh-70px)] sm:p-5"
                {...guideSwipeHandlers}
              >
                <div
                  className={cn(
                    "h-full min-h-0 w-full rounded-xl bg-white shadow-2xl shadow-black/25 sm:max-h-[calc(88vh-110px)] sm:rounded-2xl",
                    guideZoom > 1 ? "overflow-auto overscroll-contain" : "overflow-hidden",
                  )}
                >
                  <div
                    key={activeGuideImageIndex}
                    className={cn(
                      "flex min-h-full min-w-full animate-in items-center justify-center fade-in-0 duration-300",
                      guideZoom > 1 ? "p-0" : "h-full w-full",
                    )}
                  >
                    <button
                      type="button"
                      onClick={handleGuideImageActivate}
                      className={cn(
                        "block touch-manipulation focus:outline-none",
                        guideZoom > 1 ? "cursor-zoom-out" : "h-full w-full cursor-zoom-in",
                      )}
                      aria-label={guideZoom > 1 ? "Zoom out image" : "Zoom in image"}
                    >
                      <OptimizedImage
                        src={activeGuideImage}
                        alt={`${product?.displayTitle ?? "Product"} guide ${activeGuideImageIndex + 1}`}
                        className={cn(
                          "max-w-none object-contain transition-transform duration-200",
                          guideZoom > 1
                            ? "p-0"
                            : "h-full max-h-[calc(100svh-86px)] w-full max-w-full p-2 sm:max-h-[calc(88vh-112px)] sm:p-4",
                        )}
                        style={
                          guideZoom > 1
                            ? {
                                width: `${guideZoom * 100}%`,
                                maxWidth: "none",
                                height: "auto",
                              }
                            : undefined
                        }
                        width={1200}
                        q={82}
                      />
                    </button>
                  </div>
                </div>
                {guideImages.length > 1 && guideZoom <= 1 && (
                  <>
                    <button
                      type="button"
                      className={cn(galleryNavButtonClass, "left-2 sm:left-5")}
                      onClick={goToPrevGuideImage}
                      aria-label="Previous guide image"
                    >
                      <ChevronLeft className="h-7 w-7" strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      className={cn(galleryNavButtonClass, "right-2 sm:right-5")}
                      onClick={goToNextGuideImage}
                      aria-label="Next guide image"
                    >
                      <ChevronRight className="h-7 w-7" strokeWidth={2.25} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <OrderCallbackDialog
        open={callbackOpen}
        onOpenChange={(open) => {
          setCallbackOpen(open);
          if (!open) setCallbackPending([]);
        }}
        pendingItems={callbackPending}
      />
    </>
  );
};

export default ProductDetail;
