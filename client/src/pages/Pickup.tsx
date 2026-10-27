import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  PackageCheck,
  Phone,
  ShoppingBag,
  Truck,
} from "lucide-react";
import SEO from "@/components/layout/SEO";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
  PHOENIX_YARD_ADDRESS,
  PHOENIX_YARD_DIRECTIONS_URL,
} from "@/config/contact";
import { absoluteUrl, buildLocalBusinessSchema, buildProductsItemListSchema } from "@/config/seo";
import { getPayPickupProductContent, getPayPickupProductType } from "@/data/payPickupProductContent";
import { cn } from "@/lib/utils";
import { HOURS_LABEL } from "@shared/pickupSchedule.js";

const PICKUP_PRODUCTS = [
  {
    id: 1000,
    anchor: "compost",
    intent: "Compost",
    searchIntent: "compost near me",
    image: "/images/optimized/simons-gold-bag-context.jpg",
  },
  {
    id: 134,
    anchor: "mulch",
    intent: "Mulch",
    searchIntent: "mulch pickup phoenix",
    image: "/images/optimized/natures-blanket-bag-context.jpg",
  },
  {
    id: 3000,
    anchor: "premium-mulch",
    intent: "Premium mulch",
    searchIntent: "premium mulch pickup phoenix",
    image: "/images/optimized/natures-blanket-bag-studio.jpg",
  },
  {
    id: 1034,
    anchor: "sabrina-kills-bugs",
    intent: "Insecticide",
    searchIntent: "organic insecticide spray phoenix",
    image: "/images/products/sabrina-kills-bugs.png",
  },
] as const;

type ApiProduct = {
  id: number;
  name: string;
  slug?: string | null;
  productType?: string | null;
  product_type?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  sizePriceOptions?: ApiSize[];
  size_price_options?: ApiSize[];
};

type ApiSize = {
  key?: string;
  label?: string;
  price?: number;
  priceCents?: number;
  msrp?: string | null;
  isActive?: boolean;
};

type PickupProduct = {
  id: number;
  name: string;
  slug: string;
  productType: string;
  image: string;
  sizes: ApiSize[];
  anchor: string;
  intent: string;
  searchIntent: string;
};

const parseMoney = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatPrice = (value: number) => `$${value.toFixed(2)}`;

const displayPriceFor = (size: ApiSize) => {
  const msrp = parseMoney(size.msrp);
  const cents = typeof size.priceCents === "number" ? size.priceCents / 100 : undefined;
  const price = msrp ?? (typeof size.price === "number" ? size.price : cents);
  return typeof price === "number" ? formatPrice(price) : null;
};

const getStartingPrice = (product: PickupProduct) => {
  const firstPickupSize = product.sizes.find((size) => {
    const key = size.key ?? size.label ?? "";
    return !key.toLowerCase().includes("pallet");
  });
  return firstPickupSize ? displayPriceFor(firstPickupSize) : null;
};

const normalizeProducts = (records: ApiProduct[]): PickupProduct[] => {
  return PICKUP_PRODUCTS.map<PickupProduct | null>((slot) => {
    const record = records.find((product) => product.id === slot.id);
    if (!record) return null;
    const sizes = (record.sizePriceOptions ?? record.size_price_options ?? []).filter(
      (size) => size.isActive !== false
    );
    return {
      id: record.id,
      name: record.name,
      slug: record.slug ?? String(record.id),
      productType: getPayPickupProductType(
        record.id,
        record.productType ?? record.product_type ?? record.name,
      ),
      image: slot.image,
      sizes,
      anchor: slot.anchor,
      intent: slot.intent,
      searchIntent: slot.searchIntent,
    };
  }).filter((product): product is PickupProduct => Boolean(product));
};

const fetchPickupProducts = async (): Promise<ApiProduct[]> => {
  const ids = PICKUP_PRODUCTS.map((product) => product.id).join(",");
  const response = await fetch(`/api/public/products?ids=${ids}`);
  if (!response.ok) throw new Error("Failed to load pickup products");
  const body = await response.json();
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.products)) return body.products;
  return [];
};

