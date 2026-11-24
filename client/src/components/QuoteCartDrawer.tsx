import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuoteCart, type CartItem } from "@/contexts/QuoteCartContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/OptimizedImage";
import { OrderCallbackDialog } from "@/components/OrderCallbackDialog";
import {
  cartFlatbedSpots,
  fullLoadDiscountAmount,
} from "@/lib/flatbedSpots";
import { trackEvent } from "@/lib/analytics";
import { BundleCartLine } from "@/components/BundleCartLine";
import { promoBundleHref, getPromoBundleByProductId } from "@shared/promoBundles.js";
import { getPayPickupProductDescription } from "@/data/payPickupProductContent";
import { baggedVolumeHint, baggedVolumeQuote, baggedVolumeSavingsLabel } from "@shared/baggedVolumeDiscount.js";
import { BLACK_FRIDAY_PROMO, blackFridayQuote } from "@shared/blackFridayPromo.js";
import { partitionPayCartItems } from "@shared/cartLoadGroups.js";
import { cn } from "@/lib/utils";
import { useInventoryStock } from "@/hooks/useInventoryStock";
import { lineStockNote } from "@/components/StockUrgency";
import type { StockMap } from "@shared/inventoryStock.js";
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

function isPalletFormat(format: string) {
  const key = format.toLowerCase();
  return key.includes("pallet") && !key.includes("truckload");
}

