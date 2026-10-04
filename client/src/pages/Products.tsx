import GardenBedLaunchCard from "@/components/GardenBedLaunchCard";
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import Autoplay from "embla-carousel-autoplay";
import SEO from "@/components/layout/SEO";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { OptimizedImage } from "@/components/OptimizedImage";
import {
  SPECIALTY_BLENDS,
  MULCH_PRODUCTS,
  OTHER_AMENDMENTS,
  type FeaturedProductSlot,
} from "@/data/featuredProducts";
import { PayPickupGrid } from "@/components/PayPickupGrid";
import { buildLocalBusinessSchema, buildProductsItemListSchema } from "@/config/seo";
import { trackEvent } from "@/lib/analytics";
import TrustStrip from "@/components/TrustStrip";
import { AlertCircle, CheckCircle2, ChevronRight, FileText, Loader2, MapPin, Truck } from "lucide-react";

const SIZE_FORMATS = [
  {
    eyebrow: "Small pickup",
    title: "9 lb bags",
    description: "Single bags for quick jobs, samples, and light amendments.",
    image: "/images/size-formats/9lb-single-bag.webp",
  },
  {
    eyebrow: "Bagged material",
    title: "1-2 cu ft bags",
    description: "Clean bagged formats for potting soil, mulch, and amendments.",
    image: "/images/size-formats/1-5cf-single-bag.webp",
  },
  {
    eyebrow: "Mulch bag",
    title: "2 cu ft mulch",
    description: "Single mulch bags for clean landscape pickup orders.",
    image: "/images/size-formats/2cf-mulch-single-bag.webp",
  },
  {
    eyebrow: "Pallet pickup",
    title: "Boxed pallets",
    description: "Palletized bag orders staged for fast yard pickup.",
    image: "/images/size-formats/boxed-pallet-bags.webp",
  },
  {
    eyebrow: "Stacked bags",
    title: "Full pallets",
    description: "Best when you need many bags of the same material.",
    image: "/images/size-formats/palletized-bags.webp",
  },
  {
    eyebrow: "Large format",
    title: "Super sacks",
    description: "Bulk bag format for larger jobs without a loose dump.",
    image: "/images/size-formats/super-sack.webp",
  },
  {
    eyebrow: "Combined order",
    title: "Mixed truckloads",
    description: "Combine pallets, super sacks, and boxed orders on one load.",
    image: "/images/size-formats/mixed-truckload.webp",
  },
  {
    eyebrow: "Bulk pickup",
    title: "Loose material",
    description: "Bagged PlantPal, worm castings, compost, and mulch for Phoenix pickup. Loose bulk stays compost and mulch only.",
    image: "/images/size-formats/bulk-yard-pickup.webp",
  },
  {
    eyebrow: "Delivery",
    title: "Walking-floor bulk",
    description: "Truckload delivery for qualifying sites and larger projects.",
    image: "/images/size-formats/walking-floor-delivery.webp",
  },
];

