import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuoteCart } from "@/contexts/QuoteCartContext";
import SEO from "@/components/layout/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OptimizedImage } from "@/components/OptimizedImage";
import { PickupReadyTime, type PickupReadySelection } from "@/components/PickupReadyTime";
import { DeliveryQuoteWidget, type TruckingQuote } from "@/components/DeliveryQuoteWidget";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { FlatbedLoadMeter } from "@/components/FlatbedLoadMeter";
import { loadDeliveryDraft, saveDeliveryDraft } from "@/lib/deliveryDraft";
import { currentDeliveryQuote, deliveryQuoteKey } from "@shared/deliveryQuoteBinding.js";
import {
  cartFlatbedSpots,
  fullLoadDiscountAmount,
  isWalkingFloorDeliveryFormat,
  requiresPickupHeadsUp,
} from "@/lib/flatbedSpots";
import { cn } from "@/lib/utils";
import { cartItemToEcommerceItem, trackEcommerceEvent, trackEvent } from "@/lib/analytics";
import { getCheckoutMonitorId, recordCheckoutMonitorEvent } from "@/lib/checkoutMonitor";
import { computeAsapPickup, validatePickupIso, HOURS_LABEL, PICKUP_LOCATIONS, PHOENIX_BULK_MAX_TONS, TONS_PER_CU_YD } from "@shared/pickupSchedule.js";
import { BundleCartLine } from "@/components/BundleCartLine";
import { getPromoBundleByProductId } from "@shared/promoBundles.js";
import { isSchoolDiscountCode, resolveDiscountCode, schoolLineCaption } from "@shared/checkoutDiscount.js";
import {
  cartAllowsPhoenixYardPickup,
  PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE,
} from "@shared/phoenixYardPickup.js";
import {
  partitionPayCartItems,
} from "@shared/cartLoadGroups.js";
import {
  ArrowLeft, CreditCard, Loader2, ShoppingBag, Tag, CheckCircle2, X, Package,
  User as UserIcon, MapPin, Truck, ArrowRight, Navigation, Clock,
  Minus, Plus, Trash2,
} from "lucide-react";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const CART_IMAGE_FALLBACKS: Record<number, string> = {
  1000: "/images/optimized/simons-gold-bag-context.jpg",
  1001: "/images/optimized/mikeys-worm-poop-bag-context.jpg",
  111: "/images/bundles/plantpal-15cf-illustration-640.webp",
  3000: "/images/optimized/natures-blanket-bag-studio.jpg",
  4100: "/images/offers/flyers/garden-refresh.webp",
  4101: "/images/offers/flyers/garden-refresh-plus.webp",
  4102: "/images/offers/flyers/big-garden-setup.webp",
};
type Fulfillment = "pickup" | "delivery";
type CheckoutStep = "fulfillment" | "timing" | "customer" | "review";
type PickupSiteId = (typeof PICKUP_LOCATIONS)[number]["id"];

const DELIVERY_WINDOWS = [
  "Morning (8 AM - 12 PM)",
  "Afternoon (12 PM - 4 PM)",
  "Anytime during business hours",
  "Call to coordinate",
];

type AvailabilityPreset = "1-3" | "this-week" | "next-week" | "custom";

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addBusinessDays(start: Date, count: number) {
  const d = new Date(start);
  let left = count;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return d;
}

function endOfWeek(from: Date) {
  const d = new Date(from);
  const day = d.getDay(); // 0 Sun
  const add = day === 0 ? 5 : day === 6 ? 6 : 5 - day;
  d.setDate(d.getDate() + add);
  return d;
}

function nextWeekRange(from: Date) {
  const start = new Date(from);
  const day = start.getDay();
  const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  start.setDate(start.getDate() + daysUntilMon);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  return { from: start, to: end };
}

function rangeForPreset(preset: AvailabilityPreset): { from: string; to: string } {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (preset === "1-3") {
    return { from: toYmd(addBusinessDays(today, 1)), to: toYmd(addBusinessDays(today, 3)) };
  }
  if (preset === "this-week") {
    return { from: toYmd(addBusinessDays(today, 1)), to: toYmd(endOfWeek(today)) };
  }
  if (preset === "next-week") {
    const { from, to } = nextWeekRange(today);
    return { from: toYmd(from), to: toYmd(to) };
  }
  return { from: toYmd(addBusinessDays(today, 1)), to: toYmd(addBusinessDays(today, 3)) };
}