function LineItem({ item, removeItem, updateQuantity, closeDrawer, showPrice, saleUnitCents, stockMap }: {
  showPrice: boolean;
  /** Black Friday unit price in cents when the sale is the order's discount. */
  saleUnitCents?: number;
  stockMap?: StockMap | null;
  item: CartItem;
  removeItem: (id: number, fmt: string) => void;
  updateQuantity: (id: number, fmt: string, q: number) => void;
  closeDrawer: () => void;
}) {
  const imageUrl = item.imageUrl || CART_IMAGE_FALLBACKS[item.productId];
  const offer = getPromoBundleByProductId(item.productId);
  const palletThumb = isPalletFormat(item.format) ? item.sizeImage : undefined;
  const preview = getPayPickupProductDescription(item.productId, "");
  const onSale = Number.isFinite(saleUnitCents);
  const lineTotal = onSale ? ((saleUnitCents as number) * item.quantity) / 100 : item.unitPrice * item.quantity;
  const regularUnit = item.listUnitPrice && item.listUnitPrice > item.unitPrice ? item.listUnitPrice : item.unitPrice;
  const listTotal = onSale
    ? regularUnit * item.quantity
    : item.listUnitPrice && item.listUnitPrice > item.unitPrice
      ? item.listUnitPrice * item.quantity
      : null;

  if (offer) return (
    <div className="rounded-2xl bg-white p-4">
      <BundleCartLine bundle={offer} quantity={item.quantity} priceLabel={showPrice ? fmt(lineTotal) : undefined}
        onOpen={closeDrawer} onQuantity={(quantity) => updateQuantity(item.productId, item.format, quantity)}
        onRemove={() => removeItem(item.productId, item.format)} />
    </div>
  );

  return (
    <article className="rounded-2xl bg-white p-4">
      <Link
        href={promoBundleHref(item.productId) || `/products/${item.productSlug}`}
        onClick={closeDrawer}
        className="block rounded-xl focus-visible:ring-2"
      >
        <div className="relative">
          {imageUrl ? (
            <OptimizedImage
              src={imageUrl}
              alt={item.productName}
              width={640}
              q={75}
              className="h-40 w-full rounded-xl bg-white object-contain"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-xl bg-stone-50 text-stone-300">
              <Package className="h-10 w-10" />
            </div>
          )}
          {palletThumb ? (
            <div className="absolute bottom-2 right-2 h-16 w-16 overflow-hidden rounded-lg bg-white shadow-md ring-2 ring-white">
              <OptimizedImage src={palletThumb} alt="" className="h-full w-full object-cover" width={128} q={70} />
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold leading-tight tracking-tight text-stone-950">{item.productName}</h3>
          <span className="text-sm font-semibold tabular-nums">{fmt(lineTotal)}</span>
        </div>
      </Link>
      <p className="mt-1 text-sm text-stone-600">{item.format}</p>
      {lineStockNote(stockMap, item) ? (
        <p data-testid="cart-stock-note" className="mt-0.5 text-xs font-semibold text-stone-500">{lineStockNote(stockMap, item)}</p>
      ) : null}
      {onSale && listTotal ? (
        <p className="mt-1 text-sm text-stone-600">
          <span className="mr-2 line-through">{fmt(listTotal)}</span>
          <span className="font-semibold text-emerald-800">Black Friday · {BLACK_FRIDAY_PROMO.percent}% off · save {fmt(listTotal - lineTotal)}</span>
        </p>
      ) : listTotal || item.discountPercent ? (
        <p className="mt-1 text-sm text-stone-600">
          {listTotal ? <span className="mr-2 line-through">{fmt(listTotal)}</span> : null}
          {item.discountPercent ? <span>{item.discountPercent}% off · save {fmt((item.savingsPerUnit || 0) * item.quantity)}</span> : null}
        </p>
      ) : null}
      {preview ? (
        <p className="mt-2 flex min-w-0 items-baseline gap-2 text-sm text-stone-600">
          <span className="truncate">{preview}</span>
          <Link href={promoBundleHref(item.productId) || `/products/${item.productSlug}`} onClick={closeDrawer} className="shrink-0 font-semibold text-[#264027] underline underline-offset-2">See more</Link>
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-full border border-stone-200">
          <button type="button" aria-label={`Decrease quantity of ${item.productName}`} disabled={item.quantity <= 1} onClick={() => updateQuantity(item.productId, item.format, item.quantity - 1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-stone-50 disabled:opacity-35">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-5 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
          <button type="button" aria-label={`Increase quantity of ${item.productName}`} onClick={() => updateQuantity(item.productId, item.format, item.quantity + 1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-stone-50">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button type="button" aria-label={`Remove ${item.productName}`} onClick={() => removeItem(item.productId, item.format)} className="grid h-11 w-11 place-items-center rounded-full text-stone-500 hover:bg-red-50 hover:text-red-700">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
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
  const baggedVolume = useMemo(() => baggedVolumeQuote(payItems), [payItems]);
  // Black Friday 2026: one discount only, same choice the server makes.
  const blackFriday = useMemo(() => blackFridayQuote({
    items: payItems,
    existingOffCents: Math.round(flatbedDiscount * 100) + baggedVolume.amountCents,
  }), [payItems, flatbedDiscount, baggedVolume.amountCents]);
  const saleUnitByKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!blackFriday.applies) return map;
    for (const entry of blackFriday.priced) {
      if (entry.eligible) map.set(`${entry.item.productId}:${entry.item.format}`, entry.unitCents);
    }
    return map;
  }, [blackFriday]);
  const payTotal = blackFriday.applies ? blackFriday.saleCents / 100 : payGross - flatbedDiscount - baggedVolume.amount;
  const bagSavingsLabel = baggedVolumeSavingsLabel(baggedVolume.percent);
  const bagProgressHint = blackFriday.applies ? null : baggedVolumeHint(baggedVolume, fmt);
  const quoteQuantity = quoteItems.reduce((count, item) => count + item.quantity, 0);
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

  const { data: stockMap } = useInventoryStock(items.map((item) => item.productId));
  const renderLines = (list: CartItem[]) =>
    list.map((item) => (
      <LineItem
        key={`${item.productId}-${item.format}`}
        item={item}
        showPrice={items.length > 1}
        removeItem={removeItem}
        updateQuantity={updateQuantity}
        closeDrawer={closeDrawer}
        saleUnitCents={saleUnitByKey.get(`${item.productId}:${item.format}`)}
        stockMap={stockMap}
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
                  {walkingFloorItems.length > 0 && !hasMixedLoads ? "Your delivery" : "Your order"}
                </span>
                <span className="mt-1 text-xs font-medium text-stone-500">
                  {totalItems} {totalItems === 1 ? "item" : "items"}
                  {walkingFloorItems.length > 0 ? ` · ${walkingFloorItems.length} walking-floor` : ""}
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
                {renderLines(offerItems)}
                {renderLines(yardItems)}
                {renderLines(flatbedItems)}

                {walkingFloorItems.length > 0 && (
                  <LoadSection
                    title={hasDeliveryTrucks ? "Truck 2 · Walking floor" : "Walking-floor delivery"}
                    hint="24-ton bulk dump · always delivered"
                    image={WALKING_FLOOR_IMAGE}
                    accent="camel"
                  >
                    {renderLines(walkingFloorItems)}
                  </LoadSection>
                )}

                {quoteItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7a5a2e]">
                      <FileText className="h-3.5 w-3.5" />
                      Request a quote
                      <span className="text-stone-400">·</span>
                      <span className="text-stone-500">{quoteQuantity} {quoteQuantity === 1 ? "item" : "items"}</span>
                    </div>
                    {renderLines(quoteItems)}
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-stone-200 pt-3">
                {payItems.length > 0 && (
                  <>
                    {blackFriday.applies && blackFriday.saleSavingsCents > 0 && (
                      <div className="flex items-center justify-between text-sm text-emerald-800">
                        <span className="font-semibold">Black Friday savings ({BLACK_FRIDAY_PROMO.percent}% off {BLACK_FRIDAY_PROMO.scopeLabel})</span>
                        <span className="font-semibold">{fmt(blackFriday.saleSavingsCents / 100)}</span>
                      </div>
                    )}
                    {!blackFriday.applies && flatbedDiscount > 0 && (
                      <div className="flex items-center justify-between text-sm text-emerald-800">
                        <span className="font-medium">Full flatbed (10% off)</span>
                        <span className="font-semibold">−{fmt(flatbedDiscount)}</span>
                      </div>
                    )}
                    {!blackFriday.applies && baggedVolume.amountCents > 0 && bagSavingsLabel && (
                      <div className="flex items-center justify-between text-sm text-emerald-800">
                        <span className="font-medium">{bagSavingsLabel}</span>
                        <span className="font-semibold">−{fmt(baggedVolume.amount)}</span>
                      </div>
                    )}
                    {bagProgressHint ? (
                      <p className="text-center text-xs text-stone-500">{bagProgressHint}</p>
                    ) : null}
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
