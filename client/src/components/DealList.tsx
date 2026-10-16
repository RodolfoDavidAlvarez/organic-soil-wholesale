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
import { Pause, Play } from "lucide-react";
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
    <Link key={deal.slug} href={`/offers/${deal.slug}`}>
      <a
        aria-label={`${deal.title}, ${deal.bagLabel}, ${fmtDealPrice(deal.salePrice)} plus tax. Shop offer.`}
        onClick={() =>
          trackEvent(source === "homepage-bundles" ? "Homepage Bundle CTA Clicked" : "Deal Banner Clicked", {
            bundle: deal.slug,
            source,
          })
        }
        className="relative block overflow-hidden rounded-[1.25rem] bg-[#153b22] shadow-[0_12px_28px_rgba(21,59,34,0.14)] ring-1 ring-[#183a23]/10 transition hover:shadow-[0_18px_40px_rgba(21,59,34,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a44f35] focus-visible:ring-offset-4"
      >
        <img
          src={deal.bannerImage}
          alt={`${deal.title}: ${deal.bagLabel}, ${deal.volumeLabel}, ${fmtDealPrice(deal.salePrice)} plus tax.`}
          width={1600}
          height={646}
          loading="lazy"
          decoding="async"
          className="pointer-events-none block h-auto w-full"
        />
        {deal.slug === "big-garden-setup" && (
          <span className="absolute left-[5.3%] top-[65%] flex h-[6.8%] w-[11.1%] items-center justify-center bg-[#142315] text-center text-[clamp(5px,0.85vw,12px)] font-bold leading-none tracking-wider text-[#efce79]">
            58 CU FT TOTAL
          </span>
        )}
        <span className="absolute right-[5.2%] top-[57.4%] z-10 inline-flex h-[11.4%] min-h-8 min-w-[5rem] items-center justify-center rounded-full bg-[#f3ad2c] px-3 text-[clamp(0.5rem,1.55vw,1.05rem)] font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_6px_16px_rgba(0,0,0,0.22)] sm:min-h-11 sm:min-w-[9.75rem] sm:px-5">
          Shop offer <span aria-hidden="true" className="ml-1.5 text-[1.05em] leading-none">›</span>
        </span>
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