const Checkout: React.FC = () => {
  const [, navigate] = useLocation();
  const { items, removeItem, updateQuantity, clearCart } = useQuoteCart();

  const payItems = useMemo(() => items.filter((i) => i.mode === "pay"), [items]);
  const payQuantity = payItems.reduce((count, item) => count + item.quantity, 0);
  const payGroups = useMemo(() => partitionPayCartItems(payItems), [payItems]);
  const groupedPayItems = useMemo(
    () => (payGroups.offerItems.length > 0 ? [...payGroups.offerItems, ...payGroups.otherItems] : payItems),
    [payGroups, payItems],
  );
  const monitorSessionId = useMemo(() => getCheckoutMonitorId(), []);
  const checkoutEntryTracked = useRef(false);
  /** Only loose walking-floor truckloads force delivery — never flatbed pallets/totes. */
  const hasWalkingFloorDelivery = useMemo(
    () => payItems.some((item) => isWalkingFloorDeliveryFormat(item.format)),
    [payItems],
  );
  const walkingFloorLines = useMemo(
    () => payItems.filter((item) => isWalkingFloorDeliveryFormat(item.format)),
    [payItems],
  );
  const flatbedSpots = useMemo(() => cartFlatbedSpots(payItems), [payItems]);
  const fullFlatbedDiscount = useMemo(() => fullLoadDiscountAmount(payItems), [payItems]);
  const hasFlatbedSpots = flatbedSpots > 0;
  // Loose-bulk tonnage in the cart — cu yd items estimated at 50 lb/cf.
  const bulkPickupTons = useMemo(
    () =>
      payItems.reduce((sum, item) => {
        const format = item.format.toLowerCase();
        if (!format.includes("bulk")) return sum;
        if (isWalkingFloorDeliveryFormat(item.format)) return sum;
        return sum + (format.includes("ton") ? item.quantity : item.quantity * TONS_PER_CU_YD);
      }, 0),
    [payItems]
  );
  const hasBulkItem = bulkPickupTons > 0;
  const pickupNeedsHeadsUp = useMemo(() => requiresPickupHeadsUp(payItems), [payItems]);
  const phoenixPickupBlocked = useMemo(
    () => !cartAllowsPhoenixYardPickup(payItems),
    [payItems],
  );

  // One boot read: honor PDP Pick up / Deliver seed; walking-floor alone forces delivery.
  const [checkoutBoot] = useState(() => {
    const walkingFloorInCart = items.some(
      (item) => item.mode === "pay" && isWalkingFloorDeliveryFormat(item.format),
    );
    let pref: Fulfillment | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("osw-preferred-fulfillment");
        if (raw === "pickup" || raw === "delivery") {
          sessionStorage.removeItem("osw-preferred-fulfillment");
          pref = raw;
        }
      } catch {
        // ignore
      }
    }

    // Walking-floor in cart cannot be picked up — delivery for the whole order.
    // If they asked for pickup, land on fulfillment with a clear conflict (not silent).
    if (walkingFloorInCart) {
      const draft = typeof window !== "undefined" ? loadDeliveryDraft() : null;
      if (pref === "pickup") {
        return {
          fulfillment: "delivery" as Fulfillment,
          seeded: true,
          step: "fulfillment" as CheckoutStep,
          pickupBlockedByWalkingFloor: true,
        };
      }
      return {
        fulfillment: "delivery" as Fulfillment,
        seeded: pref === "delivery" || !pref,
        step: (draft?.zip && draft?.quote ? "timing" : "fulfillment") as CheckoutStep,
        pickupBlockedByWalkingFloor: false,
      };
    }

    if (pref) {
      return {
        fulfillment: pref,
        seeded: true,
        step: "timing" as CheckoutStep,
        pickupBlockedByWalkingFloor: false,
      };
    }

    return {
      fulfillment: "pickup" as Fulfillment,
      seeded: false,
      step: "fulfillment" as CheckoutStep,
      pickupBlockedByWalkingFloor: false,
    };
  });

  const [fulfillment, setFulfillment] = useState<Fulfillment>(checkoutBoot.fulfillment);
  const [fulfillmentSeeded] = useState(checkoutBoot.seeded);
  const [pickupSiteId, setPickupSiteId] = useState<PickupSiteId>(
    phoenixPickupBlocked ? "congress" : "phoenix",
  );
  const selectedPickupSite = useMemo(
    () => PICKUP_LOCATIONS.find((loc) => loc.id === pickupSiteId) ?? PICKUP_LOCATIONS[0],
    [pickupSiteId],
  );
  const isPhoenixBulkPickup = hasBulkItem && selectedPickupSite.id === "phoenix";
  const phoenixBulkOverLimit = hasBulkItem && selectedPickupSite.id === "phoenix" && bulkPickupTons > PHOENIX_BULK_MAX_TONS;

  // Pickup ASAP: bags + Congress bulk. Pallet/tote → schedule. Phoenix bulk → appointment.
  const pickupAllowAsap = isPhoenixBulkPickup
    ? selectedPickupSite.bulkAllowAsap !== false
    : hasBulkItem
      ? selectedPickupSite.bulkAllowAsap !== false
      : pickupNeedsHeadsUp
        ? false
        : selectedPickupSite.allowAsap !== false;
  const pickupMinLeadDays = isPhoenixBulkPickup
    ? selectedPickupSite.bulkMinLeadDays ?? 7
    : selectedPickupSite.minLeadDays ?? 0;
  const pickupScheduleHelpText = isPhoenixBulkPickup
    ? "Phoenix bulk pickup needs loader coordination. Pick a slot at least 1 week out."
    : !hasBulkItem && pickupNeedsHeadsUp
      ? "Pallet or more — pick a slot so we can stage your load."
      : undefined;

  // Pickup state (ASAP ready time — auto-computed)
  const [pickupReady, setPickupReady] = useState<PickupReadySelection | null>(null);

  // Delivery state — seed ZIP / quote from product-page estimate when present
  const [deliveryAddress, setDeliveryAddress] = useState(() => {
    const draft = typeof window !== "undefined" ? loadDeliveryDraft() : null;
    return {
      street: "",
      city: draft?.city ?? "",
      state: draft?.state || "AZ",
      zip: draft?.zip ?? "",
    };
  });
  // Saved drafts have no load identity. Re-price them before showing a payable total.
  const [boundDeliveryQuote, setBoundDeliveryQuote] = useState<{ key: string; quote: TruckingQuote } | null>(null);
  const [availabilityPreset, setAvailabilityPreset] = useState<AvailabilityPreset>("1-3");
  const [deliveryFrom, setDeliveryFrom] = useState(() => rangeForPreset("1-3").from);
  const [deliveryTo, setDeliveryTo] = useState(() => rangeForPreset("1-3").to);
  const [deliveryWindow, setDeliveryWindow] = useState("Anytime during business hours");
  /** When a product-page quote exists, show a compact summary instead of re-quoting. */
  const [editingDeliveryQuote, setEditingDeliveryQuote] = useState(false);
  const [roughAccess, setRoughAccess] = useState(() =>
    typeof window !== "undefined" ? Boolean(loadDeliveryDraft()?.roughAccess) : false,
  );
  // Default true: assume the customer has semi-truck access. They opt out
  // explicitly if they don't, which triggers an ops notification.
  const [semiAccess, setSemiAccess] = useState(() => {
    if (typeof window === "undefined") return true;
    const draft = loadDeliveryDraft();
    return draft ? draft.semiAccess !== false : true;
  });

  // Customer
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [customerCategory, setCustomerCategory] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [activeStep, setActiveStep] = useState<CheckoutStep>(checkoutBoot.step);
  const [devModeLabel, setDevModeLabel] = useState<string | null>(null);

  const quoteItems = useMemo(
    () => payItems.map((i) => ({ sizeOption: i.format, quantity: i.quantity, unit: i.unit, productName: i.productName })),
    [payItems],
  );
  const quoteCartKey = deliveryQuoteKey({ items: quoteItems });
  const quoteRequestKey = deliveryQuoteKey({ items: quoteItems, zip: deliveryAddress.zip, roughAccess, semiAccess });
  const latestQuoteRequest = useRef({ cart: quoteCartKey, request: quoteRequestKey });
  latestQuoteRequest.current = { cart: quoteCartKey, request: quoteRequestKey };
  // Derive validity during render: no one-frame window where an old price can be paid.
  const deliveryQuote: TruckingQuote | null = currentDeliveryQuote(boundDeliveryQuote, quoteRequestKey);

  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.developerMode && data?.label) setDevModeLabel(data.label);
      })
      .catch(() => {});
  }, []);

  // Discount
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    percent: number;
    kind: "test" | "school";
    discountCents?: number;
    contactEmail?: string;
    notices?: string[];
  } | null>(null);
  const [schoolEmail, setSchoolEmail] = useState("");
  const [discountChecking, setDiscountChecking] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasWalkingFloorDelivery && fulfillment !== "delivery") {
      setFulfillment("delivery");
      return;
    }
    // After removing walking-floor (e.g. they wanted pickup), restore pickup.
    if (
      !hasWalkingFloorDelivery &&
      fulfillment === "delivery" &&
      checkoutBoot.pickupBlockedByWalkingFloor
    ) {
      setFulfillment("pickup");
    }
  }, [checkoutBoot.pickupBlockedByWalkingFloor, fulfillment, hasWalkingFloorDelivery]);

  useEffect(() => {
    if (phoenixPickupBlocked && pickupSiteId === "phoenix") {
      setPickupSiteId("congress");
      setPickupReady(null);
    }
  }, [phoenixPickupBlocked, pickupSiteId]);

  // Keep city/state congruent with the delivery ZIP (fixes stale city from drafts/cache).
  useEffect(() => {
    const zip = deliveryAddress.zip;
    if (!/^\d{5}$/.test(zip)) return;

    let cancelled = false;
    fetch(`/api/address/zip/${zip}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((place) => {
        if (cancelled || !place?.city) return;
        setDeliveryAddress((prev) => {
          if (prev.zip !== zip) return prev;
          // Don't overwrite a city confirmed via street autocomplete.
          if (prev.street.trim() && prev.city.trim()) return prev;
          if (prev.city === place.city && prev.state === (place.state || prev.state)) return prev;
          return {
            ...prev,
            city: place.city,
            state: place.state || prev.state || "AZ",
          };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deliveryAddress.zip]);

  // Walking-floor + saved ZIP → jump to address — but not when pickup was blocked (show conflict first).
  useEffect(() => {
    if (!hasWalkingFloorDelivery || activeStep !== "fulfillment") return;
    if (checkoutBoot.pickupBlockedByWalkingFloor) return;
    const draft = loadDeliveryDraft();
    if (draft?.zip && draft?.quote) {
      setActiveStep("timing");
      if (draft.city || draft.state) {
        setDeliveryAddress((prev) => ({
          ...prev,
          zip: draft.zip || prev.zip,
          city: draft.city || prev.city,
          state: draft.state || prev.state || "AZ",
        }));
      }
      setRoughAccess(Boolean(draft.roughAccess));
      setSemiAccess(draft.semiAccess !== false);
    }
  }, [
    activeStep,
    checkoutBoot.pickupBlockedByWalkingFloor,
    deliveryQuote,
    hasWalkingFloorDelivery,
  ]);

  // A changed load/ZIP/access needs a newly reviewed delivery price, not the old total.
  useEffect(() => {
    if (!boundDeliveryQuote || deliveryQuote) return;
    setBoundDeliveryQuote(null);
    setEditingDeliveryQuote(true);
    saveDeliveryDraft({ ...deliveryAddress, roughAccess, semiAccess, quote: null });
    if (fulfillment === "delivery") {
      setActiveStep("timing");
      setError("Your order or delivery details changed. Get an updated delivery price before continuing.");
    }
  }, [boundDeliveryQuote, quoteRequestKey, deliveryQuote, fulfillment]);

  // Re-price a carried-over PDP quote for the complete checkout load, once on entry.
  useEffect(() => {
    if (fulfillment !== "delivery" || !loadDeliveryDraft()?.quote) return;
    const zip = deliveryAddress.zip;
    if (!/^\d{5}$/.test(zip) || quoteItems.length === 0) return;
    let cancelled = false;
    fetch("/api/quote/trucking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: quoteItems, zip, roughAccess }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => {
        if (cancelled || latestQuoteRequest.current.request !== quoteRequestKey || !Number.isFinite(q?.costDollars)) return;
        setBoundDeliveryQuote({ key: quoteRequestKey, quote: q });
        saveDeliveryDraft({
          zip,
          roughAccess,
          semiAccess,
          quote: q,
          city: q.breakdown?.destinationCity || deliveryAddress.city || null,
          state: q.breakdown?.destinationState || deliveryAddress.state || null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Intentionally once. Later changes require the customer to get/review a fresh price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schoolApplied = appliedDiscount?.kind === "school" && (appliedDiscount.discountCents || 0) > 0;
  const productSubtotalGross = useMemo(
    () => payItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [payItems]
  );
  const schoolOff = schoolApplied ? (appliedDiscount?.discountCents || 0) / 100 : 0;
  /** Flatbed 10% is skipped while a school code is applied. The server does the same. */
  const flatbedOff = schoolApplied ? 0 : fullFlatbedDiscount;
  const productSubtotal = productSubtotalGross - flatbedOff - schoolOff;
  const deliveryFee = fulfillment === "delivery" && deliveryQuote ? deliveryQuote.costDollars : 0;
  const subtotal = productSubtotal + deliveryFee;
  const discountAmount = appliedDiscount?.kind === "test" ? subtotal : 0;
  const total = Math.max(0, subtotal - discountAmount);

  useEffect(() => {
    if (checkoutEntryTracked.current || payItems.length === 0) return;
    checkoutEntryTracked.current = true;
    trackEcommerceEvent("begin_checkout", {
      value: total,
      items: payItems.map(cartItemToEcommerceItem),
      fulfillment,
      product_subtotal: productSubtotal,
      delivery_fee: deliveryFee,
      pickup_sales_channel: "osw_yard",
    });
  }, [payItems, fulfillment, productSubtotal, deliveryFee, total]);

  useEffect(() => {
    if (payItems.length === 0) return;
    const common = { fulfillment, itemCount: payItems.length, cartValue: total };
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "true") {
      recordCheckoutMonitorEvent("stripe_canceled", {
        ...common,
        sessionId: params.get("monitor_id") || monitorSessionId,
      });
    } else {
      recordCheckoutMonitorEvent("checkout_entered", common);
    }
  }, [monitorSessionId]);

  useEffect(() => {
    if (payItems.length === 0) return;
    if (new URLSearchParams(window.location.search).get("canceled") === "true") return;
    recordCheckoutMonitorEvent(activeStep, {
      fulfillment,
      itemCount: payItems.length,
      cartValue: total,
    });
  }, [activeStep, fulfillment]);

  const checkoutItemsPayload = () => payItems.map((item) => ({
    productId: item.productId,
    name: item.productName,
    sizeOption: item.format,
    quantity: item.quantity,
    price: item.unitPrice,
    unit: item.unit,
    imageUrl: item.imageUrl,
    listUnitPrice: item.listUnitPrice,
    savingsPerUnit: item.savingsPerUnit,
    discountPercent: item.discountPercent,
    unitsPerPallet: item.unitsPerPallet,
  }));

  const requestSchoolQuote = async (code: string, contactEmail: string) => {
    const res = await fetch("/api/checkout/school-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discountCode: code,
        contactEmail,
        items: checkoutItemsPayload(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.valid !== true || !(Number(data.discount_cents) > 0)) {
      throw new Error(data.error || "That code isn't valid");
    }
    return data as { discount_cents: number; notices?: string[] };
  };

  const applyDiscount = async () => {
    setDiscountError(null);
    const decision = resolveDiscountCode(discountInput);
    if (!decision.ok) {
      setDiscountError(decision.error);
      return;
    }
    if (decision.kind === "none" || !decision.code) {
      setDiscountError("Enter a code first");
      return;
    }
    if (decision.kind === "school") {
      const contactEmail = (schoolEmail || email).trim();
      if (!contactEmail) {
        setDiscountError("Enter the email from your school verification.");
        return;
      }
      setDiscountChecking(true);
      try {
        const quote = await requestSchoolQuote(decision.code, contactEmail);
        setSchoolEmail(contactEmail);
        setAppliedDiscount({
          code: decision.code,
          percent: decision.percent,
          kind: "school",
          discountCents: quote.discount_cents,
          contactEmail,
          notices: quote.notices || [],
        });
        setDiscountInput("");
      } catch (quoteError) {
        setDiscountError(quoteError instanceof Error ? quoteError.message : "That code isn't valid");
      } finally {
        setDiscountChecking(false);
      }
      return;
    }
    setAppliedDiscount({ code: decision.code, percent: decision.percent, kind: decision.kind });
    setDiscountInput("");
  };

  const schoolCartKey = payItems.map((item) => `${item.productId}:${item.format}:${item.quantity}:${item.unitPrice}`).join("|");
  useEffect(() => {
    if (appliedDiscount?.kind !== "school" || !appliedDiscount.contactEmail) return;
    let cancelled = false;
    requestSchoolQuote(appliedDiscount.code, appliedDiscount.contactEmail)
      .then((quote) => {
        if (cancelled) return;
        setAppliedDiscount((current) => current && current.kind === "school"
          ? { ...current, discountCents: quote.discount_cents, notices: quote.notices || [] }
          : current);
      })
      .catch((quoteError) => {
        if (cancelled) return;
        setAppliedDiscount(null);
        setDiscountError(quoteError instanceof Error ? quoteError.message : "That code isn't valid");
      });
    return () => {
      cancelled = true;
    };
  }, [schoolCartKey, appliedDiscount?.code, appliedDiscount?.contactEmail]);

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ecommerceItems = payItems.map(cartItemToEcommerceItem);
    trackEvent("Checkout Submit Attempted", {
      fulfillment,
      item_count: payItems.length,
      product_subtotal: productSubtotal,
      delivery_fee: deliveryFee,
      total,
      step: activeStep,
    });
    if (payItems.length === 0) {
      setError("Your order is empty");
      return;
    }
    if (phoenixBulkOverLimit) {
      setError(`Phoenix bulk pickup is limited to ${PHOENIX_BULK_MAX_TONS} tons. Choose Congress pickup or delivery.`);
      setActiveStep("fulfillment");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (fulfillment === "pickup" && pickupSiteId === "phoenix" && phoenixPickupBlocked) {
      setError(PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE);
      setActiveStep("fulfillment");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (fulfillment === "pickup" && !pickupReady) {
      setError("Confirm pickup ready time");
      setActiveStep("timing");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Browser background tabs can suspend the minute timer. Refresh ASAP at
    // payment time instead of sending a stale ready time that the server rejects.
    let confirmedPickup = pickupReady;
    if (fulfillment === "pickup" && pickupReady?.pickupMode === "asap") {
      const fresh = computeAsapPickup();
      if (!fresh.ok) {
        setError("Please choose another pickup time.");
        setActiveStep("timing");
        return;
      }
      confirmedPickup = { ...pickupReady, readyAt: fresh.readyAtIso, readyLabel: fresh.readyLabel, status: fresh.status };
      setPickupReady(confirmedPickup);
    }
    if (fulfillment === "pickup" && pickupReady?.pickupMode === "schedule") {
      const valid = validatePickupIso(pickupReady.readyAt);
      if (!valid.ok) {
        setPickupReady(null);
        setError("That pickup slot is no longer available. Please choose a new time.");
        setActiveStep("timing");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }
    if (fulfillment === "delivery") {
      if (!deliveryAddress.zip || !/^\d{5}$/.test(deliveryAddress.zip)) {
        setError("Enter a 5-digit delivery ZIP and get a price first");
        setActiveStep("timing");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!deliveryQuote) {
        setError("Tap 'Get price' to lock in your delivery cost");
        setActiveStep("timing");
        return;
      }
      if (!deliveryAddress.street.trim() || !deliveryAddress.city.trim()) {
        setError("Street and city are required for delivery");
        setActiveStep("timing");
        return;
      }
    }
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required");
      setActiveStep("customer");
      return;
    }
    if (!customerCategory) {
      setError("Choose the customer type that best fits you");
      setActiveStep("customer");
      return;
    }

    setSubmitting(true);
    recordCheckoutMonitorEvent("payment_requested", {
      fulfillment,
      itemCount: payItems.length,
      cartValue: total,
    });
    try {
      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: import.meta.env.VITE_DEFAULT_BRAND === "rls" ? "regenerative_landscaper_supply" : undefined,
          items: payItems.map((i) => ({
            productId: i.productId,
            name: i.productName,
            sizeOption: i.format,
            quantity: i.quantity,
            price: i.unitPrice,
            unit: i.unit,
            imageUrl: i.imageUrl,
            listUnitPrice: i.listUnitPrice,
            savingsPerUnit: i.savingsPerUnit,
            discountPercent: i.discountPercent,
            unitsPerPallet: i.unitsPerPallet,
          })),
          customerInfo: {
            name, company, customerCategory, email, phone, notes,
            marketingOptIn: true,
            schoolContactEmail: appliedDiscount?.kind === "school" ? appliedDiscount.contactEmail : null,
          },
          // Pickup-only fields
          pickupMode: fulfillment === "pickup" ? (pickupReady?.pickupMode ?? "asap") : null,
          pickupTime: fulfillment === "pickup" ? confirmedPickup?.readyAt : null,
          // Delivery-only fields
          fulfillmentType: fulfillment,
          deliveryAddress: fulfillment === "delivery"
            ? {
                street: deliveryAddress.street,
                city: deliveryAddress.city,
                state: deliveryAddress.state,
                zip: deliveryAddress.zip,
                roughAccess,
                semiAccess,
                originKey: deliveryQuote?.originYard,
                preferredDate: deliveryFrom || null,
                preferredDateEnd: deliveryTo || null,
                preferredWindow: deliveryWindow || null,
                availabilityPreset,
              }
            : null,
          // Echo for audit; server re-quotes truly
          deliveryQuote: fulfillment === "delivery" ? deliveryQuote : null,
          locationId: fulfillment === "pickup" ? selectedPickupSite.locationId : 1,
          pickupLocation: fulfillment === "pickup"
            ? `${selectedPickupSite.name} — ${selectedPickupSite.addressLine}`
            : null,
          isQuickOrder: true,
          discountCode: appliedDiscount?.code || null,
          monitorSessionId,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.repricedDelivery) {
        setBoundDeliveryQuote({ key: quoteRequestKey, quote: data.repricedDelivery });
        setError(data.error);
        setActiveStep("timing");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Checkout failed");
      trackEvent("Checkout Session Created", {
        fulfillment,
        item_count: payItems.length,
        product_subtotal: productSubtotal,
        delivery_fee: deliveryFee,
        total,
        free_order: data.free === true,
      });

      localStorage.setItem(
        "lastOrder",
        JSON.stringify({
          orderId: data.orderId,
          confirmationCode: data.confirmationCode,
          items: payItems.length,
          orderItems: ecommerceItems,
          value: total,
          productSubtotal,
          deliveryFee,
          paymentConfirmed: data.free === true,
          freeOrder: data.free === true,
          pickupTime: fulfillment === "pickup" ? confirmedPickup?.readyAt : null,
          pickupReadyLabel: fulfillment === "pickup" ? confirmedPickup?.readyLabel : null,
          pickupSiteId: fulfillment === "pickup" ? pickupSiteId : null,
          fulfillment,
          deliveryZip: fulfillment === "delivery" ? deliveryAddress.zip : null,
          deliveryDate: fulfillment === "delivery" ? deliveryFrom || null : null,
          deliveryDateEnd: fulfillment === "delivery" ? deliveryTo || null : null,
          deliveryWindow: fulfillment === "delivery" ? deliveryWindow || null : null,
        })
      );

      if (data.free === true) {
        clearCart();
        navigate(`/order-confirmation?order_id=${data.orderId}`);
        return;
      }
      if (data.url) {
        recordCheckoutMonitorEvent("stripe_redirect", {
          fulfillment,
          itemCount: payItems.length,
          cartValue: total,
          orderId: data.orderId,
          stripeSessionId: data.sessionId,
        });
        window.location.assign(data.url);
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout error");
      trackEvent("Checkout Session Failed", {
        fulfillment,
        item_count: payItems.length,
        reason: err instanceof Error ? err.message.slice(0, 80) : "Checkout error",
      });
      recordCheckoutMonitorEvent("checkout_error", {
        fulfillment,
        itemCount: payItems.length,
        cartValue: total,
        errorMessage: err instanceof Error ? err.message.slice(0, 300) : "Checkout error",
      });
      setSubmitting(false);
    }
  };

  // Delivery selected but no quote yet → gate the pay button.
  const deliveryQuoteMissing = fulfillment === "delivery" && !deliveryQuote;
  const payDisabled = submitting || deliveryQuoteMissing;

  if (payItems.length === 0) {
    return (
      <>
        <SEO title="Checkout" canonical="https://organicsoilwholesale.com/checkout" robots="noindex, nofollow" />
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="text-center py-12">
              <Package className="mx-auto mb-4 h-16 w-16 text-stone-300" />
              <h2 className="text-2xl font-bold mb-2">Nothing to check out</h2>
              <p className="text-stone-600 mb-6">
                Add products to your cart, then come back to check out.
              </p>
              <Button onClick={() => navigate("/products")} size="lg" className="min-h-[48px]">
                Browse products
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const ctaLabel = deliveryQuoteMissing
    ? "Get delivery price first"
    : total === 0
      ? "Place free order"
      : `Pay ${fmt(total)}`;

  const timingComplete = fulfillment === "pickup"
    ? Boolean(pickupReady)
    : Boolean(
        deliveryQuote &&
        deliveryAddress.zip &&
        deliveryAddress.street.trim() &&
        deliveryAddress.city.trim()
      );
  const customerComplete = Boolean(name.trim() && phone.trim() && customerCategory);

  const stepMeta: Array<{ key: CheckoutStep; label: string; complete: boolean }> = [
    {
      key: "fulfillment",
      label: fulfillment === "pickup" ? "Pickup" : "Delivery",
      complete: true,
    },
    { key: "timing", label: fulfillment === "pickup" ? "Ready" : "Address", complete: timingComplete },
    { key: "customer", label: "Details", complete: customerComplete },
    { key: "review", label: "Pay", complete: false },
  ];

  const stepIndex = stepMeta.findIndex((step) => step.key === activeStep);

  const goToTiming = () => {
    setError(null);
    setActiveStep("timing");
    trackEvent("Checkout Step Viewed", { step: "timing", fulfillment });
  };

  const goToCustomer = () => {
    setError(null);
    if (!timingComplete) {
      setError(
        fulfillment === "pickup"
          ? "Confirm pickup ready time"
          : "Finish delivery price and address first"
      );
      return;
    }
    setActiveStep("customer");
    trackEvent("Checkout Step Viewed", { step: "customer", fulfillment });
  };

  const goToReview = () => {
    setError(null);
    if (!customerComplete) {
      setError("Name, phone, and customer type are required");
      return;
    }
    setActiveStep("review");
    trackEvent("Checkout Step Viewed", { step: "review", fulfillment });
  };

  const sideCtaLabel =
    activeStep === "fulfillment" ? "Continue"
      : activeStep === "timing" ? (fulfillment === "pickup" ? "Continue with this time" : "Confirm delivery")
        : activeStep === "customer" ? "Review and pay"
          : ctaLabel;
  const sideCtaDisabled =
    activeStep === "timing" ? !timingComplete
      : activeStep === "customer" ? !customerComplete
        : activeStep === "review" ? payDisabled
          : false;
  const sideCtaAction = () => {
    if (activeStep === "fulfillment") goToTiming();
    else if (activeStep === "timing") goToCustomer();
    else if (activeStep === "customer") goToReview();
  };
  const handleStepCtaClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (activeStep !== "review") {
      event.preventDefault();
      sideCtaAction();
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/products");
  };

  return (
    <>
      <SEO title="Checkout" canonical="https://organicsoilwholesale.com/checkout" robots="noindex, nofollow" />
      <div className="min-h-screen bg-[#f7f7f4] pb-28 lg:pb-8">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="container mx-auto max-w-6xl px-3 py-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              className="h-10 min-h-[40px] rounded-full px-3 text-stone-700 touch-manipulation"
            >
              <ArrowLeft className="mr-1 h-5 w-5" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">Checkout</h1>
              <p className="hidden text-xs text-stone-500 sm:block">Confirm pickup or delivery, then pay securely.</p>
            </div>
            <div className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#264027]/10 px-3 py-1.5 text-sm font-bold text-[#264027]">
              {payQuantity} {payQuantity === 1 ? "item" : "items"}
            </div>
          </div>
        </div>
      </div>

      {devModeLabel && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-950">
          {devModeLabel}
        </div>
      )}

      <form onSubmit={onSubmit} className="container mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:gap-10">
          <div className="min-w-0 space-y-4 sm:space-y-5 lg:order-1">
            <div className="rounded-2xl border border-stone-200/80 bg-white p-1.5 shadow-sm">
              <div className="grid grid-cols-4 gap-1">
                {stepMeta.map((step, index) => {
                  const isActive = step.key === activeStep;
                  const isComplete = step.complete && !isActive;
                  const canOpen = index <= stepIndex || step.complete || step.key === "fulfillment";

                  return (
                    <button
                      key={step.key}
                      type="button"
                      disabled={!canOpen}
                      aria-current={isActive ? "step" : undefined}
                      onClick={() => {
                        if (canOpen) {
                          setActiveStep(step.key);
                          setError(null);
                          trackEvent("Checkout Step Viewed", { step: step.key, fulfillment, source: "step_nav" });
                        }
                      }}
                      className={cn(
                        "group flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold transition-all touch-manipulation",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#264027]/35 focus-visible:ring-offset-1",
                        isActive
                          ? "bg-[#264027] text-white shadow-md shadow-[#264027]/20"
                          : isComplete
                            ? "bg-[#edf5ee] text-[#264027] hover:bg-[#e2efe4]"
                            : "bg-stone-50 text-stone-400 disabled:cursor-not-allowed disabled:opacity-75"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition",
                          isActive
                            ? "bg-white/18 text-white ring-1 ring-white/20"
                            : isComplete
                              ? "bg-[#264027] text-white"
                              : "bg-white text-stone-400 ring-1 ring-stone-200"
                        )}
                      >
                        {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className="truncate">{step.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fulfillment toggle — first decision the customer makes */}
            {activeStep === "fulfillment" && <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
              <CardHeader className="px-4 pb-2 pt-4 sm:px-5">
                <CardTitle className="text-xl leading-tight sm:text-2xl">How do you want it?</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 sm:px-5">
                {hasWalkingFloorDelivery && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-snug text-amber-950">
                    <p className="font-bold">Walking-floor truckload requires delivery</p>
                    <p className="mt-1 text-xs text-amber-900/90">
                      Your order includes{" "}
                      {walkingFloorLines.map((line) => line.productName).filter(Boolean).join(", ") || "a 24-ton bulk truckload"}
                      . Remove it from your order to pick up bags or pallets, or continue with delivery for everything.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        walkingFloorLines.forEach((line) => removeItem(line.productId, line.format));
                        setError(null);
                        trackEvent("Checkout Walking Floor Removed For Pickup", {
                          removed_count: walkingFloorLines.length,
                        });
                      }}
                      className="mt-2 text-xs font-bold text-[#264027] underline-offset-2 hover:underline"
                    >
                      Remove walking-floor &amp; continue pickup
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={hasWalkingFloorDelivery}
                    onClick={() => {
                      if (!hasWalkingFloorDelivery) {
                        setFulfillment("pickup");
                        trackEvent("Checkout Fulfillment Selected", { fulfillment: "pickup", has_walking_floor: false });
                      }
                    }}
                    className={cn(
                      "flex min-h-[74px] flex-col items-start justify-center gap-1 rounded-xl border px-3 py-3 text-left transition touch-manipulation",
                      fulfillment === "pickup"
                        ? "border-[#264027] bg-[#264027]/10 text-[#264027] shadow-[inset_0_0_0_1px_#264027]"
                        : hasWalkingFloorDelivery
                          ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400 opacity-70"
                          : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"
                    )}
                  >
                    <div className="flex items-center gap-2 text-lg font-bold leading-none">
                      <MapPin className="h-4 w-4" />
                      Pickup
                    </div>
                    <span className="text-[11px] font-medium leading-tight text-stone-500">
                      {hasWalkingFloorDelivery
                        ? "Remove walking-floor to enable pickup"
                        : pickupNeedsHeadsUp
                          ? "Pallet or more · schedule a heads-up slot"
                          : "Bags · ready in about 30 minutes"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFulfillment("delivery");
                      trackEvent("Checkout Fulfillment Selected", { fulfillment: "delivery", has_truckload_item: hasWalkingFloorDelivery });
                    }}
                    className={cn(
                      "flex min-h-[74px] flex-col items-start justify-center gap-1 rounded-xl border px-3 py-3 text-left transition touch-manipulation",
                      fulfillment === "delivery"
                        ? "border-[#264027] bg-[#264027]/10 text-[#264027] shadow-[inset_0_0_0_1px_#264027]"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"
                    )}
                  >
                    <div className="flex items-center gap-2 text-lg font-bold leading-none">
                      <Truck className="h-4 w-4" />
                      Delivery
                    </div>
                    <span className="text-[11px] font-medium text-stone-500">Quoted by ZIP</span>
                  </button>
                </div>
                {fulfillment === "pickup" && !hasWalkingFloorDelivery && (
                  <div className="mt-3 space-y-2">
                    {phoenixPickupBlocked && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-snug text-amber-900">
                        {PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE}
                      </div>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Pickup location
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {PICKUP_LOCATIONS.map((loc) => {
                        const phoenixDisabled = loc.id === "phoenix" && phoenixPickupBlocked;
                        return (
                        <div
                          key={loc.id}
                          className={cn(
                            "overflow-hidden rounded-xl border transition",
                            phoenixDisabled
                              ? "border-stone-200 bg-stone-50 opacity-70"
                              : pickupSiteId === loc.id
                              ? "border-[#264027] bg-[#264027]/10 shadow-[inset_0_0_0_1px_#264027]"
                              : "border-stone-200 bg-white hover:border-stone-400",
                          )}
                        >
                          <button
                            type="button"
                            disabled={phoenixDisabled}
                            onClick={() => {
                              if (phoenixDisabled) return;
                              setPickupSiteId(loc.id);
                              setPickupReady(null);
                              trackEvent("Checkout Pickup Location Selected", {
                                pickup_site: loc.id,
                                location_id: loc.locationId,
                              });
                            }}
                            className={cn(
                              "flex min-h-[68px] w-full flex-col items-start justify-center gap-0.5 px-3 py-2.5 text-left touch-manipulation",
                              pickupSiteId === loc.id ? "text-[#264027]" : "text-stone-700",
                            )}
                          >
                            <span className="text-sm font-bold leading-tight">{loc.shortLabel}</span>
                            <span className="text-[11px] font-medium leading-snug text-stone-500">{loc.addressLine}</span>
                            {loc.pickupNote && (
                              <span
                                className={cn(
                                  "mt-0.5 text-[11px] font-bold leading-snug",
                                  pickupSiteId === loc.id ? "text-[#264027]" : "text-stone-600",
                                )}
                              >
                                {loc.pickupNote}
                              </span>
                            )}
                          </button>
                          <a
                            href={loc.directionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              trackEvent("Checkout Pickup Directions", { pickup_site: loc.id });
                            }}
                            className={cn(
                              "flex min-h-[40px] items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-semibold transition touch-manipulation",
                              pickupSiteId === loc.id
                                ? "border-[#264027]/20 bg-[#264027]/5 text-[#264027] hover:bg-[#264027]/10"
                                : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100",
                            )}
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            Directions &amp; distance
                          </a>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>}

            {/* Order summary */}
            {activeStep === "review" && <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
              <CardHeader className="border-b border-[#264027]/10 bg-[#264027]/5 px-4 py-3 sm:px-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShoppingBag className="h-4 w-4 text-[#264027]" />
                  Review your order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 sm:p-5">
                {groupedPayItems.map((item) => {
                  const bundle = getPromoBundleByProductId(item.productId);
                  if (bundle) return (
                    <BundleCartLine key={item.productId} bundle={bundle} quantity={item.quantity}
                      priceLabel={payItems.length > 1 ? fmt(item.unitPrice * item.quantity) : undefined}
                      onQuantity={(quantity) => {
                        updateQuantity(item.productId, item.format, quantity);
                        trackEvent("Checkout Item Quantity Changed", { product_id: item.productId, format: item.format, quantity });
                      }}
                      onRemove={() => {
                        removeItem(item.productId, item.format);
                        trackEvent("Checkout Item Removed", { product_id: item.productId, format: item.format });
                      }} />
                  );
                  const image = item.imageUrl || CART_IMAGE_FALLBACKS[item.productId];
                  return (
                  <div key={`${item.productId}-${item.format}`} className="rounded-xl bg-white">
                    <div className="grid grid-cols-[64px_1fr_auto] gap-3 sm:grid-cols-[72px_1fr_auto]">
                      {image ? (
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200 sm:h-[72px] sm:w-[72px]">
                          <OptimizedImage src={image} alt={item.productName} className="h-full w-full object-contain p-1" />
                          {item.sizeImage && (
                            <div className="absolute -bottom-0.5 -right-0.5 h-7 w-7 overflow-hidden rounded-md bg-white ring-2 ring-white shadow-md">
                              <OptimizedImage src={item.sizeImage} alt={item.format} className="h-full w-full object-cover" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400 sm:h-[72px] sm:w-[72px]">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-base font-bold leading-tight text-stone-950">{item.productName}</p>
                        <p className="mt-0.5 text-sm leading-tight text-stone-500">{item.format}</p>
                        <p className="mt-1 text-xs text-stone-500">{fmt(item.unitPrice)} each</p>
                        {schoolApplied && schoolLineCaption(item) ? (
                          <p className="mt-1 text-xs font-bold text-green-700">{schoolLineCaption(item)}</p>
                        ) : item.discountPercent ? <p className="mt-1 text-xs font-bold text-green-700">{item.discountPercent}% pallet savings · save {fmt((item.savingsPerUnit || 0) * item.quantity)}</p> : null}
                      </div>
                      <div className="whitespace-nowrap text-right">
                        {item.listUnitPrice && item.listUnitPrice > item.unitPrice ? <p className="text-xs text-stone-400 line-through">{fmt(item.listUnitPrice * item.quantity)}</p> : null}
                        <p className="text-base font-bold text-[#264027]">{fmt(item.unitPrice * item.quantity)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() => {
                              updateQuantity(item.productId, item.format, item.quantity - 1);
                              trackEvent("Checkout Item Quantity Changed", {
                                product_id: item.productId,
                                format: item.format,
                                quantity: item.quantity - 1,
                              });
                            }}
                            disabled={item.quantity <= 1}
                            className="h-9 w-9 rounded-lg text-base font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-40 touch-manipulation"
                            aria-label="Decrease quantity"
                          >−</button>
                          <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => {
                              updateQuantity(item.productId, item.format, item.quantity + 1);
                              trackEvent("Checkout Item Quantity Changed", {
                                product_id: item.productId,
                                format: item.format,
                                quantity: item.quantity + 1,
                              });
                            }}
                            className="h-9 w-9 rounded-lg text-base font-bold text-stone-700 hover:bg-stone-100 touch-manipulation"
                            aria-label="Increase quantity"
                          >+</button>
                          <button
                            type="button"
                            onClick={() => {
                              removeItem(item.productId, item.format);
                              trackEvent("Checkout Item Removed", { product_id: item.productId, format: item.format });
                            }}
                            className="ml-1 h-9 w-9 rounded-lg text-base text-stone-400 hover:bg-red-50 hover:text-red-600 touch-manipulation"
                            aria-label="Remove"
                          >×</button>
                        </div>
                        <Link href="/products" className="text-sm font-bold text-[#264027] underline-offset-2 hover:underline">
                          Add products
                        </Link>
                    </div>
                  </div>
                  );
                })}
              </CardContent>
            </Card>}

            {/* Pickup OR Delivery card */}
            {activeStep === "timing" && (fulfillment === "pickup" ? (
              <Card className="rounded-2xl border-stone-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-7">
                  <PickupReadyTime
                    key={`${selectedPickupSite.id}-${pickupAllowAsap ? "asap" : "sched"}`}
                    value={pickupReady}
                    onChange={setPickupReady}
                    allowAsap={pickupAllowAsap}
                    minLeadDays={pickupMinLeadDays}
                    scheduleHelpText={pickupScheduleHelpText}
                  >
                    <div className="mt-4 flex items-start gap-3">
                      <MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#264027]" />
                      <div>
                        <p className="font-semibold text-stone-900">{selectedPickupSite.name}</p>
                        <a
                          href={selectedPickupSite.directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => trackEvent("Checkout Pickup Directions", { pickup_site: selectedPickupSite.id })}
                          className="inline-flex min-h-11 items-center text-sm text-stone-600 underline decoration-stone-300 underline-offset-4"
                        >
                          {selectedPickupSite.addressLine}
                        </a>
                        <p className="text-xs text-stone-500">{HOURS_LABEL}</p>
                      </div>
                    </div>
                  </PickupReadyTime>
                  {hasBulkItem && selectedPickupSite.id === "congress" && (
                    <p className="mt-4 text-sm text-stone-600">Bulk pickup is weighed on the Congress yard scale.</p>
                  )}
                  {phoenixBulkOverLimit && (
                    <p role="alert" className="mt-4 text-sm font-semibold text-red-800">
                      This load exceeds the {PHOENIX_BULK_MAX_TONS}-ton Phoenix limit. Choose Congress pickup or delivery.
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 border-t border-stone-200 pt-4">
                    <Button type="button" onClick={handleStepCtaClick} disabled={sideCtaDisabled}
                      className="hidden h-12 rounded-xl bg-[#264027] px-6 font-semibold text-white hover:bg-[#1f3320] lg:inline-flex">
                      {sideCtaLabel}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Button>
                    {(fulfillmentSeeded || !hasWalkingFloorDelivery) && (
                      <button type="button" onClick={() => {
                        setActiveStep("fulfillment");
                        setError(null);
                        trackEvent("Checkout Step Viewed", { step: "fulfillment", fulfillment, source: "change_chip" });
                      }} className="min-h-11 text-sm font-semibold text-[#264027] underline underline-offset-4">
                        Change pickup or delivery
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
                <CardHeader className="px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                        <Truck className="h-4 w-4 text-[#264027]" />
                        {deliveryQuote && !editingDeliveryQuote ? "Delivery address" : "Delivery price"}
                      </CardTitle>
                      {deliveryQuote && !editingDeliveryQuote && (
                        <p className="mt-1 text-sm text-stone-500">
                          Confirm where the truck should unload.
                        </p>
                      )}
                    </div>
                    {!hasWalkingFloorDelivery && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveStep("fulfillment");
                          setError(null);
                          trackEvent("Checkout Step Viewed", { step: "fulfillment", fulfillment, source: "change_chip" });
                        }}
                        className="shrink-0 rounded-full bg-[#264027]/10 px-3 py-1.5 text-xs font-bold text-[#264027] transition hover:bg-[#264027]/15"
                      >
                        Delivery · change
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-5">
                  {hasWalkingFloorDelivery && (
                    <div className="rounded-lg border border-[#264027]/15 bg-[#264027]/5 px-3 py-2 text-xs leading-snug text-stone-700">
                      <span className="font-bold text-[#264027]">Walking-floor delivery</span>
                      {" · "}
                      24-ton bulk dump included in this order.
                    </div>
                  )}
                  {/* Compact quote when already priced on the product page */}
                  {deliveryQuote && !editingDeliveryQuote ? (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-900">
                            Delivery cost{" "}
                            <span className="text-[#264027]">
                              {fmt(deliveryQuote.costDollars).replace(/\.00$/, "")}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-stone-600">
                            {deliveryQuote.truckLabel} · Congress, AZ →{" "}
                            {[
                              (deliveryAddress.city || deliveryQuote.breakdown.destinationCity || "").trim(),
                              (deliveryAddress.state || "").trim(),
                            ]
                              .filter(Boolean)
                              .join(", ") || `ZIP ${deliveryAddress.zip}`}
                            {deliveryAddress.zip ? ` · ${deliveryAddress.zip}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBoundDeliveryQuote(null);
                            setEditingDeliveryQuote(true);
                            saveDeliveryDraft({ ...deliveryAddress, roughAccess, semiAccess, quote: null });
                          }}
                          className="shrink-0 text-xs font-semibold text-[#264027] underline-offset-2 hover:underline"
                        >
                          Change ZIP
                        </button>
                      </div>
                    </div>
                  ) : (
                    <DeliveryQuoteWidget
                      key={quoteCartKey}
                      items={quoteItems}
                      productSubtotal={productSubtotal}
                      initialZip={deliveryAddress.zip}
                      initialQuote={deliveryQuote}
                      initialRoughAccess={roughAccess}
                      initialSemiAccess={semiAccess}
                      compact
                      onQuote={(q, ctx) => {
                        // Ignore a response that started before the cart changed.
                        if (latestQuoteRequest.current.cart !== quoteCartKey) return;
                        setBoundDeliveryQuote(q ? { key: deliveryQuoteKey({ items: quoteItems, ...ctx }), quote: q } : null);
                        setRoughAccess(ctx.roughAccess);
                        setSemiAccess(ctx.semiAccess);
                        const cityFromQuote = q?.breakdown.destinationCity?.trim() || "";
                        const stateFromQuote = q?.breakdown.destinationState?.trim() || "";
                        setDeliveryAddress((prev) => ({
                          ...prev,
                          zip: ctx.zip,
                          city: cityFromQuote || (prev.zip === ctx.zip ? prev.city : ""),
                          state: stateFromQuote || prev.state || "AZ",
                        }));
                        saveDeliveryDraft({
                          zip: ctx.zip,
                          roughAccess: ctx.roughAccess,
                          semiAccess: ctx.semiAccess,
                          quote: q,
                          city: cityFromQuote || null,
                          state: stateFromQuote || null,
                        });
                        if (q) {
                          setEditingDeliveryQuote(false);
                          setError(null);
                        }
                        if (!cityFromQuote && /^\d{5}$/.test(ctx.zip)) {
                          fetch(`/api/address/zip/${ctx.zip}`)
                            .then((r) => (r.ok ? r.json() : null))
                            .then((place) => {
                              if (!place?.city) return;
                              setDeliveryAddress((prev) =>
                                prev.zip === ctx.zip && !prev.city.trim()
                                  ? { ...prev, city: place.city, state: place.state || prev.state || "AZ" }
                                  : prev,
                              );
                            })
                            .catch(() => {});
                        }
                      }}
                    />
                  )}

                  {deliveryQuote && (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="d-street" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                          Street address <span className="text-red-500">*</span>
                        </Label>
                        <AddressAutocomplete
                          id="d-street"
                          value={deliveryAddress.street}
                          biasZip={deliveryAddress.zip}
                          placeholder="Start typing your street"
                          className="mt-1"
                          autoFocus={!deliveryAddress.street.trim()}
                          onChange={(street) => setDeliveryAddress((p) => ({ ...p, street }))}
                          onSelect={(address) => {
                            const nextZip = address.zip || deliveryAddress.zip;
                            const zipChanged = Boolean(address.zip && address.zip !== deliveryAddress.zip);
                            setDeliveryAddress({
                              street: address.street,
                              city: address.city,
                              state: address.state || "AZ",
                              zip: nextZip,
                            });
                            trackEvent("Checkout Address Autocompleted", {
                              city: address.city,
                              state: address.state,
                              zip: nextZip,
                              zip_changed: zipChanged,
                            });
                            if (zipChanged) {
                              setBoundDeliveryQuote(null);
                              setEditingDeliveryQuote(true);
                              saveDeliveryDraft({ zip: nextZip, roughAccess, semiAccess, quote: null, city: address.city, state: address.state });
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_4.5rem] gap-2">
                        <Input
                          id="d-city"
                          value={deliveryAddress.city}
                          onChange={(e) => setDeliveryAddress((p) => ({ ...p, city: e.target.value }))}
                          placeholder="City"
                          aria-label="City"
                          autoComplete="address-level2"
                          className="h-11 text-base"
                        />
                        <Input
                          id="d-state"
                          value={deliveryAddress.state}
                          onChange={(e) => setDeliveryAddress((p) => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))}
                          maxLength={2}
                          placeholder="AZ"
                          aria-label="State"
                          autoComplete="address-level1"
                          className="h-11 text-center text-base uppercase"
                        />
                      </div>

                      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3">
                        <div className="flex items-start gap-2">
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-emerald-950">
                              Usually within 1–3 business days
                            </p>
                            <p className="mt-0.5 text-xs text-emerald-900/80">
                              Pick when you&apos;re available — Kerry confirms or proposes a better slot.
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(
                            [
                              { id: "1-3", label: "1–3 business days" },
                              { id: "this-week", label: "This week" },
                              { id: "next-week", label: "Next week" },
                              { id: "custom", label: "Custom range" },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setAvailabilityPreset(opt.id);
                                if (opt.id !== "custom") {
                                  const range = rangeForPreset(opt.id);
                                  setDeliveryFrom(range.from);
                                  setDeliveryTo(range.to);
                                }
                              }}
                              className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                                availabilityPreset === opt.id
                                  ? "bg-[#264027] text-white"
                                  : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-[#264027]/40",
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div>
                            <Label htmlFor="d-date" className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                              From
                            </Label>
                            <Input
                              id="d-date"
                              type="date"
                              value={deliveryFrom}
                              onChange={(e) => {
                                setAvailabilityPreset("custom");
                                setDeliveryFrom(e.target.value);
                                if (deliveryTo && e.target.value > deliveryTo) setDeliveryTo(e.target.value);
                              }}
                              min={new Date().toISOString().slice(0, 10)}
                              className="mt-1 h-11 bg-white text-base"
                            />
                          </div>
                          <div>
                            <Label htmlFor="d-date-end" className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                              To
                            </Label>
                            <Input
                              id="d-date-end"
                              type="date"
                              value={deliveryTo}
                              onChange={(e) => {
                                setAvailabilityPreset("custom");
                                setDeliveryTo(e.target.value);
                              }}
                              min={deliveryFrom || new Date().toISOString().slice(0, 10)}
                              className="mt-1 h-11 bg-white text-base"
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <Label htmlFor="d-window" className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                            Preferred window
                          </Label>
                          <select
                            id="d-window"
                            value={deliveryWindow}
                            onChange={(e) => setDeliveryWindow(e.target.value)}
                            className="mt-1 h-11 w-full rounded-md border border-input bg-white px-3 text-base"
                          >
                            {DELIVERY_WINDOWS.map((windowLabel) => (
                              <option key={windowLabel} value={windowLabel}>
                                {windowLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Customer details */}
            {activeStep === "customer" && <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
              <CardHeader className="border-b border-[#264027]/10 bg-[#264027]/5 px-4 py-3 sm:px-5">
                <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                  <UserIcon className="h-4 w-4 text-[#b38a58]" />
                  Your details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <div>
                  <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="mt-1 h-11 text-base" />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(602) 555-0123" autoComplete="tel" inputMode="tel" className="mt-1 h-11 text-base" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="category" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Customer type <span className="text-red-500">*</span>
                  </Label>
                  <select id="category" value={customerCategory} onChange={(e) => setCustomerCategory(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base">
                    <option value="">Select one</option>
                    <option value="home-gardener">Home gardener</option>
                    <option value="farmer">Farmer / grower</option>
                    <option value="landscaper">Landscaper</option>
                    <option value="nursery">Nursery / greenhouse</option>
                    <option value="contractor">Contractor</option>
                    <option value="municipal-commercial">Municipal / commercial</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="company" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Company or farm <span className="text-stone-400 font-normal normal-case">(optional)</span>
                  </Label>
                  <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Business, farm, or project name" autoComplete="organization" className="mt-1 h-11 text-base" />
                </div>
                <div>
                  <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Email <span className="text-stone-400 font-normal normal-case">(optional)</span>
                  </Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" inputMode="email" className="mt-1 h-11 text-base" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Notes <span className="text-stone-400 font-normal normal-case">(optional)</span>
                  </Label>
                  <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={fulfillment === "delivery" ? "Site access, gate codes, where to dump..." : "Anything we should know..."} className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base" />
                </div>
                <p className="sm:col-span-2 rounded-lg bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-500">
                  By continuing, you agree that Soil Seed &amp; Water can contact you about this order and related updates.
                </p>
              </CardContent>
            </Card>}
          </div>

          {/* SIDE COLUMN on desktop / inline on mobile */}
          <div className="min-w-0 space-y-4 lg:order-2 lg:sticky lg:top-20 lg:self-start">
            {activeStep !== "review" && (
            <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
              <CardHeader className="px-5 pb-1 pt-5">
                <CardTitle className="text-lg font-semibold tracking-tight text-stone-900">Your order</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                {hasFlatbedSpots && <FlatbedLoadMeter spots={flatbedSpots} compact className="mt-3" suppressVolumeDiscount={schoolApplied} />}
                <ul className="divide-y divide-stone-200">
                  {groupedPayItems.map((item) => {
                    const bundle = getPromoBundleByProductId(item.productId);
                    const image = item.imageUrl || CART_IMAGE_FALLBACKS[item.productId];
                    const walkingFloor = isWalkingFloorDeliveryFormat(item.format);
                    const changeQuantity = (quantity: number) => {
                      updateQuantity(item.productId, item.format, quantity);
                      trackEvent("Checkout Item Quantity Changed", { product_id: item.productId, format: item.format, quantity, source: "summary" });
                    };
                    const remove = () => {
                      removeItem(item.productId, item.format);
                      trackEvent("Checkout Item Removed", { product_id: item.productId, format: item.format, source: "summary" });
                    };
                    if (bundle) return (
                      <li key={item.productId} className="py-3">
                        <BundleCartLine bundle={bundle} quantity={item.quantity} onQuantity={changeQuantity} onRemove={remove}
                          priceLabel={payItems.length > 1 ? fmt(item.unitPrice * item.quantity) : undefined} />
                      </li>
                    );
                    return (
                      <li key={`summary-${item.productId}-${item.format}`} className="py-3">
                        <div className="flex items-center gap-3">
                          {image ? (
                            <OptimizedImage src={image} alt="" width={140} q={70} className="h-16 w-16 shrink-0 rounded-lg bg-stone-50 object-contain" />
                          ) : <Package aria-hidden="true" className="h-12 w-12 shrink-0 text-stone-400" />}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-tight text-stone-950">{item.productName}</p>
                            <p className="mt-1 text-sm text-stone-600">{item.format}{item.quantity > 1 && ` · Qty ${item.quantity}`}</p>
                          </div>
                          {payItems.length > 1 && <span className="text-sm font-semibold tabular-nums">{fmt(item.unitPrice * item.quantity)}</span>}
                        </div>
                        <details className="mt-1 text-sm">
                          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-[#36513a]">Item details{!walkingFloor && " & quantity"}</summary>
                          {walkingFloor ? <p className="text-sm text-stone-600">Qty {item.quantity} · walking-floor load</p> : (
                            <div className="flex items-center justify-between gap-2">
                              <div className="inline-flex items-center rounded-xl border border-stone-200">
                                <button type="button" aria-label={`Decrease quantity of ${item.productName}`} className="grid h-11 w-11 place-items-center disabled:opacity-40" disabled={item.quantity <= 1} onClick={() => changeQuantity(item.quantity - 1)}><Minus className="h-4 w-4" /></button>
                                <span className="min-w-6 text-center tabular-nums">{item.quantity}</span>
                                <button type="button" aria-label={`Increase quantity of ${item.productName}`} className="grid h-11 w-11 place-items-center" onClick={() => changeQuantity(item.quantity + 1)}><Plus className="h-4 w-4" /></button>
                              </div>
                              <button type="button" aria-label={`Remove ${item.productName}`} className="inline-flex min-h-11 items-center gap-1 px-2 text-stone-600 hover:text-red-700" onClick={remove}><Trash2 className="h-4 w-4" /> Remove</button>
                            </div>
                          )}
                        </details>
                      </li>
                    );
                  })}
                </ul>
                {(flatbedOff > 0 || schoolOff > 0 || fulfillment === "delivery" || appliedDiscount?.kind === "test") && (
                  <div className="flex justify-between py-1 text-sm text-stone-600"><span>Products</span><span>{fmt(productSubtotalGross)}</span></div>
                )}
                {flatbedOff > 0 && (
                  <div className="flex items-center justify-between text-sm font-medium text-emerald-700">
                    <span>Full flatbed (10% off)</span>
                    <span>−{fmt(flatbedOff)}</span>
                  </div>
                )}
                {schoolOff > 0 && (
                  <div className="flex items-center justify-between text-sm font-medium text-emerald-700">
                    <span>School code (bagged only)</span>
                    <span>−{fmt(schoolOff)}</span>
                  </div>
                )}
                {fulfillment === "delivery" && (
                  <div className="flex items-center justify-between text-sm text-stone-600">
                    <span>Delivery</span>
                    <span>{deliveryQuote ? fmt(deliveryFee) : "—"}</span>
                  </div>
                )}
                {appliedDiscount?.kind === "test" && (
                  <div className="flex justify-between py-1 text-sm text-emerald-700"><span>Discount</span><span>−{fmt(discountAmount)}</span></div>
                )}
                <div className="mt-2 flex items-baseline justify-between border-t border-stone-200 pt-3 font-semibold text-stone-950">
                  <span>{fulfillment === "delivery" && !deliveryQuote ? "Subtotal" : "Total"}</span>
                  <span className="text-xl tabular-nums">{fmt(total)}</span>
                </div>
              </CardContent>
            </Card>
            )}

            {activeStep === "review" && (
            <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
              <CardHeader className="border-b border-[#264027]/10 bg-white px-4 py-3 sm:px-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Tag className="h-4 w-4 text-[#b38a58]" />
                  Order total
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-5">
                {/* Totals */}
                <div className="space-y-2">
                  {hasFlatbedSpots && <FlatbedLoadMeter spots={flatbedSpots} className="mb-2" suppressVolumeDiscount={schoolApplied} />}
                  <div className="flex items-center justify-between text-sm text-stone-600">
                    <span>Products</span>
                    <span>{fmt(productSubtotalGross)}</span>
                  </div>
                  {flatbedOff > 0 && (
                    <div className="flex items-center justify-between text-sm font-medium text-emerald-700">
                      <span>Full flatbed (10% off)</span>
                      <span>−{fmt(flatbedOff)}</span>
                    </div>
                  )}
                  {schoolOff > 0 && (
                    <div className="flex items-center justify-between text-sm font-medium text-emerald-700">
                      <span>School code (bagged only)</span>
                      <span>−{fmt(schoolOff)}</span>
                    </div>
                  )}
                  {fulfillment === "delivery" && (
                    <div className={cn(
                      "flex items-center justify-between text-sm",
                      deliveryQuote ? "text-stone-600" : "text-stone-400 italic"
                    )}>
                      <span>Delivery {deliveryQuote && `· ${deliveryQuote.truckLabel.toLowerCase()}`}</span>
                      <span>{deliveryQuote ? fmt(deliveryFee) : "Enter ZIP →"}</span>
                    </div>
                  )}
                  {appliedDiscount?.kind === "test" && (
                    <div className="flex items-center justify-between text-sm font-medium text-emerald-700">
                      <span>Discount ({appliedDiscount.code})</span>
                      <span>−{fmt(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-stone-200 pt-3 text-xl font-bold text-stone-950">
                    <span>Total</span>
                    <span>{fmt(total)}</span>
                  </div>
                </div>

                {appliedDiscount ? (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4" />
                        {appliedDiscount.kind === "school"
                          ? `Code ${appliedDiscount.code} applied · 30% off bagged products`
                          : `Code ${appliedDiscount.code} applied · −${appliedDiscount.percent}%`}
                      </div>
                      <button type="button" onClick={removeDiscount} className="rounded p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Remove discount">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {schoolApplied && (
                      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-emerald-900">
                        {(appliedDiscount?.notices || []).map((notice) => <li key={notice}>{notice}</li>)}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="discount" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Discount code
                    </Label>
                    <div className="mt-1 flex gap-2">
                      <Input id="discount" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="Enter code" className="flex-1 h-11 text-base" autoCapitalize="characters" aria-invalid={Boolean(discountError)} aria-describedby={discountError ? "discount-error" : undefined} />
                      <Button type="button" variant="outline" onClick={applyDiscount} disabled={discountChecking} className="h-11 px-4">
                        {discountChecking ? "Checking…" : "Apply"}
                      </Button>
                    </div>
                    {discountInput.trim().toUpperCase().startsWith("SCHOOL") && (
                      <div className="mt-2">
                        <Label htmlFor="school-discount-email" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                          Verification email
                        </Label>
                        <Input
                          id="school-discount-email"
                          type="email"
                          inputMode="email"
                          value={schoolEmail}
                          onChange={(e) => setSchoolEmail(e.target.value)}
                          placeholder={email || "Email from the school form"}
                          autoComplete="email"
                          className="mt-1 h-11 text-base"
                        />
                      </div>
                    )}
                    {discountError && <p id="discount-error" role="alert" className="mt-1 text-xs text-red-600">{discountError}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* Pickup timing keeps its desktop action beside the selected time. */}
            {!(activeStep === "timing" && fulfillment === "pickup") && <>
            <Button
              type={activeStep === "review" ? "submit" : "button"}
              onClick={handleStepCtaClick}
              size="lg"
              disabled={sideCtaDisabled}
              className={cn(
                "hidden h-14 w-full rounded-xl bg-[#264027] text-base font-bold shadow-lg shadow-[#264027]/20 hover:bg-[#1f3320] disabled:bg-stone-300 disabled:shadow-none lg:flex"
              )}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing…</>
              ) : activeStep !== "review" ? (
                <>{sideCtaLabel}<ArrowRight className="ml-2 h-4 w-4" /></>
              ) : deliveryQuoteMissing ? (
                <><Truck className="mr-2 h-5 w-5" /> {sideCtaLabel}</>
              ) : total === 0 ? (
                <><CheckCircle2 className="mr-2 h-5 w-5" /> {sideCtaLabel}</>
              ) : (
                <><CreditCard className="mr-2 h-5 w-5" /> {sideCtaLabel}</>
              )}
            </Button>

            <p className={cn(
              "text-center text-[11px] leading-relaxed text-stone-500",
              activeStep === "review" ? "block" : "hidden lg:block"
            )}>
              {total === 0
                ? "Order will be placed without payment."
                : fulfillment === "delivery"
                  ? "Secure Stripe checkout. We'll call to schedule delivery after payment."
                  : "Secure Stripe checkout. We'll have your order ready at the time shown above."}
            </p>
            </>}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto max-w-6xl">
            <Button
              type={activeStep === "review" ? "submit" : "button"}
              onClick={handleStepCtaClick}
              size="lg"
              disabled={sideCtaDisabled}
              className="h-14 w-full rounded-xl bg-[#264027] text-base font-bold shadow-lg shadow-[#264027]/20 hover:bg-[#1f3320] disabled:bg-stone-300 disabled:shadow-none"
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing…</>
              ) : activeStep !== "review" ? (
                <>{sideCtaLabel}<ArrowRight className="ml-2 h-4 w-4" /></>
              ) : deliveryQuoteMissing ? (
                <><Truck className="mr-2 h-5 w-5" /> {sideCtaLabel}</>
              ) : total === 0 ? (
                <><CheckCircle2 className="mr-2 h-5 w-5" /> {sideCtaLabel}</>
              ) : (
                <><CreditCard className="mr-2 h-5 w-5" /> {sideCtaLabel}</>
              )}
            </Button>
          </div>
        </div>
      </form>
      </div>
    </>
  );
};

export default Checkout;