function PickupProductCard({ product, priority }: { product: PickupProduct; priority?: boolean }) {
  const content = getPayPickupProductContent(product.id);
  const startsAt = getStartingPrice(product);
  const productUrl = `/products/${product.slug}`;
  const quoteParams = new URLSearchParams({
    productId: String(product.id),
    product: product.name,
  });

  return (
    <article
      id={product.anchor}
      className="scroll-mt-28 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm"
    >
      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        <Link href={`${productUrl}#buy`} className="block bg-stone-50">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden md:h-full md:min-h-[310px]">
            <OptimizedImage
              src={product.image}
              alt={product.name}
              className="h-full w-full object-contain p-4"
              width={520}
              q={70}
              priority={priority}
            />
            <span className="absolute left-3 top-3 rounded-full bg-[#264027] px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
              {product.intent}
            </span>
          </div>
        </Link>

        <div className="flex min-w-0 flex-col p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a5a2e]">
                {product.searchIntent}
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold leading-tight text-stone-950">
                {product.productType}
              </h2>
              <p className="mt-1 text-sm font-semibold text-stone-600">{product.name}</p>
            </div>
            {startsAt && (
              <div className="shrink-0 rounded-lg border border-[#264027]/20 bg-[#f2f7f1] px-4 py-3 text-left sm:text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#264027]">
                  Starts at
                </p>
                <p className="text-2xl font-black text-[#264027]">{startsAt}</p>
              </div>
            )}
          </div>

          {content?.description && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-600">
              {content.description}
            </p>
          )}

          {content?.sizeSummaries?.length ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                Pickup size options
              </p>
              <div className="flex flex-wrap gap-2">
                {content.sizeSummaries.map((size) => (
                  <span
                    key={size}
                    className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700"
                  >
                    {size}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {content?.includes?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {content.includes.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#264027]/8 px-3 py-1 text-xs font-bold text-[#264027]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Button asChild className="h-11 rounded-lg bg-[#264027] text-base font-black hover:bg-[#1f3320]">
              <Link href={`${productUrl}#buy`}>
                <ShoppingBag className="h-4 w-4" />
                Pay &amp; Pick Up
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-lg font-bold">
              <Link href={`/order?${quoteParams.toString()}`}>
                <Truck className="h-4 w-4" />
                Get Bulk Quote
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-lg font-bold">
              <a href={CUSTOMER_SUPPORT_PHONE_TEL}>
                <Phone className="h-4 w-4" />
                Call Yard
              </a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ProductList() {
  const { data, isLoading, error } = useQuery<ApiProduct[]>({
    queryKey: ["pickupLandingProducts"],
    queryFn: fetchPickupProducts,
    staleTime: 60 * 1000,
  });

  const products = useMemo(() => normalizeProducts(data ?? []), [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading pickup products...
      </div>
    );
  }

  if (error || products.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
        <p className="font-bold">Pickup products did not load.</p>
        <p className="mt-1 text-sm">
          Call {CUSTOMER_SUPPORT_PHONE_DISPLAY} and we can help you order.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {products.map((product, index) => (
        <PickupProductCard key={product.id} product={product} priority={index === 0} />
      ))}
    </div>
  );
}

export default function Pickup() {
  return (
    <>
      <SEO
        title="Organic Soil Pickup in Arizona"
        description="Buy Simon's Gold dairy compost and Nature's Blanket mulch online. Phoenix yard pickup for what the yard can load now, plus Congress plant pickup."
        keywords="organic soil pickup phoenix, compost near me, mulch pickup phoenix, dairy compost pickup, natures blanket pickup"
        canonical={absoluteUrl("/pickup")}
        structuredData={[buildLocalBusinessSchema(), buildProductsItemListSchema()]}
      />

      <section className="bg-stone-50">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-[#264027] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                <PackageCheck className="h-4 w-4" />
                Organic Soil Pickup in Arizona
              </p>
              <h1 className="mt-4 max-w-4xl font-heading text-4xl font-black leading-[1.05] text-stone-950 md:text-6xl">
                Buy organic compost and mulch online. Phoenix yard loads Simon’s Gold and Nature’s Blanket.
              </h1>
              <p className="mt-4 max-w-2xl text-lg font-medium leading-relaxed text-stone-700">
                Pay online. Phoenix yard pickup for Simon’s Gold and Nature’s Blanket. Congress handles other bulk by scale ({HOURS_LABEL}). Bags, pallets, and super sacks still check out — we will not advertise cubic-yard pickup the Phoenix yard cannot load.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="h-12 rounded-lg bg-[#264027] px-6 text-base font-black hover:bg-[#1f3320]">
                  <a href="#products">
                    Choose Size
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-lg px-6 text-base font-bold">
                  <a href={CUSTOMER_SUPPORT_PHONE_TEL}>
                    <Phone className="h-4 w-4" />
                    Call Yard
                  </a>
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex gap-3">
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-[#264027]" />
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-stone-500">
                    Pickup location
                  </p>
                  <p className="mt-1 text-lg font-black text-stone-950">{PHOENIX_YARD_ADDRESS}</p>
                  <a
                    href={PHOENIX_YARD_DIRECTIONS_URL}
                    className="mt-2 inline-flex text-sm font-bold text-[#264027] underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get directions
                  </a>
                </div>
              </div>
              <div className="mt-5 grid gap-2 text-sm font-semibold text-stone-700">
                {[
                  "Order online before arriving",
                  "Phoenix: bags of PlantPal Plus, castings, compost & mulch",
                  "Loose bulk: Simon's Gold & Nature's Blanket",
                ].map((line) => (
                  <div key={line} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#264027]" />
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PICKUP_PRODUCTS.map((product) => (
              <a
                key={product.anchor}
                href={`#${product.anchor}`}
                className={cn(
                  "rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-black text-stone-800 shadow-sm transition hover:border-[#264027] hover:text-[#264027]"
                )}
              >
                {product.intent}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="products" className="bg-white py-8 md:py-10">
        <div className="container mx-auto px-4">
          <div className="mb-5 max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7a5a2e]">
              3 Phoenix yard products right now
            </p>
            <h2 className="mt-2 font-heading text-3xl font-black leading-tight text-stone-950">
              Pick the product, choose the size, pay online.
            </h2>
          </div>
          <ProductList />
        </div>
      </section>
    </>
  );
}
