import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PayPickupCard, type PayPickupProduct } from "@/components/PayPickupCard";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY } from "@/config/contact";
import { getPayPickupProductType } from "@/data/payPickupProductContent";
import { PHOENIX_YARD_PICKUP_GRID_IDS, shouldHidePhoenixYardBulkSize } from "@shared/phoenixYardPickup.js";

/** Phoenix yard loadable SKUs only — see shared/phoenixYardPickup.js. */
const MAIN_PRODUCT_IDS = PHOENIX_YARD_PICKUP_GRID_IDS;

/** Graphic 3 / bag-in-context heroes — bag with soil & produce, white background. */
const HERO_OVERRIDES: Record<number, string> = {
  111: "/images/bundles/plantpal-15cf-illustration-640.webp",
  1001: "/images/optimized/mikeys-worm-poop-bag-context.jpg",
  1000: "/images/optimized/simons-gold-bag-context.jpg",
  134: "/images/optimized/natures-blanket-bag-context.jpg",
  3000: "/images/optimized/natures-blanket-bag-studio.jpg",
  1034: "/images/products/sabrina-kills-bugs.png",
};

/** Bestfor collage backdrops — fills the photo area behind the bag. */
const BACKDROP_OVERRIDES: Record<number, string> = {
  111: "/images/optimized/plantpal-bestfor.jpg",
  1001: "/images/optimized/mikeys-worm-poop-bestfor.jpg",
  1000: "/images/optimized/simons-gold-bestfor.jpg",
  134: "/images/optimized/natures-blanket-bestfor.jpg",
  3000: "/images/optimized/natures-blanket-premium-bestfor.jpg",
};

type ApiProduct = {
  id: number;
  name: string;
  slug?: string | null;
  productType?: string | null;
  product_type?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  texturePhotoUrl?: string | null;
  texture_photo_url?: string | null;
  sizePriceOptions?: Array<{
    key: string;
    label: string;
    price: number;
    priceCents: number;
    unit?: string;
    msrp?: string;
    isActive?: boolean;
  }>;
  size_price_options?: ApiProduct["sizePriceOptions"];
};

const fetchPublicProducts = async (): Promise<ApiProduct[]> => {
  const res = await fetch(`/api/public/products?ids=${MAIN_PRODUCT_IDS.join(",")}`);
  if (!res.ok) throw new Error("Failed to load products");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.products)) return body.products;
  return [];
};

function normalize(record: ApiProduct): PayPickupProduct | null {
  const sizes = (record.sizePriceOptions ?? record.size_price_options ?? []).filter(
    (s) => s.isActive !== false && !shouldHidePhoenixYardBulkSize(record.id, s.key ?? s.label ?? ""),
  );
  if (sizes.length === 0) return null;
  return {
    id: record.id,
    name: record.name,
    slug: record.slug ?? undefined,
    productType: getPayPickupProductType(
      record.id,
      (record.productType ?? record.product_type ?? record.name) as string,
    ),
    imageUrl: record.imageUrl ?? record.image_url ?? undefined,
    texturePhotoUrl: record.texturePhotoUrl ?? record.texture_photo_url ?? undefined,
    sizes: sizes.map((s) => ({
      key: s.key,
      label: s.label,
      price: s.price,
      priceCents: s.priceCents,
      unit: s.unit,
      msrp: s.msrp,
    })),
  };
}

interface PayPickupGridProps {
  className?: string;
}

export function PayPickupGrid({ className }: PayPickupGridProps) {
  const { data, isLoading, error } = useQuery<ApiProduct[]>({
    queryKey: ["publicProducts", MAIN_PRODUCT_IDS.join(",")],
    queryFn: fetchPublicProducts,
    staleTime: 60 * 1000,
  });

  const products = useMemo(() => {
    if (!data) return [];
    // Preserve the order from MAIN_PRODUCT_IDS
    return MAIN_PRODUCT_IDS.map((id) => {
      const found = data.find((p) => p.id === id);
      return found ? normalize(found) : null;
    }).filter((p): p is PayPickupProduct => p !== null);
  }, [data]);

  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex h-48 items-center justify-center text-stone-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading products…
        </div>
      </div>
    );
  }

  if (error || products.length === 0) {
    return (
      <div className={className}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
          <p className="font-semibold">Couldn&apos;t load pay-and-pickup products.</p>
          <p className="mt-1 text-sm">Try refreshing, or call {CUSTOMER_SUPPORT_PHONE_DISPLAY} to order by phone.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {products.map((p, index) => (
          <PayPickupCard
            key={p.id}
            product={p}
            heroImageOverride={HERO_OVERRIDES[p.id]}
            backdropImageOverride={BACKDROP_OVERRIDES[p.id]}
            priority={index === 0}
          />
        ))}
      </div>
    </div>
  );
}

export default PayPickupGrid;
