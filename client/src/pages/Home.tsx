import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import SEO from "@/components/layout/SEO";
import {
  ArrowRight,
  MapPin,
  ChevronRight,
  Package,
  Box,
  Container,
  ArrowUpRight,
  Building2,
  Compass,
  Phone,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL, PHOENIX_YARD_DIRECTIONS_URL, PHOENIX_YARD_ENTRANCE_COORDINATES } from "@/config/contact";
import { generateProductSlug } from "@/utils/generateSlug";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { OptimizedImage } from "@/components/OptimizedImage";
import DeferredMount from "@/components/DeferredMount";
import LazyYouTube from "@/components/LazyYouTube";
import { lazy, Suspense, useEffect, useState } from "react";
import { DealHubCards } from "@/components/DealList";
import RaisedGardenBedVideo from "@/components/RaisedGardenBedVideo";

const AmazonReviewCarousel = lazy(() => import("@/components/AmazonReviewCarousel"));

function MobileResultsProof() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    const timerId = window.setTimeout(() => setShouldLoad(true), 1000);
    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <figure className="relative aspect-[160/87] overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8efe3] via-[#f5efe5] to-[#dbe7d4] shadow-2xl ring-1 ring-white/10">
      {loadState === "loading" && (
        <div className="absolute inset-0 overflow-hidden" role="status" aria-live="polite">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/55 to-transparent motion-safe:animate-pulse motion-reduce:animate-none" />
          <div className="absolute inset-x-0 top-0 flex justify-between p-3" aria-hidden="true">
            <span className="rounded-full bg-[#264027]/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Before</span>
            <span className="rounded-full bg-[#b38a58]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">After</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-[#264027] shadow-sm ring-1 ring-[#264027]/10">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#264027]/25 border-t-[#264027] motion-reduce:animate-none" aria-hidden="true" />
              Loading customer result…
            </span>
          </div>
        </div>
      )}
      {shouldLoad && loadState !== "error" ? (
        <img
          src="/images/performance/home-results-640.webp"
          srcSet="/images/performance/home-results-640.webp 640w, /images/performance/home-results-768.webp 768w, /images/performance/home-results-1280.webp 1280w"
          sizes="calc(100vw - 2rem)"
          alt="Turf Daddy before-and-after lawn transformation"
          width="640"
          height="348"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadState("loaded")}
          onError={() => setLoadState("error")}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${loadState === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {loadState === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center" role="status">
          <div>
            <p className="text-sm font-bold text-[#264027]">Customer result photo unavailable</p>
            <p className="mt-1 text-xs text-stone-600">See verified customer stories below.</p>
          </div>
        </div>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-3 pt-10">
        <p className="text-sm font-bold leading-tight text-white">
          Turf Daddy testimonial <span className="text-[#d6c1a0]">before / after results.</span>
        </p>
      </figcaption>
    </figure>
  );
}

type FeaturedProduct = {
  id: number;
  name: string;
  productName?: string;
  slug?: string;
  description?: string;
  category: string;
  imageUrl?: string;
  texturePhotoUrl?: string;
  productType?: string;
};

const Home = () => {
  const [, navigate] = useLocation();

  const [phoenixLat, phoenixLng] = PHOENIX_YARD_ENTRANCE_COORDINATES.split(",");
  const PHOENIX_COORDINATES = { lat: Number(phoenixLat), lng: Number(phoenixLng) };
  const PHOENIX_MAP_EMBED_URL = `https://www.google.com/maps?q=${PHOENIX_COORDINATES.lat},${PHOENIX_COORDINATES.lng}&z=13&output=embed`;
  const PHOENIX_DIRECTIONS_URL = PHOENIX_YARD_DIRECTIONS_URL;

  const sizeCategories = [
    {
      id: "pallet-boxes",
      name: "Pallet of 9 lb bags",
      description: "144 units (36 cases of 4 units)",
      image: "/images/performance/home-size-pallet-boxes-480.webp",
      icon: <Box className="h-6 w-6" />,
    },
    {
      id: "pallet-bags",
      name: "Pallet of 1CF bags",
      description: "50 bags (1CF each)",
      image: "/images/performance/home-size-pallet-bags-480.webp",
      icon: <Package className="h-6 w-6" />,
    },
    {
      id: "bulk",
      name: "Bulk Delivery",
      description: "Up to 24 tons or about 60 cubic yards per load; capacity depends on the material.",
      image: "/images/performance/home-size-bulk-480.webp",
      icon: <Container className="h-6 w-6" />,
    },
    {
      id: "cubic-yard",
      name: "Buy in Cubic Yard",
      description: "Bulk pickup only",
      image: "/images/performance/home-size-yard-480.webp",
      icon: <Container className="h-6 w-6" />,
    },
  ];

  const handleProductSelect = (product: FeaturedProduct) => {
    const identifier = product.slug || generateProductSlug(product.productType, product.name) || product.id;
    if (product.category === "Mulch") {
      navigate(`/products/mulch/${identifier}`);
    } else {
      navigate(`/products/${identifier}`);
    }
  };

  const featuredProducts: FeaturedProduct[] = [
    {
      id: 1000,
      name: "Dairy Compost",
      productName: "Simon's Gold",
      slug: "simons-gold",
      imageUrl: "/images/performance/home-product-compost-480.webp",
      texturePhotoUrl: "Compost Texture Look.jpg",
      description: "All-natural dairy compost",
      category: "Amendment",
    },
    {
      id: 1001,
      name: "Worm Castings",
      productName: "Mikey's Worm Poop",
      slug: "mikeys-worm-poop",
      imageUrl: "/images/performance/home-product-worm-480.webp",
      texturePhotoUrl: "Worm castting product texture.png",
      description: "All-natural vermicompost",
      category: "Amendment",
    },
    {
      id: 4000,
      name: "Organic Concentrated Blend",
      productName: "SuperBooster",
      slug: "superbooster",
      imageUrl: "/images/performance/home-product-concentrate-480.webp",
      texturePhotoUrl: "Concentrated Organic Amendment Fertilizer Product look.jpeg",
      description: "Organic concentrated amendment",
      category: "Concentrated Amendment",
    },
    {
      id: 1002,
      name: "Biochar",
      productName: "Amazonian Dark Earth",
      slug: "amazonian-dark-earth",
      imageUrl: "/images/performance/home-product-biochar-480.webp",
      texturePhotoUrl: "Biochar Product Texture Look.jpg",
      description: "Biochar mineral amendment",
      category: "Amendment",
    },
  ];

  return (
    <div className="min-h-screen bg-background">

      <SEO
        title="Soil, Garden Beds & Bulk Delivery in Arizona"
        description="Arizona-made soil, compost and mulch for your next growing project. Explore garden bed packages, pickup bundles and bulk delivery. Call our local team for help."
        keywords="Arizona compost, Arizona made soil, local compost Arizona, bulk organic soil, wholesale compost, dairy compost bulk, worm castings wholesale, commercial soil supplier, soil amendments wholesale, potting soil bulk, landscaper soil supplier, golf course soil, supersack soil, pallet soil, wholesale plant nutrients, HB 2819"
        canonical="https://organicsoilwholesale.com"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          speakable: {
            "@type": "SpeakableSpecification",
            cssSelector: ["h1", ".speakable"],
          },
          name: "Organic Soil Wholesale - Soil, Garden Beds and Bulk Delivery",
          url: "https://organicsoilwholesale.com",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://organicsoilwholesale.com/products?category={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }}
      />

      <section aria-labelledby="soil-shopping-heading" className="bg-[#f7f5ef] text-[#264027]">
        <div className="mx-auto grid max-w-7xl items-center gap-7 px-5 py-7 sm:px-8 md:grid-cols-[.95fr_1.05fr] md:gap-8 lg:gap-12 lg:py-12">
          <div>
            <p className="inline-flex rounded-full bg-[#f0dfc7] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#79512b]">Your local soil source · Phoenix, Arizona</p>
            <h1 id="soil-shopping-heading" className="mt-4 font-heading text-[38px] font-semibold leading-[1.08] tracking-[-0.05em] sm:text-5xl lg:text-[56px]">Organic soil.<br />Happy gardens.<br /><span className="text-[#a44f35]">Better value.</span></h1>
            <p className="mt-4 max-w-lg text-[15px] leading-6 text-[#626b5d] sm:text-base sm:leading-7">Shop nutrient-rich dairy compost, worm castings, growing mixes and enhanced mulch. Order bags for Phoenix pickup, or call us for delivery.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/products" className="inline-flex min-h-12 items-center gap-3 rounded-md bg-[#264027] px-5 text-sm font-semibold text-white hover:bg-[#3c5233]" onClick={() => trackEvent("Hero CTA Clicked", { cta: "shop_products" })}>Shop soil &amp; bundles <ArrowRight className="h-4 w-4" /></Link>
              <a href={CUSTOMER_SUPPORT_PHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY} for delivery`} data-official-support-phone="true" data-hero-phone-cta="true" data-phone-number={CUSTOMER_SUPPORT_PHONE_TEL.slice(4)} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-[#ddc18f] bg-[#f3e4c9] px-5 text-sm font-semibold hover:bg-[#ecd7b1]"><Phone className="h-4 w-4" />Call for delivery</a>
            </div>
            <p className="mt-4 text-xs leading-6 text-[#626b5d]">Bags from <strong>$10.99</strong> <span className="mx-2">·</span> Garden bundles from <strong>$99</strong></p>
            <a href="#home-delivery" className="mt-3 flex min-h-11 items-center gap-3 border-l-2 border-[#bd8150] pl-3 text-sm">
              <span><strong className="block text-[#895335]">More soil. Better value.</strong><span className="text-xs text-[#626b5d]">Ask about pallet and bulk pricing.</span></span><ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href={PHOENIX_YARD_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-[11px] text-[#626b5d]"><MapPin className="h-4 w-4" />Phoenix pickup · 1634 N 19th Ave <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
          <div className="grid min-w-0 grid-cols-[1.08fr_1fr] items-start gap-3 sm:gap-4">
            <figure>
              <img
                src="/images/community/customer-taking-soil-home-800.webp"
                srcSet="/images/community/customer-taking-soil-home-480.webp 480w, /images/community/customer-taking-soil-home-800.webp 800w"
                sizes="(min-width: 1280px) 310px, (min-width: 768px) 26vw, 52vw"
                alt="A customer taking home bags of soil beside stacked products at our Phoenix pickup yard"
                width="800" height="1067" loading="eager" fetchPriority="high" decoding="async"
                className="w-full rounded-md"
              />
              <figcaption className="pt-2 text-[11px] leading-5 text-[#626b5d]">Good soil. Ready to take home.</figcaption>
            </figure>
            <div className="grid gap-3 sm:gap-4">
              <figure>
                <img src="/images/community/garden-harvest-800.webp" srcSet="/images/community/garden-harvest-480.webp 480w, /images/community/garden-harvest-800.webp 800w" sizes="(min-width: 1280px) 285px, (min-width: 768px) 24vw, 48vw" alt="A grower showing a striped garden vegetable growing on the vine" width="800" height="1067" loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-md object-cover object-[center_60%]" />
                <figcaption className="pt-2 text-[11px] leading-5 text-[#626b5d]">From the garden. Still on the vine.</figcaption>
              </figure>
              <figure>
                <img src="/images/community/growing-garden-640.webp" srcSet="/images/community/growing-garden-640.webp 640w, /images/community/growing-garden-1200.webp 1200w" sizes="(min-width: 1280px) 285px, (min-width: 768px) 24vw, 48vw" alt="Vegetables and flowers growing in soil bags at the Ready Go Garden community garden" width="640" height="480" loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-md object-cover" />
                <figcaption className="pt-2 text-[11px] leading-5 text-[#626b5d]">Vegetables and flowers, growing together.</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="soil-essentials-heading" className="bg-[#efeee5] px-5 py-8 text-[#264027] sm:px-8 lg:py-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b795b]">Meet the materials</p>
              <h2 id="soil-essentials-heading" className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Find the right soil for your garden.</h2>
            </div>
            <Link href="/products" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">Shop all products <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
            {[
              { name: "Simon’s Gold", type: "Dairy compost", use: "Add organic matter to existing soil.", image: "compost", href: "/products/simons-gold", alt: "A handful of Simon’s Gold dairy compost" },
              { name: "Mikey’s Worm Poop", type: "Worm castings", use: "Top dress plants or add to soil blends.", image: "worm", href: "/products/mikeys-worm-poop", alt: "A close look at our worm castings" },
              { name: "Nature’s Blanket Premium", type: "Enhanced mulch", use: "Cover the soil to help retain moisture.", image: "mulch", href: "/products/natures-blanket-premium", alt: "Wood fiber mulch held in a hand" },
            ].map((product) => (
              <Link key={product.image} href={product.href} className="group grid grid-cols-[100px_1fr] overflow-hidden rounded-md bg-[#fdfcf8] ring-1 ring-[#264027]/10 transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#264027] sm:block">
                <img src={`/images/performance/home-product-${product.image}-480.webp`} alt={product.alt} width="480" height="360" loading="lazy" decoding="async" className="h-full min-h-32 w-full object-cover sm:aspect-[2/1] sm:h-auto sm:min-h-0" />
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6b795b]">{product.type}</p>
                    <h3 className="mt-1 text-sm font-semibold">{product.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-[#626b5d]">{product.use}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="soil-health-heading" className="bg-[#263c2a] px-5 py-10 text-[#f6f3e9] sm:px-8 lg:py-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e4c18c]">Rooted in regenerative agriculture</p>
            <h2 id="soil-health-heading" className="mt-3 font-heading text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Healthy soil works in three ways.</h2>
            <p className="mt-3 text-sm leading-7 text-[#d8dfd0]">We compost dairy manure into soil amendments with a purpose: support soil life, return nutrients to the ground, and build a better place for roots to grow.</p>
          </div>
          <div className="mt-7 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {[
              { title: "Microbiology", benefit: "Feed the life in your soil.", description: "Organic matter feeds soil organisms that break down material and help cycle nutrients." },
              { title: "Nutrition", benefit: "Give your garden a nourishing start.", description: "Dairy compost and worm castings add organic matter and plant nutrients. Choose the amendment that fits what you’re growing." },
              { title: "Physical structure", benefit: "Make room for water, air and roots.", description: "Organic matter helps soil hold moisture that roots can draw on, while supporting structure and drainage. A layer of mulch helps reduce evaporation." },
            ].map((priority) => (
              <div key={priority.title} className="border-t border-[#6a7b60] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e4c18c]">{priority.title}</p>
                <h3 className="mt-2 text-base font-semibold">{priority.benefit}</h3>
                <p className="mt-2 text-sm leading-6 text-[#d8dfd0]">{priority.description}</p>
              </div>
            ))}
          </div>
          <a href="#living-compost-heading" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#e4c18c]">See how we make our compost <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>

      <section id="new-garden-package" aria-labelledby="new-garden-heading" className="scroll-mt-24 bg-[#f7f5ef] px-5 py-12 text-[#264027] sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b795b]">Raised garden bed + growing materials</p><h2 id="new-garden-heading" className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-[-0.04em] lg:text-4xl">The heavy-duty raised<br />garden bed bundle is here.</h2></div>
            <p className="max-w-sm text-sm leading-7 text-[#626b5d]">A large 4 × 8 ft bed, 2 ft deep, with potting soil, mulch, compost and worm castings in one bundle. Get your garden started with less guesswork.</p>
          </div>
          <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
            <div>
              <figure><img src="/garden-bed/bundle-960.webp" srcSet="/garden-bed/bundle-480.webp 480w, /garden-bed/bundle-960.webp 960w" sizes="(min-width: 1024px) 55vw, 100vw" alt="Illustration of the garden bed package with growing materials, mulch and pea gravel totes" width="960" height="640" loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-md object-cover" /><figcaption className="mt-2 text-[10px] leading-4 text-[#626b5d]">Package illustration. Plants, irrigation, shade accessories and assembly are not included.</figcaption></figure>
              <h3 className="mt-6 text-xl font-semibold">The bed and growing materials. All together.</h3>
              <p className="mt-3 text-sm leading-7 text-[#626b5d]">Wood panels and heavy-duty metal corners give your garden a sturdy home. Growing materials, setup instructions and an assembly video help you get started.</p>
              <div className="mt-5 flex flex-wrap items-center gap-4"><a href="/garden-bed-offer.html" className="inline-flex min-h-12 items-center gap-3 rounded-md bg-[#264027] px-5 text-sm font-semibold text-white">See the bundle &amp; payment options <ArrowRight className="h-4 w-4" /></a><a href={CUSTOMER_SUPPORT_PHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`} data-official-support-phone="true" data-phone-number={CUSTOMER_SUPPORT_PHONE_TEL.slice(4)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">Talk it through <ArrowUpRight className="h-4 w-4" /></a></div>
              <p className="mt-4 max-w-xl text-[11px] leading-5 text-[#626b5d]">The current full-package offer is for our giveaway community, with free Arizona delivery in November 2026 only. Call for eligibility, pricing and delivery details.</p>
              <RaisedGardenBedVideo />
            </div>
            <div className="rounded-md bg-[#eaedde] p-6 sm:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6b795b]">What’s included</p><h3 className="mt-3 text-xl font-semibold">One bed. A solid start.</h3>
              <ul className="mt-5 divide-y divide-[#cdd6c1]">
                {[
                  ["Raised garden bed", "4 × 8 ft · 2 ft deep"],
                  ["Lumber, metal posts, soil cloth & screws", "Included"],
                  ["Raw mulch", "2 cubic yards"],
                  ["Pea gravel", "1 cubic yard"],
                  ["Potting soil", "10 bags"],
                  ["Nature’s Blanket", "6 bags"],
                  ["Worm castings", "2 × 9 lb bags"],
                  ["Dairy compost", "2 × 9 lb bags"],
                  ["Setup instructions & assembly video", "Included"],
                ].map(([name, amount]) => <li key={name} className="flex justify-between gap-4 py-3 text-xs leading-5"><span className="max-w-[60%]">{name}</span><strong className="text-right font-semibold">{amount}</strong></li>)}
              </ul>
              <div className="mt-5 border-t border-[#c1cbb5] pt-5"><p className="text-xs">Just need the bed kit?</p><Link href="/products/garden-bed-kit" className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-semibold">Explore the $599 kit <ArrowUpRight className="h-4 w-4" /></Link><p className="text-[10px] leading-5 text-[#626b5d]">Growing materials, assembly and delivery sold separately.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="garden-bundles-heading" className="bg-[#e9edde] px-5 py-12 text-[#264027] sm:px-8">
        <div className="mx-auto max-w-7xl"><div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b795b]">For the garden you’re growing · Phoenix pickup</p><h2 id="garden-bundles-heading" className="mt-3 scroll-mt-24 font-heading text-3xl font-semibold tracking-[-0.04em]">A little refresh. Or a bigger beginning.</h2><p className="mt-3 text-sm text-[#626b5d]">Choose the materials that fit your project. New beds need enough growing mix for their size and depth.</p></div><DealHubCards source="homepage-bundles" layout="carousel" /></div>
      </section>

      <section aria-labelledby="growing-community-heading" className="bg-[#f7f5ef] px-5 py-12 text-[#264027] sm:px-8 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b795b]">Customers, gardens &amp; real results</p>
              <h2 id="growing-community-heading" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] lg:text-4xl">From our yard to your garden.</h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-[#626b5d]">Bags heading home. Gardens taking shape. Mulch on the ground. See how our community puts good soil to work.</p>
          </div>
          <div className="grid grid-cols-2 items-start gap-4 lg:grid-cols-3 lg:gap-6">
            <figure>
              <img src="/images/community/pickup-neighbors-640.webp" alt="A customer and team member at the Phoenix yard with a bag of worm castings" width="640" height="853" loading="lazy" className="aspect-[3/4] w-full rounded-md object-cover" />
              <figcaption className="mt-3 text-xs font-medium">Pick up. Say hello.</figcaption>
            </figure>
            <figure>
              <img src="/images/community/customer-taking-soil-home-800.webp" srcSet="/images/community/customer-taking-soil-home-480.webp 480w, /images/community/customer-taking-soil-home-800.webp 800w" sizes="(min-width: 1280px) 400px, (min-width: 1024px) 33vw, 50vw" alt="A customer taking home bags of soil beside stacked products at the Phoenix yard" width="800" height="1067" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-md object-cover" />
              <figcaption className="mt-3 text-xs font-medium">Good soil. Ready to take home.</figcaption>
            </figure>
            <figure>
              <img src="/images/community/growing-garden-1200.webp" srcSet="/images/community/growing-garden-640.webp 640w, /images/community/growing-garden-1200.webp 1200w" sizes="(min-width: 1024px) 25vw, 50vw" alt="Rows of vegetables and flowers at the Ready Go Garden community garden" width="1200" height="900" loading="lazy" className="aspect-[3/4] w-full rounded-md object-cover" />
              <figcaption className="mt-3 text-xs font-medium">A little space. Plenty of possibility.</figcaption>
            </figure>
            <figure>
              <img src="/images/community/garden-harvest-800.webp" srcSet="/images/community/garden-harvest-480.webp 480w, /images/community/garden-harvest-800.webp 800w" sizes="(min-width: 1024px) 27vw, 50vw" alt="A hand holding a striped garden vegetable on the vine among green leaves" width="800" height="1067" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-md object-cover" />
              <figcaption className="mt-3 text-xs font-medium">Something good is growing.</figcaption>
            </figure>
            <figure>
              <img src="/images/community/customer-garden-result-800.webp" srcSet="/images/community/customer-garden-result-480.webp 480w, /images/community/customer-garden-result-800.webp 800w" sizes="(min-width: 1024px) 33vw, 50vw" alt="Trinity Landscaping customer showing a finished palm and flower planter" width="800" height="1067" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-md object-cover object-right" />
              <figcaption className="mt-3 text-xs font-medium">A finished project. A proud grower.</figcaption>
            </figure>
            <figure>
              <img src="/images/community/mulch-applied-800.webp" srcSet="/images/community/mulch-applied-480.webp 480w, /images/community/mulch-applied-800.webp 800w" sizes="(min-width: 1024px) 33vw, 50vw" alt="Mulch applied around flowering plants beside the Soil Seed and Water yard building" width="800" height="600" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-md object-cover object-left" />
              <figcaption className="mt-3 text-xs font-medium">Mulch at work, right here at our yard.</figcaption>
              <Link href="/products/natures-blanket-premium" className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#895335]">Explore enhanced mulch <ArrowRight className="h-3.5 w-3.5" /></Link>
            </figure>
          </div>
          <a href={PHOENIX_YARD_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" />Visit the Phoenix pickup yard <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </section>

      <section id="home-delivery" aria-labelledby="home-delivery-heading" className="scroll-mt-24 bg-[#263c2a] px-5 py-12 text-[#f6f3e9] sm:px-8 lg:py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-8 md:grid-cols-[.9fr_1.1fr] lg:gap-20">
          <figure className="order-2 overflow-hidden rounded-md md:order-none">
            <img
              src="/images/community/home-delivery-1000.webp"
              srcSet="/images/community/home-delivery-640.webp 640w, /images/community/home-delivery-1000.webp 1000w"
              sizes="(min-width: 1280px) 550px, (min-width: 768px) 45vw, 100vw"
              alt="Super sacks of soil delivered on pallets to a residential garden project"
              width="1000" height="1755" loading="lazy" decoding="async"
              className="aspect-[4/5] w-full object-cover object-[center_60%]"
            />
            <figcaption className="bg-[#192e20] px-4 py-3 text-xs">Super sacks, delivered to your project.</figcaption>
          </figure>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d5c394]">Pallets · Super sacks · Bulk</p><h2 id="home-delivery-heading" className="mt-4 font-heading text-4xl font-semibold leading-tight tracking-[-0.04em] lg:text-5xl">More soil.<br />Better value.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-[#d1dac8]">Have a bigger project in mind? Ask about pallet and bulk pricing. We’ll help you choose the material, amount and delivery that fit the job.</p><div className="mt-6 border-t border-[#53664b] pt-6"><h3 className="text-xl font-semibold">Need delivery? Just call.</h3><p className="mt-2 text-sm leading-7 text-[#d1dac8]">Tell us what you need and where it’s going. Our team will confirm availability, freight and timing.</p></div><div className="mt-6 flex flex-wrap items-center gap-4"><a href={CUSTOMER_SUPPORT_PHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`} data-official-support-phone="true" data-phone-number={CUSTOMER_SUPPORT_PHONE_TEL.slice(4)} className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#eee3c9] px-5 text-sm font-semibold text-[#264027]"><Phone className="h-4 w-4" /><span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span></a><Link href="/order" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">Request a bulk quote <ArrowUpRight className="h-4 w-4" /></Link></div></div>
        </div>
      </section>

      {/* Unified reviews: photo carousel + quote carousel + field strip */}
      <DeferredMount minHeight={680} rootMargin="1200px 0px">
        <Suspense fallback={<div className="min-h-[680px] bg-[#eef3eb]" aria-hidden />}>
          <AmazonReviewCarousel />
        </Suspense>
      </DeferredMount>

      <section aria-labelledby="garden-classes-heading" className="relative z-10 bg-[#f4f0e5] px-4 py-9 sm:py-11">
        <div className="container mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-2xl bg-[#264027] text-white shadow-[0_18px_40px_rgba(24,58,35,0.24)] ring-1 ring-black/10">
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <img
                src="/images/community/seedling-800.webp"
                alt="A young plant growing in soil beside drip irrigation"
                width="800"
                height="533"
                loading="lazy"
                className="h-32 w-full object-cover object-center sm:h-auto sm:w-48 md:w-56"
              />
              <div className="flex flex-1 flex-col justify-center gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d7b77d]">
                    Free Phoenix Garden Registration
                  </p>
                  <h2 id="garden-classes-heading" className="mt-1 font-heading text-2xl font-extrabold leading-tight sm:text-[1.75rem]">
                    Get the next Garden Class date first.
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-snug text-white/70">
                    Free alerts for the next Phoenix class. Pick the topics you want.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => {
                    trackEvent("Homepage Garden Class CTA Clicked", { source: "homepage-class-card" });
                    navigate("/classes?source=homepage-class-card");
                  }}
                  className="h-12 min-h-12 w-full shrink-0 bg-[#d7b77d] px-6 text-sm font-extrabold text-[#263527] hover:bg-[#e2c794] sm:w-auto"
                >
                  Alert me <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="living-compost-heading" className="bg-[#e8eee5] px-5 py-12 text-[#264027] sm:px-8 lg:py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-12">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#536e64]">How we make our compost</p>
            <h2 id="living-compost-heading" className="mt-3 scroll-mt-24 font-heading text-3xl font-semibold leading-tight tracking-[-0.04em] lg:text-4xl">Good soil starts<br />long before your garden.</h2>
            <p className="mt-5 text-sm leading-7 text-[#536357]">We add cyanobacteria, also known as blue-green algae, to the water used on our dairy-compost windrows.</p>
            <p className="mt-3 text-sm leading-7 text-[#536357]">Microbiology is part of our process, alongside the organic material and moisture that go into making our compost. Here’s a closer look at that work.</p>
            <Link href="/operations" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold">See our operations <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-2 items-start gap-3 sm:gap-5">
            <figure>
              <img src="/images/community/cyanobacteria-tanks-800.webp" srcSet="/images/community/cyanobacteria-tanks-480.webp 480w, /images/community/cyanobacteria-tanks-800.webp 800w" sizes="(min-width: 1024px) 30vw, 50vw" width="800" height="533" alt="An aerial view of our cyanobacteria tanks and watering equipment" loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-md object-cover" />
              <figcaption className="mt-3 text-xs text-[#536357]">Our cyanobacteria tanks, from above.</figcaption>
            </figure>
            <figure className="pt-8">
              <img src="/images/community/cyanobacteria-closeup-800.webp" srcSet="/images/community/cyanobacteria-closeup-480.webp 480w, /images/community/cyanobacteria-closeup-800.webp 800w" sizes="(min-width: 1024px) 30vw, 50vw" width="800" height="533" alt="A close-up of green water and bubbles in a cyanobacteria tank" loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-md object-cover" />
              <figcaption className="mt-3 text-xs text-[#536357]">A closer look inside the tanks.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="bg-stone-50 py-10 md:py-14">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7a5a2e]">
                Arizona-made soil
              </p>
              <h2 className="font-heading text-2xl font-bold leading-tight text-stone-900 md:text-3xl">
                Built in Arizona yards for working projects.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 md:text-base">
                From Phoenix pickup to farm and orchard deliveries, our products are made, loaded, and used here in Arizona.
              </p>
              <Button
                onClick={() => navigate("/products")}
                className="mt-5 bg-primary px-6 text-white hover:bg-primary/90"
              >
                Shop pickup products
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <img
                src="/images/performance/field-application-360.webp"
                srcSet="/images/performance/field-application-360.webp 360w, /images/performance/field-application-720.webp 720w"
                sizes="33vw"
                alt="Growers reviewing compost in Arizona"
                width="720"
                height="960"
                className="h-56 w-full rounded-2xl object-cover shadow-sm"
                loading="lazy"
              />
              <img
                src="/images/performance/field-super-sack-360.webp"
                srcSet="/images/performance/field-super-sack-360.webp 360w, /images/performance/field-super-sack-720.webp 720w"
                sizes="33vw"
                alt="Super sack loading for wholesale order"
                width="720"
                height="1280"
                className="h-56 w-full rounded-2xl object-cover shadow-sm"
                loading="lazy"
              />
              <img
                src="/images/performance/field-orchard-360.webp"
                srcSet="/images/performance/field-orchard-360.webp 360w, /images/performance/field-orchard-720.webp 720w"
                sizes="33vw"
                alt="Compost applied in orchard rows"
                width="720"
                height="405"
                className="h-56 w-full rounded-2xl object-cover shadow-sm"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Distribution + Featured Products */}
      <section className="relative pt-10 md:pt-16 pb-16 bg-white overflow-hidden">
        <div className="container mx-auto px-4 relative z-10 h-full flex items-center">
          {/* Main Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
            {/* Left Column - Availability Checker, and Size Categories */}
            <div className="order-2 lg:order-1 lg:col-span-4 flex flex-col gap-6 mt-8 lg:mt-0">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-3 leading-tight">
                  Pickup, pallet, or truckload.
                </h2>
                <p className="text-base text-muted-foreground/80 max-w-md">
                  Locally produced soil amendments and bulk loads for landscapers, farms, nurseries, and commercial growers.
                </p>
              </div>

              {/* Pickup and Distribution Center */}
              <div className="bg-white rounded-xl border-2 border-border p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <MapPin className="h-6 w-6 text-primary" />
                  <h2 className="text-lg font-bold text-primary">Pickup & Distribution</h2>
                </div>
                <div className="space-y-5">
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary/70" />
                    <span>1634 N 19th Ave, Phoenix AZ 85009</span>
                  </p>
                  <div className="rounded-2xl overflow-hidden border border-primary/10 shadow-inner h-56">
                    <iframe
                      title="Organic Soil Wholesale Phoenix Distribution Center Map"
                      src={PHOENIX_MAP_EMBED_URL}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      className="h-full w-full border-0"
                    ></iframe>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Compass className="h-4 w-4 text-primary" />
                      <span>33&deg;28&apos;04.6&quot;N | 112&deg;06&apos;03.4&quot;W</span>
                    </div>
                    <Button asChild size="sm" className="gap-2">
                      <a href={PHOENIX_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
                        Open directions
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Size Categories Carousel */}
              <div className="bg-white rounded-xl border-2 border-border p-6 shadow-sm">
                <h2 className="text-lg font-bold mb-4">Size Categories</h2>
                <Carousel
                  opts={{
                    align: "center",
                    loop: true,
                    skipSnaps: false,
                    containScroll: "trimSnaps",
                  }}
                  className="w-full"
                >
                  <CarouselContent>
                    {sizeCategories.map((category) => (
                      <CarouselItem key={category.id}>
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden group cursor-pointer hover:shadow-lg transition-all duration-300">
                          <OptimizedImage
                            src={category.image}
                            alt={category.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            width={480}
                            sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 28vw"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent p-4 flex flex-col justify-end">
                            <div className="flex items-center gap-2 mb-2">
                              {category.icon}
                              <h3 className="text-white text-lg font-semibold">{category.name}</h3>
                            </div>
                            <p className="text-white/90 text-sm">{category.description}</p>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-2" />
                  <CarouselNext className="right-2" />
                </Carousel>
              </div>
            </div>

            {/* Right Column - Featured Products */}
            <div className="order-1 lg:order-2 lg:col-span-8 mt-0 lg:mt-0">
              <h2 className="mb-4 text-3xl font-heading font-bold text-primary lg:hidden text-center">Featured Products</h2>
              <div className="bg-white rounded-xl border-2 border-border p-6 shadow-sm">
                <h2 className="hidden text-xl font-bold mb-4 lg:block">Featured Products</h2>
                <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                  {featuredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="group cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
                      onClick={() => handleProductSelect(product)}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-neutral-50">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors duration-300 z-10 flex items-center justify-center">
                          <div className="bg-white text-primary font-semibold px-6 py-3 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-300 min-h-[44px] flex items-center">
                            View Details
                          </div>
                        </div>
                        <OptimizedImage
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          width={480}
                          sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 25vw"
                        />
                      </div>
                      <div className="mt-4 text-center">
                        <h3 className="text-xl font-heading font-bold text-foreground group-hover:text-primary transition-colors duration-200">
                          {product.name}
                        </h3>
                        {product.productName && <p className="text-sm font-semibold text-muted-foreground mt-1">{product.productName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8 text-center">
                  <Button
                    onClick={() => navigate("/products")}
                    className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-lg rounded-xl shadow-sm hover:shadow transition-all duration-300 w-full max-w-md"
                  >
                    View All Products
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Showcase Photos Section */}
      <section className="py-16 px-4 md:px-8 bg-white border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight">
              Our Work in Action
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground mt-4 max-w-2xl mx-auto">
              Discover our premium organic soil products in action across various applications
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="group relative overflow-hidden border-2 border-border bg-white shadow-sm flex flex-col">
              <CardContent className="relative flex-1 p-0 bg-black">
                <div className="relative aspect-video w-full lg:h-full">
                  <LazyYouTube id="yZvjAPZ0dVQ" title="Simon's Gold Dairy Compost Video" className="absolute inset-0" />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/60">Flagship Compost</span>
                  <h3 className="mt-2 text-2xl font-heading font-semibold sm:text-3xl">Simon&apos;s Gold Dairy Compost</h3>
                  <p className="mt-3 text-sm text-white/80 sm:text-base">
                    See how we transform raw dairy into living soil that feeds commercial landscapes and farms across the Southwest.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-white/80 px-6 py-4 text-sm text-primary/80 backdrop-blur-sm sm:text-base">
                Watch the full process from dairy partnerships to screened finished compost.
              </CardFooter>
            </Card>

            <div className="flex flex-col gap-8">
              <Card className="border-2 border-border bg-white shadow-sm overflow-hidden flex flex-col h-full">
                <CardContent className="p-0 bg-black">
                  <div className="relative aspect-video w-full">
                    <LazyYouTube id="UBs6anRv2IY" title="Worm Farming Video" className="absolute inset-0" />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3 bg-white p-6 text-left">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold text-primary">Worm Farming Hub</h3>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary uppercase tracking-wide">
                      Vermicompost
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Follow our castings operation—from feedstock blends to gentle harvesting that preserves microbe diversity.
                  </p>
                </CardFooter>
              </Card>

              <Card className="border-2 border-border bg-white shadow-sm overflow-hidden flex flex-col h-full">
                <CardContent className="p-0 bg-black">
                  <div className="relative aspect-video w-full">
                    <LazyYouTube id="HbR7BH-6uxI" title="Compost Blend for Farmers Video" className="absolute inset-0" />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3 bg-white p-6 text-left">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold text-primary">Field Application</h3>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary uppercase tracking-wide">Bulk Loads</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    See the on-farm blends we craft for commercial growers and how we stage truckloads for fast delivery.
                  </p>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