function PickupFormatsSection() {
  const autoplay = useRef(
    Autoplay({
      delay: 3600,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    })
  );

  return (
    <div className="mt-8 border-t border-stone-200 pt-8 md:mt-10 md:pt-10">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#264027]">
            Size and delivery formats
          </p>
          <h3 className="font-heading text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
            Choose the format that fits the job.
          </h3>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-stone-600">
          Start with bagged pickup, then scale up to pallets, super sacks, or truckloads when needed.
        </p>
      </div>
      <Carousel
        opts={{
          align: "start",
          loop: true,
          containScroll: "trimSnaps",
        }}
        plugins={[autoplay.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-3">
          {SIZE_FORMATS.map((format) => (
            <CarouselItem key={format.title} className="basis-[78%] pl-3 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
              <article className="group h-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative aspect-[4/3] bg-white">
                  <img
                    src={format.image}
                    alt={format.title}
                    className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.025]"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="border-t border-stone-100 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#438764]">{format.eyebrow}</p>
                  <h4 className="mt-1 font-heading text-base font-bold leading-tight text-stone-900">{format.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{format.description}</p>
                </div>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2 top-[38%] border-stone-200 bg-white/95 shadow-sm" />
        <CarouselNext className="right-2 top-[38%] border-stone-200 bg-white/95 shadow-sm" />
      </Carousel>
    </div>
  );
}

const DELIVERY_ORIGINS = [
  { name: "Phoenix", lat: 33.4484, lng: -112.074 },
  { name: "Congress", lat: 34.1625, lng: -112.8507 },
] as const;

const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

function DeliveryEligibilityCheck() {
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "locating" | "eligible" | "outside" | "unknown">("idle");
  const [message, setMessage] = useState("");

  const evaluateDeliveryRange = (coords: { lat: number; lng: number }, sourceLabel: string) => {
    const nearest = DELIVERY_ORIGINS
      .map((origin) => ({ ...origin, miles: milesBetween(origin, coords) }))
      .sort((a, b) => a.miles - b.miles)[0];

    if (nearest.miles <= 300) {
      setStatus("eligible");
      setMessage(`Delivery likely available. ${sourceLabel} is ${Math.round(nearest.miles)} miles from ${nearest.name}.`);
      trackEvent("Delivery Eligibility Checked", {
        result: "eligible",
        source: sourceLabel === "Your location" ? "geolocation" : "zip",
        nearest_origin: nearest.name,
        miles: Math.round(nearest.miles),
      });
    } else {
      setStatus("outside");
      setMessage(`${sourceLabel} is about ${Math.round(nearest.miles)} miles from ${nearest.name}. Request a quote and we will confirm options.`);
      trackEvent("Delivery Eligibility Checked", {
        result: "outside_range",
        source: sourceLabel === "Your location" ? "geolocation" : "zip",
        nearest_origin: nearest.name,
        miles: Math.round(nearest.miles),
      });
    }
  };

  const checkDelivery = async () => {
    const cleanZip = zip.replace(/\D/g, "").slice(0, 5);
    setZip(cleanZip);

    if (cleanZip.length !== 5) {
      setStatus("unknown");
      setMessage("Enter a 5-digit ZIP code.");
      trackEvent("Delivery Eligibility Checked", { result: "invalid_zip", source: "zip" });
      return;
    }

    setStatus("checking");
    setMessage("");

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`, { signal: controller.signal });
      window.clearTimeout(timeout);

      if (!response.ok) throw new Error("ZIP lookup failed");
      const data = await response.json();
      const place = data?.places?.[0];
      const coords = {
        lat: Number(place?.latitude),
        lng: Number(place?.longitude),
      };
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) throw new Error("ZIP lookup failed");

      evaluateDeliveryRange(coords, "This ZIP");
    } catch {
      setStatus("unknown");
      setMessage("We could not verify that ZIP. Request a quote and we will confirm delivery.");
      trackEvent("Delivery Eligibility Checked", { result: "lookup_failed", source: "zip" });
    }
  };

  const checkCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus("unknown");
      setMessage("Your browser does not allow location checks. Enter your ZIP code instead.");
      trackEvent("Delivery Eligibility Checked", { result: "geolocation_unavailable", source: "geolocation" });
      return;
    }

    setStatus("locating");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        evaluateDeliveryRange(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          "Your location",
        );
      },
      () => {
        setStatus("unknown");
        setMessage("Location was not allowed. Enter your ZIP code instead.");
        trackEvent("Delivery Eligibility Checked", { result: "geolocation_denied", source: "geolocation" });
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  };

  const statusIcon =
    status === "checking" || status === "locating" ? <Loader2 className="h-4 w-4 animate-spin" /> :
      status === "eligible" ? <CheckCircle2 className="h-4 w-4" /> :
        status === "outside" || status === "unknown" ? <AlertCircle className="h-4 w-4" /> :
          <MapPin className="h-4 w-4" />;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:flex-row md:flex-wrap md:items-center md:gap-4">
      <div className="flex min-w-[220px] flex-1 items-start gap-2">
        <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#264027]" />
        <div>
          <p className="text-sm font-bold text-stone-900">Bulk pickup. Delivery when you qualify.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
            Delivery is available within 300 miles of Phoenix or Congress, Arizona.
          </p>
        </div>
      </div>

      <div className="flex gap-2 md:w-[360px]">
        <input
          value={zip}
          onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
          onKeyDown={(event) => {
            if (event.key === "Enter") checkDelivery();
          }}
          inputMode="numeric"
          placeholder="ZIP code"
          className="h-10 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium outline-none ring-[#264027]/20 transition focus:border-[#264027] focus:ring-2"
        />
        <Button
          type="button"
          onClick={checkDelivery}
          className="h-10 rounded-lg bg-[#264027] px-3 text-sm font-bold text-white hover:bg-[#1f3320]"
        >
          Check
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={checkCurrentLocation}
        className="h-10 justify-center gap-2 rounded-lg border-[#264027]/20 bg-white text-sm font-bold text-[#264027] hover:bg-[#264027]/5 md:w-auto"
      >
        <MapPin className="h-4 w-4" />
        Use my location
      </Button>

      {status !== "idle" && (
        <div
          className={`flex w-full items-start gap-2 text-xs font-medium ${
            status === "eligible" ? "text-[#264027]" : status === "checking" || status === "locating" ? "text-stone-600" : "text-amber-800"
          }`}
        >
          {statusIcon}
          <span>
            {status === "checking"
              ? "Checking delivery range..."
              : status === "locating"
                ? "Checking your location..."
                : message}
          </span>
        </div>
      )}
    </div>
  );
}

/** Smaller card for specialty / mulch / amendment rows */
function FeaturedRowCard({ slot, onOpen, ctaLabel = "Request a Quote" }: { slot: FeaturedProductSlot; onOpen: () => void; ctaLabel?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -3 }}
      className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white p-5 text-left shadow-[0_6px_22px_rgba(38,64,39,0.08)] ring-1 ring-stone-200/60 transition-shadow duration-300 hover:shadow-[0_14px_40px_rgba(38,64,39,0.16)]"
    >
      <div className="group/photo relative aspect-[16/10] overflow-hidden rounded-2xl bg-stone-100">
        <OptimizedImage
          src={slot.heroImage ?? slot.thumbnailImage}
          alt={slot.displayTitle}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {slot.bagImage && (
          <div className="absolute bottom-2 right-2 h-16 w-16 overflow-hidden rounded-lg border-2 border-white bg-white shadow-md ring-1 ring-stone-300/60">
            <OptimizedImage
              src={slot.bagImage}
              alt={`${slot.displayTitle} bag`}
              className="h-full w-full object-contain"
            />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2 pt-6">
        <h4 className="font-heading text-xl font-bold text-stone-900">{slot.displayTitle}</h4>
        <p className="text-sm font-medium text-[#7a5a2e]">{slot.tagline}</p>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-600">{slot.blurb}</p>
        {slot.altImages && slot.altImages.length > 0 && (
          <div className="mt-3 flex gap-2">
            {slot.altImages.slice(0, 3).map((img) => (
              <div key={img.src} className="h-12 w-12 overflow-hidden rounded-lg ring-1 ring-stone-200">
                <OptimizedImage src={img.src} alt={img.label} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {slot.sizes.map((size) => (
            <span
              key={size}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600"
            >
              {size}
            </span>
          ))}
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#264027] transition-transform duration-300 group-hover:translate-x-1">
          {slot.ctaLabel ?? ctaLabel} <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </motion.button>
  );
}

const Products = () => {
  const [, navigate] = useLocation();

  const openSlot = (slot: FeaturedProductSlot) => {
    trackEvent("Product Card Clicked", {
      product_id: slot.productId ?? null,
      product_slug: slot.slug,
      product_name: slot.displayTitle,
      action: "open_product",
    });
    if (slot.href?.startsWith("#")) {
      const el = document.querySelector(slot.href);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (slot.href) {
      window.location.href = slot.href;
      return;
    }
    navigate(`/products/${slot.slug}`);
  };

  const requestQuoteForSlot = (slot: FeaturedProductSlot) => {
    trackEvent("Quote Product Clicked", {
      product_id: slot.productId ?? null,
      product_slug: slot.slug,
      product_name: slot.displayTitle,
    });
    const params = new URLSearchParams();
    if (slot.productId) params.set("productId", String(slot.productId));
    params.set("product", slot.displayTitle);
    navigate(`/order?${params.toString()}`);
  };

  return (
    <>
      <SEO
        title="Wholesale Organic Soil Products"
        description="Bulk soil products from Soil Seed & Water — dairy compost, worm castings, premium potting blends, amendments, mulch. Pallets, supersacks, truckloads."
        keywords="soil seed and water products, organic soil catalog, wholesale compost, organic mulch, potting soil supplier, dairy compost arizona, worm castings wholesale"
        canonical="https://organicsoilwholesale.com/products"
        structuredData={[buildLocalBusinessSchema(), buildProductsItemListSchema()]}
      />

      {/* Section 1 — bulk pickup + delivery (MOS-driven pricing, slot booking) */}
      <section id="pay-pickup" className="bg-gradient-to-b from-stone-50 to-white pt-2 pb-[calc(env(safe-area-inset-bottom)+7rem)] md:pt-5 md:pb-12">
        <div className="container mx-auto px-4">
          <div className="mb-2 flex flex-col justify-between gap-3 md:mb-4 md:flex-row md:items-end md:gap-4">
            <div>
              {/* Mobile: heading only — first product card must be visible without scrolling */}
              <p className="mb-1 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#264027] md:inline-flex">
                <CheckCircle2 className="h-3 w-3" /> Pickup &amp; delivery across Arizona
              </p>
              <h2 className="font-heading text-xl font-bold leading-tight text-stone-900 md:hidden">
                Order organic soil products.
              </h2>
              <h2 className="hidden font-heading text-3xl font-bold leading-tight text-stone-900 md:block">
                Wholesale compost, soil amendments &amp; mulch for Arizona jobs.
              </h2>
              <p className="mt-1 hidden max-w-xl text-sm leading-relaxed text-stone-600 md:mt-2 md:block">
                Buy online. Phoenix pickup covers bagged PlantPal, worm castings, compost, and mulch.
                Loose bulk at the yard stays compost and mulch. Pallets, super sacks, mixed loads,
                and truckloads can still be quoted or delivered.
              </p>
            </div>
          </div>

          <PayPickupGrid />
          <GardenBedLaunchCard />

          {/* Pickup logistics — shown after the products, where they're relevant */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:mt-4">
            <a
              href="https://maps.app.goo.gl/TkrzEwmyxXqPeNGeA"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("Pickup Pill Clicked", { location: "congress" })}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#264027] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1f3320]"
              aria-label="Open Congress plant location in Google Maps"
            >
              <MapPin className="h-3.5 w-3.5" />
              Congress bulk · ready in ~30 min
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#264027]/30 bg-white px-3 py-1.5 text-xs font-bold text-[#264027] shadow-sm">
              <MapPin className="h-3.5 w-3.5" />
              Phoenix: Simon’s Gold & Nature’s Blanket
            </span>
            <Link
              href="/pickup"
              className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline"
            >
              Pickup details →
            </Link>
          </div>

          <DeliveryEligibilityCheck />

          <PickupFormatsSection />

          <TrustStrip className="mt-6" page="/products" />

          <p className="mt-4 text-center text-xs text-stone-500 md:hidden">
            Need bulk or specialty? <a href="#request-quote" className="font-semibold text-stone-700 underline">Request a quote</a>.
          </p>
        </div>
      </section>

      {/* Section 2 — Request a Quote (Tier 2 begins here) */}
      <section id="request-quote" className="scroll-mt-20 bg-stone-100/60 py-10 md:py-14">
        <div className="container mx-auto px-4 text-center">
          <p className="mb-2 inline-flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a5a2e]">
            <FileText className="h-3 w-3" /> Made to order · request a quote
          </p>
          <h2 className="mx-auto max-w-2xl font-heading text-2xl font-bold leading-tight text-stone-900 md:text-3xl">
            Specialty blends, mulch &amp; amendments.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600 md:text-base">
            These products are prepared or scheduled on demand. Request a quote and we&apos;ll confirm product, lead time, and pricing.
          </p>
        </div>
      </section>

      {/* Specialty Blends (orchard / vineyard) */}
      <section className="bg-white py-10 md:py-14">
        <div className="container mx-auto px-4">
          <div className="mb-6 flex items-end justify-between gap-6 md:mb-8">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#7a5a2e]">
                Farmer-focused blends
              </p>
              <h3 className="font-heading text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
                Specialty blends, mulch &amp; amendments.
              </h3>
            </div>
            <p className="hidden max-w-sm text-sm text-stone-600 md:block">
              Crop-specific products for orchards, vineyards, groves, and specialty farms.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {SPECIALTY_BLENDS.map((slot) => (
              <FeaturedRowCard key={slot.slug} slot={slot} onOpen={() => requestQuoteForSlot(slot)} />
            ))}
          </div>
        </div>
      </section>

      {/* Section 3 — Mulch */}
      <section className="bg-stone-50 py-10 md:py-14">
        <div className="container mx-auto px-4">
          <div className="mb-6 flex items-end justify-between gap-6 md:mb-8">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#7a5a2e]">
                Landscape mulch
              </p>
              <h3 className="font-heading text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
                Nature&apos;s Blanket.
              </h3>
            </div>
            <p className="hidden max-w-sm text-sm text-stone-600 md:block">
              The mulch line that finishes every job and holds water in dry months.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {MULCH_PRODUCTS.map((slot) => (
              <FeaturedRowCard key={slot.slug} slot={slot} onOpen={() => openSlot(slot)} ctaLabel="Buy Now" />
            ))}
          </div>
        </div>
      </section>

      {/* Section 4 — Other amendments */}
      <section id="amendments-line" className="scroll-mt-20 bg-white py-10 md:py-14">
        <div className="container mx-auto px-4">
          <div className="mb-6 flex items-end justify-between gap-6 md:mb-8">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#7a5a2e]">
                Mineral &amp; biological
              </p>
              <h3 className="font-heading text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
                Amendments to mix in.
              </h3>
            </div>
            <p className="hidden max-w-sm text-sm text-stone-600 md:block">
              Drop-in biochar, zeolite, and microbial inoculants to upgrade any blend.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {OTHER_AMENDMENTS.map((slot) => (
              <FeaturedRowCard key={slot.slug} slot={slot} onOpen={() => requestQuoteForSlot(slot)} />
            ))}
          </div>
        </div>
      </section>

    </>
  );
};

export default Products;
