import { Link } from "wouter";
import {
  PROMO_BUNDLES,
  promoBundleCartItem,
  type PromoBundle,
} from "@shared/promoBundles.js";
import { cn } from "@/lib/utils";
import { BUNDLE_PRODUCT_DETAILS, getBundleDetails } from "@/data/bundleDetails";
import { useQuoteCart, type CartItem } from "@/contexts/QuoteCartContext";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { trackEvent } from "@/lib/analytics";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { ArrowRight, Pause, Play } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export const fmtDealPrice = (value: number) => `$${value.toFixed(0)}`;

export function useAddDeal() {
  const { addItem, openDrawer } = useQuoteCart();
  const { toast } = useToast();

  return (offer: PromoBundle) => {
    addItem(promoBundleCartItem(offer) as CartItem);
    trackEvent("Garden Bundle Added", {
      bundle: offer.slug,
      value: offer.salePrice,
      source: "deals-hub",
    });
    toast({
      title: "Added to your order",
      description: `${offer.title} · ${fmtDealPrice(offer.salePrice)} Phoenix pickup.`,
      duration: 4500,
      action: (
        <ToastAction
          altText="View order"
          onClick={() => openDrawer()}
          className="border-[#183a23]/25 bg-[#183a23] text-white hover:bg-[#0d2917] hover:text-white"
        >
          View order
        </ToastAction>
      ),
    });
    openDrawer();
  };
}

type DealRowContentProps = {
  deal: PromoBundle;
  showCaption?: boolean;
};

export function DealRowContent({
  deal,
  showCaption = false,
}: DealRowContentProps) {
  return (
    <>
      <span className="flex w-full items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-foreground">
          {deal.shortTitle}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {fmtDealPrice(deal.salePrice)}
        </span>
      </span>
      {showCaption ? (
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {deal.listCaption}
        </span>
      ) : null}
    </>
  );
}

type DealRowProps = {
  deal: PromoBundle;
  showCaption?: boolean;
  className?: string;
  onClick?: () => void;
};

export function DealRow({
  deal,
  showCaption = false,
  className,
  onClick,
}: DealRowProps) {
  return (
    <Link href={`/offers/${deal.slug}`}>
      <div
        onClick={onClick}
        className={cn(
          "flex min-h-11 w-full cursor-pointer flex-col justify-center rounded-lg px-3 py-2.5 text-left transition-colors duration-200 hover:bg-primary/5 hover:text-primary active:bg-primary/10",
          className,
        )}
      >
        <DealRowContent deal={deal} showCaption={showCaption} />
      </div>
    </Link>
  );
}

type DealListProps = {
  showCaption?: boolean;
  onNavigate?: () => void;
  className?: string;
};

