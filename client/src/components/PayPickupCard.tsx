import { type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/OptimizedImage";
import { CheckCircle2, Flame, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPayPickupProductContent, getPayPickupProductDescription } from "@/data/payPickupProductContent";
import { shouldHidePhoenixYardBulkSize } from "@shared/phoenixYardPickup.js";
import { PayPickupProductFacts } from "@/components/PayPickupProductFacts";

export interface PayPickupProductSize {
  key: string;
  label: string;
  price: number;
  priceCents: number;
  unit?: string;
  msrp?: string;
}

export interface PayPickupProduct {
  id: number;
  name: string;
  productType: string;
  slug?: string;
  imageUrl?: string;
  texturePhotoUrl?: string;
  sizes: PayPickupProductSize[];
}

interface PayPickupCardProps {
  product: PayPickupProduct;
  /** Override hero image — typically a bag studio shot from featured config */
  heroImageOverride?: string;
  /** Optional bestfor collage to sit behind the bag */
  backdropImageOverride?: string;
  className?: string;
  priority?: boolean;
  /**
   * Buy Now button style.
   * - "brand"   (default) — OSW phthalo green, used on /products
   * - "minimal" — black on white, used on /qr to match the minimal landing
   */
  buyButtonVariant?: "brand" | "minimal";
}

const parseMoney = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const productMsrpOverrides: Record<number, Record<string, { price: number; priceLabel?: string }>> = {
  1000: {
    "1CF Bag": { price: 24.9 },
    Tote: { price: 150 },
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

const displayPriceFor = (productId: number, size: PayPickupProductSize) => {
  const override = productMsrpOverrides[Number(productId)]?.[size.key];
  const msrp = parseMoney(size.msrp);
  const price = override?.price ?? msrp ?? size.price;
  return {
    price,
    priceLabel: override?.priceLabel ?? `$${price.toFixed(2)}`,
  };
};

const getStartingPrice = (product: PayPickupProduct) => {
  // Defensive: prod payload may omit `key` on size options. Treat missing as non-Pallet.
  const firstSingle = product.sizes.find((size) => !(size.key ?? "").startsWith("Pallet"));
  return firstSingle ? displayPriceFor(product.id, firstSingle).priceLabel : null;
};

const sizeCategoryLabel = (key: string) => {
  if (!key) return "";
  if (key.includes("9lb")) return "9 lb bag";
  if (key.includes("1.5CF")) return "1.5 cu ft bag";
  if (key.includes("1CF")) return "40 lb bag (1 cu ft)";
  if (key.includes("2CF")) return "2 cu ft bag";
  if (key.includes("Tote")) return "super sack";
  if (key.includes("Bulk Pickup")) return "bulk pickup";
  if (key.includes("Truckload") || key.includes("Bulk")) return "truckload";
  return key;
};

const getSizeCategories = (product: PayPickupProduct) => {
  const summary = getPayPickupProductContent(product.id)?.sizeSummaries;
  if (summary?.length) return summary;

  const categories = product.sizes
    .filter((size) => !(size.key ?? "").startsWith("Pallet"))
    .filter((size) => !shouldHidePhoenixYardBulkSize(product.id, size.key ?? size.label ?? ""))
    .map((size) => sizeCategoryLabel(size.key ?? size.label ?? ""))
    .filter(Boolean);

  return Array.from(new Set(categories));
};

/** Seasonal badges. Empty for now — re-introduce when we have a system-wide
 *  seasonality model so we're not flagging a single product as a one-off. */
const PRODUCT_SEASONAL_BADGES: Record<number, string> = {};

export function PayPickupCard({ product, heroImageOverride, backdropImageOverride, className, priority = false, buyButtonVariant = "brand" }: PayPickupCardProps) {
  const [, navigate] = useLocation();
  const goToDetail = () => {
    const slug = product.slug || String(product.id);
    navigate(`/products/${slug}`);
  };
  const goToBuy = () => {
    const slug = product.slug || String(product.id);
    window.location.assign(`/products/${slug}#buy`);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Nested buttons handle their own keys; do not intercept Choose Size.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToDetail();
    }
  };

  // Hero stays on the BRANDED BAG photo — customers want to see the product, not the pallet
  const baseHero = heroImageOverride || product.imageUrl || product.texturePhotoUrl;
  const heroImage = baseHero;
  const textureImage = product.texturePhotoUrl;
  const startingPrice = getStartingPrice(product);
  const sizeCategories = getSizeCategories(product);
  const cardContent = getPayPickupProductContent(product.id);
  const description = getPayPickupProductDescription(
    product.id,
    "Open the product page to view available sizes, pricing, pickup, and quote options.",
  );

  const identity = (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-heading text-base font-bold leading-tight text-stone-900 md:text-xl">
          {product.productType}
        </h3>
        <p className="truncate text-xs font-medium text-[#7a5a2e] md:text-sm">{product.name}</p>
      </div>
      {PRODUCT_SEASONAL_BADGES[product.id] && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#c62828] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
          <Flame className="h-3 w-3" />
          {PRODUCT_SEASONAL_BADGES[product.id]}
        </span>
      )}
    </div>
  );

  const descriptionPreview = (
    <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-stone-600 md:mt-3 md:line-clamp-none md:text-sm md:leading-relaxed">
      {description}
    </p>
  );

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "group flex h-full cursor-pointer flex-col gap-2.5 overflow-hidden rounded-2xl bg-white p-2.5 shadow-[0_4px_18px_rgba(38,64,39,0.07)] ring-1 ring-stone-200/60 transition-shadow duration-300 hover:shadow-[0_10px_28px_rgba(38,64,39,0.12)] focus:outline-none focus:ring-2 focus:ring-[#264027]/40 md:flex-row md:gap-4 md:p-4",
        className
      )}
    >
      {/* Mobile: bigger image + title/description beside it. Desktop: image column. */}
      <div className="flex gap-3 md:w-[44%] md:shrink-0 md:flex-col">
        <div className="relative aspect-square w-[48%] shrink-0 overflow-hidden rounded-xl bg-stone-50 sm:w-[46%] md:aspect-auto md:h-auto md:min-h-[260px] md:w-full md:flex-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goToDetail();
            }}
            aria-label={`View ${product.name} details`}
            className="group/photo absolute inset-0 h-full w-full"
          >
            {heroImage && (
              <OptimizedImage
                src={heroImage}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-contain bg-white p-1 scale-[1.15] transition-transform duration-300 group-hover/photo:scale-[1.22] md:scale-[1.2] md:group-hover/photo:scale-[1.28]"
                priority={priority}
                width={520}
                q={66}
              />
            )}
          </button>

          <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-[#264027] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white shadow-lg ring-2 ring-white/80 sm:left-2 sm:top-2 sm:px-3 sm:py-1.5 sm:text-[11px] md:text-xs">
            <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" strokeWidth={2.5} />
            <span className="sm:hidden">Pay</span>
            <span className="hidden sm:inline">Pickup Options</span>
          </div>

          {textureImage && (
            <div className="absolute bottom-2 left-2 hidden h-[72px] w-[72px] overflow-hidden rounded-xl border-2 border-white bg-white shadow-md ring-1 ring-stone-300/60 sm:block sm:h-[84px] sm:w-[84px] md:block">
              <OptimizedImage
                src={textureImage}
                alt={`${product.name} texture`}
                className="h-full w-full scale-125 object-cover"
                width={120}
                q={60}
              />
            </div>
          )}
        </div>

        {/* Mobile only: name + short description preview beside the image */}
        <div className="flex min-w-0 flex-1 flex-col justify-center md:hidden">
          {identity}
          {descriptionPreview}
        </div>
      </div>

      {/* Content column — description only shown here on desktop */}
      <div className="flex min-w-0 flex-1 flex-col md:pt-1">
        <div className="hidden md:block">
          {identity}
          {descriptionPreview}
        </div>

        {cardContent && cardContent.includes.length > 0 && (
          <div className="mt-0.5 md:mt-3">
            <PayPickupProductFacts
              includes={cardContent.includes}
              benefits={cardContent.benefits}
              variant="card"
              className="[&_ul]:hidden [&_ul]:md:block"
            />
          </div>
        )}

        <div className="mt-2 space-y-1 text-sm md:mt-3">
          {startingPrice && (
            <p className="text-sm font-semibold leading-snug text-[#264027]">
              Starts at {startingPrice}{" "}
              {getPayPickupProductContent(product.id)?.startingPriceContext ?? ""}
            </p>
          )}
          {sizeCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Available sizes">
              {sizeCategories.map((size) => (
                <span
                  key={size}
                  className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-stone-600 md:px-2 md:text-[10px]"
                >
                  {size}
                </span>
              ))}
            </div>
          )}
        </div>

        <Button
          aria-label={`Choose a size for ${product.name}`}
          onClick={(event) => {
            event.stopPropagation();
            goToBuy();
          }}
          className={cn(
            "mt-3 h-11 min-h-11 w-full rounded-lg text-sm font-bold text-white md:mt-auto",
            buyButtonVariant === "minimal"
              ? "bg-stone-900 hover:bg-stone-800"
              : "bg-[#264027] hover:bg-[#1f3320]",
          )}
        >
          <ShoppingBag className="mr-1.5 h-4 w-4" />
          Choose Size
        </Button>
      </div>
    </div>
  );
}

export default PayPickupCard;
