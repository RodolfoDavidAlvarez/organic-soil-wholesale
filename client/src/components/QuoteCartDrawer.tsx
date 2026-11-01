import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuoteCart, type CartItem } from "@/contexts/QuoteCartContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/OptimizedImage";
import { FlatbedLoadMeter } from "@/components/FlatbedLoadMeter";
import { OrderCallbackDialog } from "@/components/OrderCallbackDialog";
import {
  cartFlatbedSpots,
  FLATBED_CAPACITY,
  fullLoadDiscountAmount,
  isWalkingFloorDeliveryFormat,
  spotsForFormat,
} from "@/lib/flatbedSpots";
import { trackEvent } from "@/lib/analytics";
import { promoBundleHref, getPromoBundleByProductId } from "@shared/promoBundles.js";
import {
  CART_LOAD_GROUP_HINTS,
  CART_LOAD_GROUP_LABELS,
  partitionPayCartItems,
} from "@shared/cartLoadGroups.js";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Trash2, Minus, Plus, ArrowRight, Package,
  CreditCard, FileText, Phone,
} from "lucide-react";
import type { ReactNode } from "react";

const fmt = (n: number): string => {
  if (n >= 1000) return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  return `$${n.toFixed(2)}`;
};

const CART_IMAGE_FALLBACKS: Record<number, string> = {
  1000: "/images/optimized/simons-gold-bag-context.jpg",
  1001: "/images/optimized/mikeys-worm-poop-bag-context.jpg",
  111: "/images/bundles/plantpal-15cf-illustration-640.webp",
  3000: "/images/optimized/natures-blanket-bag-studio.jpg",
  4100: "/images/offers/flyers/garden-refresh.webp",
  4101: "/images/offers/flyers/garden-refresh-plus.webp",
  4102: "/images/offers/flyers/big-garden-setup.webp",
};

const WALKING_FLOOR_IMAGE = "/images/size-formats/walking-floor-delivery.webp";
const FLATBED_IMAGE = "/images/optimized/mixed-truckload-example.jpg";

function isWalkingFloorFormat(format: string) {
  return isWalkingFloorDeliveryFormat(format);
}

