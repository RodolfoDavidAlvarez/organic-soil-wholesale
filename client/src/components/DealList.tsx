import { Link } from "wouter";
import {
  PROMO_BUNDLES,
  promoBundleCartItem,
  type PromoBundle,
} from "@shared/promoBundles.js";
import { cn } from "@/lib/utils";
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
import { bundleComparison, bundleGroupImages, comparisonPrice } from "@/data/bundlePresentation";
import { getBundleDetails } from "@/data/bundleDetails";
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
  const cards = PROMO_BUNDLES.map((deal) => (
    <Link key={deal.slug} href={`/offers/${deal.slug}`} onClick={() => trackEvent(source === "homepage-bundles" ? "Homepage Bundle CTA Clicked" : "Deal Banner Clicked", { bundle: deal.slug, source })}>
      <a
        aria-label={`${deal.title}, ${deal.bagLabel}, ${fmtDealPrice(deal.salePrice)} plus tax. View bundle.`}
        className="group grid h-full overflow-hidden rounded-2xl bg-[#fffdf7] text-[#264027] shadow-[0_8px_24px_rgba(21,59,34,0.1)] ring-1 ring-[#183a23]/10 transition hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(21,59,34,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a44f35] focus-visible:ring-offset-4 sm:grid-cols-[1.1fr_1fr]"
      >
        <div className="relative aspect-[2/1] overflow-hidden bg-[#dedede] sm:aspect-auto sm:min-h-[230px]">
          <img src={bundleGroupImages[deal.slug]} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain sm:absolute sm:inset-0" />
          {deal.slug !== "big-garden-setup" && <span className="absolute left-3 top-3 rounded-full bg-[#264027] px-3 py-1.5 text-xs font-bold text-white">{deal.slug === "garden-refresh" ? "3 dairy compost bags free" : "3 mulch bags free"}</span>}
        </div>
        <div className="flex flex-col items-start p-5 sm:p-6">
          <span className="text-xs font-bold uppercase tracking-wider text-[#74836a]">{deal.bagLabel} · Phoenix pickup</span>
          <h3 className="mt-2 font-heading text-2xl font-semibold tracking-tight">{deal.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#626b5d]">{getBundleDetails(deal.slug)?.summary}</p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <s className="text-sm font-semibold text-[#778271]">{comparisonPrice(bundleComparison[deal.slug])}</s>
            <strong className="text-3xl font-bold tracking-tight">{fmtDealPrice(deal.salePrice)}</strong>
            <span className="text-xs text-[#626b5d]">+ tax</span>
          </div>
          <span className="mt-2 rounded-full bg-[#f2d29b] px-3 py-1 text-xs font-bold text-[#264027]">Save {comparisonPrice(bundleComparison[deal.slug] - deal.salePrice)}</span>
          <span className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold">Explore bundle <ArrowRight size={17} aria-hidden="true" /></span>
        </div>
      </a>
    </Link>
  ));

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
    if (!api || manualPause || temporaryPause || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