export default function DealList({
  showCaption = false,
  onNavigate,
  className,
}: DealListProps) {
  return (
    <ul className={cn("space-y-0.5", className)}>
      {PROMO_BUNDLES.map((deal) => (
        <li key={deal.slug}>
          <DealRow deal={deal} showCaption={showCaption} onClick={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

export function DealHubCards({
  source = "deals-hub",
  layout = "stack",
}: {
  source?: string;
  layout?: "stack" | "carousel";
}) {
  const imageKeys = {
    plantpal: "plantpal",
    simons: "simons-gold",
    mikeys: "mikeys-worm-poop",
    mulch: "natures-blanket-premium",
  };
  const cards = PROMO_BUNDLES.map((deal) => {
    const products = (getBundleDetails(deal.slug)?.products || []).map(
      (key) => BUNDLE_PRODUCT_DETAILS[key],
    );
    const primary =
      products.find((product) => product.productKey === "plantpal") ||
      products[0];
    return (
      <Link key={deal.slug} href={`/offers/${deal.slug}`}>
        <a
          aria-label={`${deal.title}, ${deal.bagLabel}, ${fmtDealPrice(deal.salePrice)} plus tax. Shop offer.`}
          onClick={() =>
            trackEvent(
              source === "homepage-bundles"
                ? "Homepage Bundle CTA Clicked"
                : "Deal Banner Clicked",
              {
                bundle: deal.slug,
                source,
              },
            )
          }
          className="group grid h-full overflow-hidden rounded-2xl border border-[#d8d9c9] bg-[#fffdf7] text-[#264027] shadow-[0_8px_24px_rgba(24,58,35,0.06)] transition hover:border-[#a4af96] hover:shadow-[0_12px_28px_rgba(24,58,35,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a44f35] focus-visible:ring-offset-4 sm:grid-cols-[0.85fr_1.15fr]"
        >
          <div className="min-w-0 bg-[#ecebdc]">
            {primary ? (
              <div className="relative">
                <img
                  src={`/images/bundles/${imageKeys[primary.productKey]}-texture-640.webp`}
                  alt={primary.textureAlt}
                  width={640}
                  height={480}
                  loading="lazy"
                  decoding="async"
                  className="block h-20 w-full object-cover sm:h-28"
                />
                <span className="absolute left-3 top-3 rounded-full bg-[#fffdf7] px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#264027]">
                  {deal.bagLabel} · Phoenix pickup
                </span>
              </div>
            ) : null}
            <div className="flex items-end justify-center gap-1 px-3 pb-3 pt-2 sm:gap-2 sm:px-4 sm:pb-4 sm:pt-3">
              {products.map((product) => (
                <figure
                  key={product.productKey}
                  className="min-w-0 flex-1 text-center"
                >
                  <img
                    src={`/images/bundles/${imageKeys[product.productKey]}-bag-320.webp`}
                    alt={product.bagAlt}
                    width={320}
                    height={product.productKey === "mulch" ? 430 : 320}
                    loading="lazy"
                    decoding="async"
                    className="mx-auto h-[70px] w-full object-contain sm:h-[100px]"
                  />
                  <figcaption className="mt-1.5 text-[8px] font-semibold leading-snug text-[#53614f] sm:text-[9px]">
                    {product.name}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#73805f]">
              <span>Ready for your garden</span>
              <span className="rounded-full bg-[#f0dfc7] px-2.5 py-1 text-[#8d492f] normal-case tracking-normal">
                Save {fmtDealPrice(deal.savings)}
              </span>
            </div>
            <h3 className="mt-3 font-heading text-2xl font-bold leading-tight tracking-[-0.035em] text-[#264027]">
              {deal.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#5d695c]">
              {deal.includedLabel}
            </p>
            <div className="mt-4 flex items-baseline gap-2">
              <strong className="text-[32px] font-bold leading-none tracking-[-0.04em]">
                {fmtDealPrice(deal.salePrice)}
              </strong>
              <span className="text-[11px] text-[#5d695c]">
                + tax · Bundle value <s>{fmtDealPrice(deal.listPrice)}</s>
              </span>
            </div>
            <span className="mt-4 inline-flex min-h-11 items-center justify-between gap-3 rounded-lg bg-[#264027] px-4 py-2.5 text-sm font-bold text-white group-hover:bg-[#17331f]">
              Shop offer <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </a>
      </Link>
    );
  });

  if (layout === "carousel") {
    return <DealHubCarousel cards={cards} />;
  }

  return <div className="space-y-3 sm:space-y-4">{cards}</div>;
}

function DealHubCarousel({ cards }: { cards: ReactNode[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [manualPause, setManualPause] = useState(false);
  const [temporaryPause, setTemporaryPause] = useState(false);

  useEffect(() => {
    if (!api || manualPause || temporaryPause) return;
    const timer = window.setInterval(() => api.scrollNext(), 6500);
    return () => window.clearInterval(timer);
  }, [api, manualPause, temporaryPause]);

  return (
    <div
      onMouseEnter={() => setTemporaryPause(true)}
      onMouseLeave={() => setTemporaryPause(false)}
      onFocusCapture={() => setTemporaryPause(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setTemporaryPause(false);
      }}
    >
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: true, duration: 35 }}
        className="w-full"
        aria-label="Fall garden bundle offers"
      >
        <CarouselContent className="-ml-3 sm:-ml-4">
          {cards.map((card, index) => (
            <CarouselItem
              key={PROMO_BUNDLES[index].slug}
              className="basis-[91%] pl-3 sm:basis-[78%] sm:pl-4 lg:basis-[62%]"
            >
              {card}
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label={
              manualPause
                ? "Resume automatic carousel movement"
                : "Pause automatic carousel movement"
            }
            aria-pressed={manualPause}
            onClick={() => setManualPause((current) => !current)}
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-[#183a23]/20 bg-white px-3 text-[#183a23] shadow-sm transition hover:bg-[#f3f5f1]"
          >
            {manualPause ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>
          <CarouselPrevious className="static h-11 w-11 translate-y-0 border-[#183a23]/20 bg-white text-[#183a23]" />
          <CarouselNext className="static h-11 w-11 translate-y-0 border-[#183a23]/20 bg-white text-[#183a23]" />
        </div>
      </Carousel>
    </div>
  );
}

export { PROMO_BUNDLES };