function LineItem({ item, removeItem, updateQuantity, closeDrawer }: {
  item: CartItem;
  removeItem: (id: number, fmt: string) => void;
  updateQuantity: (id: number, fmt: string, q: number) => void;
  closeDrawer: () => void;
}) {
  const imageUrl = item.imageUrl || CART_IMAGE_FALLBACKS[item.productId];
  const lineSpots = spotsForFormat(item.format, item.quantity);
  const offer = getPromoBundleByProductId(item.productId);
  const sizeThumb =
    item.sizeImage ||
    (isWalkingFloorFormat(item.format) ? WALKING_FLOOR_IMAGE : undefined);

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex items-stretch gap-2">
        <div className="flex shrink-0 gap-1">
          {imageUrl ? (
            <div className="relative h-[4.25rem] w-[4.25rem] overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200">
              <OptimizedImage
                src={imageUrl}
                alt={item.productName}
                className="h-full w-full object-contain bg-white p-0.5"
                width={120}
                q={60}
              />
            </div>
          ) : (
            <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-lg bg-stone-100 text-stone-400">
              <Package className="h-6 w-6" />
            </div>
          )}
          {sizeThumb ? (
            <div className="relative h-[4.25rem] w-[3.25rem] overflow-hidden rounded-lg bg-[#eef4eb] ring-1 ring-[#264027]/20">
              <OptimizedImage
                src={sizeThumb}
                alt={item.format}
                className="h-full w-full object-cover"
                width={100}
                q={65}
              />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <Link
                href={promoBundleHref(item.productId) || `/products/${item.productSlug}`}
                onClick={closeDrawer}
                className="text-sm font-semibold leading-tight text-stone-900 hover:text-[#264027]"
              >
                {item.productName}
              </Link>
              <p className="mt-0.5 text-[13px] font-bold leading-snug text-[#264027]">
                {item.format}
                {lineSpots > 0 ? (
                  <span className="ml-1.5 font-semibold text-stone-500">
                    · +{lineSpots} spot{lineSpots === 1 ? "" : "s"}
                  </span>
                ) : null}
              </p>
              {offer?.includedLabel ? (
                <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
                  {offer.includedLabel}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.productId, item.format)}
              className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.format, item.quantity - 1)}
                disabled={item.quantity <= 1}
                className="h-7 w-7 rounded-md text-stone-700 hover:bg-stone-100 disabled:opacity-40"
              >
                <Minus className="mx-auto h-3 w-3" />
              </button>
              <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.format, item.quantity + 1)}
                className="h-7 w-7 rounded-md text-stone-700 hover:bg-stone-100"
              >
                <Plus className="mx-auto h-3 w-3" />
              </button>
            </div>
            <div className="text-right">
              {item.listUnitPrice && item.listUnitPrice > item.unitPrice ? (
                <p className="text-[11px] text-stone-400 line-through">{fmt(item.listUnitPrice * item.quantity)}</p>
              ) : null}
              <p className="text-sm font-bold text-[#264027]">{fmt(item.unitPrice * item.quantity)}</p>
              {item.discountPercent ? <p className="text-[10px] font-bold text-green-700">{item.discountPercent}% off · save {fmt((item.savingsPerUnit || 0) * item.quantity)}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadSection({
  title,
  hint,
  image,
  children,
  accent = "green",
  headerExtra,
}: {
  title: string;
  hint: string;
  image: string;
  children: ReactNode;
  accent?: "green" | "camel";
  headerExtra?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white",
        accent === "camel" ? "border-[#b38a58]/35" : "border-stone-200",
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-stone-100 px-2.5 py-2">
        <div className="h-12 w-[4.25rem] shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
          <OptimizedImage src={image} alt="" className="h-full w-full object-cover" width={140} q={65} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">{title}</p>
          <p className="text-[11px] leading-snug text-stone-500">{hint}</p>
        </div>
      </div>
      {headerExtra ? <div className="border-b border-stone-100 px-2.5 py-2">{headerExtra}</div> : null}
      <div className="space-y-2 p-2">{children}</div>
    </div>
  );
}

export const QuoteCartDrawer = () => {
  const { items, removeItem, updateQuantity, clearCart, totalItems, isDrawerOpen, closeDrawer } = useQuoteCart();
  const [, navigate] = useLocation();
  const [callbackOpen, setCallbackOpen] = useState(false);

  const payItems = useMemo(() => items.filter((i) => i.mode === "pay"), [items]);
  const quoteItems = useMemo(() => items.filter((i) => i.mode !== "pay"), [items]);
  const payGross = useMemo(() => payItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [payItems]);
  const flatbedSpots = useMemo(() => cartFlatbedSpots(items), [items]);
  const flatbedDiscount = useMemo(() => fullLoadDiscountAmount(payItems), [payItems]);
  const payTotal = payGross - flatbedDiscount;
  const quoteTotal = useMemo(() => quoteItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [quoteItems]);
  const { offerItems, walkingFloorItems, flatbedItems, yardItems } = useMemo(
    () => partitionPayCartItems(payItems),
    [payItems],
  );

  const hasDeliveryTrucks = flatbedItems.length > 0 && walkingFloorItems.length > 0;
  const hasMixedLoads =
    (offerItems.length > 0 ? 1 : 0) +
      (walkingFloorItems.length > 0 ? 1 : 0) +
      (flatbedItems.length > 0 ? 1 : 0) +
      (yardItems.length > 0 ? 1 : 0) >
    1;

  const goToCheckout = () => {
    trackEvent("Cart Checkout Clicked", {
      pay_items: payItems.length,
      quote_items: quoteItems.length,
      pay_total: payTotal,
    });
    closeDrawer();
    navigate("/checkout");
  };

  const goToQuote = () => {
    trackEvent("Cart Quote Clicked", {
      pay_items: payItems.length,
      quote_items: quoteItems.length,
      quote_total: quoteTotal,
    });
    closeDrawer();
    navigate(`/order${window.location.search}`);
  };

  const openCallback = () => {
    trackEvent("Cart Callback Clicked", {
      item_count: items.length,
      flatbed_spots: flatbedSpots,
    });
    setCallbackOpen(true);
  };

  const renderLines = (list: CartItem[]) =>
    list.map((item) => (
      <LineItem
        key={`${item.productId}-${item.format}`}
        item={item}
        removeItem={removeItem}
        updateQuantity={updateQuantity}
        closeDrawer={closeDrawer}
      />
    ));

  return (
    <>
      <Sheet open={isDrawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent side="right" className="w-[min(100vw,390px)] sm:w-[460px] flex flex-col bg-stone-50 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <SheetHeader className="pb-3 border-b border-stone-200">
            <SheetTitle className="flex items-center gap-2.5 text-stone-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#264027] text-white">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div className="flex flex-col items-start">
                <span className="text-base font-bold leading-none">
                  {hasMixedLoads
                    ? "Your order"
                    : flatbedSpots > 0
                      ? "Your flatbed load"
                      : walkingFloorItems.length > 0
                        ? "Your delivery"
                        : "Your order"}
                </span>
                <span className="mt-1 text-xs font-medium text-stone-500">
                  {totalItems} {totalItems === 1 ? "item" : "items"}
                  {flatbedSpots > 0 ? ` · flatbed ${flatbedSpots}/${FLATBED_CAPACITY}` : ""}
                  {walkingFloorItems.length > 0
                    ? ` · ${walkingFloorItems.length} walking-floor`
                    : ""}
                </span>
              </div>
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <Package className="mb-4 h-16 w-16 text-stone-300" />
              <p className="font-semibold text-stone-900">Your order is empty</p>
              <p className="mt-1 text-sm text-stone-500">Browse products and add items to build your order.</p>
              <Button asChild className="mt-6" onClick={closeDrawer}>
                <Link href="/products">Browse Products</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {offerItems.length > 0 && (
                  <LoadSection
                    title={CART_LOAD_GROUP_LABELS.offers}
                    hint={CART_LOAD_GROUP_HINTS.offers}
                    image={
                      offerItems[0]?.imageUrl ||
                      CART_IMAGE_FALLBACKS[offerItems[0].productId] ||
                      FLATBED_IMAGE
                    }
                  >
                    {renderLines(offerItems)}
                  </LoadSection>
                )}

                {/* Flatbed next — mixable load, meter, 10% off. Number trucks only when both exist. */}
                {flatbedItems.length > 0 && (
                  <LoadSection
                    title={
                      hasDeliveryTrucks
                        ? "Truck 1 · Flatbed"
                        : "Flatbed load"
                    }
                    hint="Mix pallets & totes · pickup needs a scheduled heads-up"
                    image={FLATBED_IMAGE}
                    headerExtra={<FlatbedLoadMeter spots={flatbedSpots} meterOnly />}
                  >
                    {renderLines(flatbedItems)}
                  </LoadSection>
                )}

                {walkingFloorItems.length > 0 && (
                  <LoadSection
                    title={
                      hasDeliveryTrucks
                        ? "Truck 2 · Walking floor"
                        : "Walking-floor delivery"
                    }
                    hint="24-ton bulk dump · always delivered"
                    image={WALKING_FLOOR_IMAGE}
                    accent="camel"
                  >
                    {renderLines(walkingFloorItems)}
                  </LoadSection>
                )}

                {yardItems.length > 0 && (
                  <LoadSection
                    title={CART_LOAD_GROUP_LABELS.bags}
                    hint={CART_LOAD_GROUP_HINTS.bags}
                    image={
                      yardItems[0]?.imageUrl ||
                      CART_IMAGE_FALLBACKS[yardItems[0].productId] ||
                      FLATBED_IMAGE
                    }
                  >
                    {renderLines(yardItems)}
                  </LoadSection>
                )}

                {quoteItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7a5a2e]">
                      <FileText className="h-3.5 w-3.5" />
                      Request a quote
                      <span className="text-stone-400">·</span>
                      <span className="text-stone-500">{quoteItems.length} item{quoteItems.length !== 1 && "s"}</span>
                    </div>
                    {renderLines(quoteItems)}
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-stone-200 pt-3">
                {payItems.length > 0 && (
                  <>
                    {flatbedDiscount > 0 && (
                      <div className="flex items-center justify-between text-sm text-emerald-800">
                        <span className="font-medium">Full flatbed (10% off)</span>
                        <span className="font-semibold">−{fmt(flatbedDiscount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-stone-600">Pay today</span>
                      <span className="text-xl font-bold text-[#264027]">{fmt(payTotal)}</span>
                    </div>
                    <Button
                      size="lg"
                      onClick={goToCheckout}
                      className="h-14 w-full rounded-xl bg-[#264027] text-base font-bold shadow-lg shadow-[#264027]/20 hover:bg-[#1f3320]"
                    >
                      <CreditCard className="mr-2 h-5 w-5" />
                      Continue to Checkout
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <p className="text-center text-[11px] leading-relaxed text-stone-500">
                      {walkingFloorItems.length > 0 &&
                      flatbedItems.length === 0 &&
                      yardItems.length === 0 &&
                      offerItems.length === 0
                        ? "Next: delivery ZIP, street, and pay."
                        : walkingFloorItems.length > 0
                          ? "Walking-floor is delivery. Flatbed pickup needs a scheduled heads-up."
                          : flatbedItems.length > 0
                            ? "Pickup needs a scheduled heads-up for pallets & totes. Bags can be ASAP."
                            : "Continue to choose pickup or delivery, then pay."}
                    </p>
                  </>
                )}

                {quoteItems.length > 0 && (
                  <>
                    {payItems.length > 0 && <div className="my-3 border-t border-stone-200" />}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-stone-600">Quote estimate</span>
                      <span className="text-lg font-bold text-stone-700">{fmt(quoteTotal)}</span>
                    </div>
                    <Button
                      size="lg"
                      onClick={goToQuote}
                      className="h-12 w-full rounded-xl bg-stone-700 hover:bg-stone-800"
                    >
                      Submit quote request <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </>
                )}

                <button
                  type="button"
                  onClick={openCallback}
                  className="mx-auto flex items-center gap-1.5 text-xs font-medium text-stone-500 transition hover:text-[#264027]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Not sure? Call me
                </button>

                <div className="pt-1">
                  <Button variant="ghost" size="sm" className="w-full text-stone-500 hover:text-red-600" onClick={clearCart}>
                    Clear all
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <OrderCallbackDialog open={callbackOpen} onOpenChange={setCallbackOpen} />
    </>
  );
};
