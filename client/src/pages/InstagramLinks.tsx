import { useEffect } from "react";
import { ArrowRight, BellRing, Briefcase, ExternalLink, Gift, Sprout } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { trackEvent } from "@/lib/analytics";

type SocialChannel = "instagram" | "facebook" | "tiktok" | "youtube";

const channelDetails: Record<SocialChannel, { name: string; utmSource: string }> = {
  instagram: { name: "Instagram", utmSource: "instagram" },
  facebook: { name: "Facebook", utmSource: "facebook" },
  tiktok: { name: "TikTok", utmSource: "tiktok" },
  youtube: { name: "YouTube", utmSource: "youtube" },
};

function channelFromPath(pathname: string): SocialChannel {
  const segment = pathname.toLowerCase().split("/").filter(Boolean).pop() || "ig";
  if (segment === "fb" || segment === "facebook") return "facebook";
  if (segment === "tt" || segment === "tiktok") return "tiktok";
  if (segment === "yt" || segment === "youtube") return "youtube";
  return "instagram";
}

function trackedLink(channel: SocialChannel, target: string, campaign: string, content: string) {
  const url = new URL(target, "https://www.organicsoilwholesale.com");
  url.searchParams.set("source", `${channel}-bio`);
  url.searchParams.set("utm_source", channelDetails[channel].utmSource);
  url.searchParams.set("utm_medium", "organic_social");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  return url.origin === "https://www.organicsoilwholesale.com"
    ? `${url.pathname}${url.search}${url.hash}`
    : url.toString();
}

export default function InstagramLinks() {
  const channel = channelFromPath(window.location.pathname);
  const channelName = channelDetails[channel].name;
  const links = {
    gardenBed: trackedLink(channel, "/products/garden-bed-kit", "garden_bed_launch", "garden_bed_order"),
    community: trackedLink(channel, "/keep-growing", "keep_growing", "community_signup"),
    careers: trackedLink(channel, "/careers/sales", "sales_recruitment_2026", "sales_representative_careers"),
    offers: trackedLink(channel, "/offers", "fall_garden_bundles_2026", "fall_garden_bundles"),
    gardenClass: trackedLink(channel, "/classes#class-alert-signup", "fall_garden_classes_2026", "garden_class_alerts"),
    organicSoil: trackedLink(channel, "/", "social_bio_2026", "organic_soil_wholesale"),
    soilSeedWater: trackedLink(channel, "https://soilseedandwater.com/", "social_bio_2026", "soil_seed_water"),
  };

  useEffect(() => {
    trackEvent("Social Bio Page Viewed", {
      source: channel,
      campaign: "social-bio-2026",
    });
  }, [channel]);

  const recordClick = (destination: string) => {
    trackEvent("Social Bio Link Clicked", {
      source: channel,
      campaign: "social-bio-2026",
      destination,
    });
  };

  return (
    <main className="min-h-screen bg-[#f4f0e3] text-[#133d2a]">
      <Helmet>
        <title>Choose Your Next Step | Organic Soil Wholesale</title>
        <meta
          name="description"
          content="Keep growing with Soil Seed & Water: future giveaways, garden tips, new products, local events, and garden bundles."
        />
      </Helmet>

      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-7 sm:px-6 sm:pt-10">
        <header className="text-center">
          <p className="font-heading text-xl font-bold text-[#20251f] sm:text-2xl">Welcome to Soil Seed and Water</p>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#8b6940]">Welcome, {channelName} friends</p>
          <h1 className="mt-2 font-heading text-3xl font-bold leading-tight sm:text-4xl">What would you like to do?</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#4f6255] sm:text-base">There’s more growing here. Stay connected, explore our garden bundles, or find your next opportunity.</p>
        </header>

        <section className="mt-7 space-y-3" aria-label="Featured links">
          <a href={links.gardenBed} onClick={() => recordClick("garden-bed-kit")} className="grid min-h-40 grid-cols-[1fr_112px] overflow-hidden rounded-3xl border-2 border-[#d6b470] bg-[#fff8e8] sm:grid-cols-[1fr_155px]">
            <span className="flex flex-col justify-center p-5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8b6940]">New · Limited-time launch offer</span>
              <span className="mt-2 font-heading text-2xl font-bold">Your garden bed. $599.</span>
              <span className="mt-2 text-sm">4 steel posts, lumber, pea gravel &amp; soil cloth. Delivery and growing materials extra.</span>
              <span className="mt-3 flex items-center gap-2 font-bold">Request your bed <ArrowRight className="h-4 w-4" /></span>
            </span>
            <img src="/images/garden-bed/garden-bed-kit.webp" alt="Wood and steel garden bed concept" className="h-full w-full object-cover" />
          </a>
          <a
            href={links.community}
            onClick={() => recordClick("keep-growing")}
            className="group grid min-h-40 grid-cols-[1fr_112px] overflow-hidden rounded-3xl bg-[#173d25] text-white shadow-[0_14px_34px_rgba(19,61,42,0.22)] transition-transform active:scale-[0.99] sm:grid-cols-[1fr_155px]"
          >
            <span className="flex flex-col justify-center p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f5bb45]"><Sprout className="h-4 w-4" /> Be part of what’s growing</span>
              <span className="mt-2 font-heading text-2xl font-bold leading-tight">Keep Growing With Us</span>
              <span className="mt-2 text-sm font-semibold text-[#dce7de]">Future giveaways, garden tips, new products & local events</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-[#f5d77d]">Count me in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </span>
            <img src="/images/giveaway/complete-fall-garden-hero-v9.png" alt="A thriving raised-bed vegetable garden" className="h-full w-full object-cover" />
          </a>

          <a
            href={links.careers}
            onClick={() => recordClick("sales-representative-careers")}
            aria-label="Apply for the Soil Seed & Water Sales Representative position in Phoenix"
            className="group grid min-h-36 grid-cols-[1fr_112px] overflow-hidden rounded-3xl border-2 border-[#d6b470] bg-gradient-to-br from-[#fff8e8] via-[#f3e0b5] to-[#dce8d6] text-[#133d2a] shadow-[0_12px_32px_rgba(87,62,29,0.16)] transition-transform active:scale-[0.99] sm:grid-cols-[1fr_155px]"
          >
            <span className="flex flex-col justify-center p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7a552c]"><Briefcase className="h-4 w-4" /> We’re hiring · Phoenix</span>
              <span className="mt-2 font-heading text-2xl font-bold leading-tight">Grow With Us</span>
              <span className="mt-1 text-sm font-semibold text-[#526457]">Sales position open</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-[#133d2a]">Apply to join SSW <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </span>
            <img
              src="/images/recruitment/sales-representative-hiring-square-2026.webp"
              alt="Soil Seed & Water sales representative opening in Phoenix"
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          </a>

          <a
            href={links.offers}
            onClick={() => recordClick("fall-garden-bundles")}
            className="group grid min-h-36 grid-cols-[1fr_112px] overflow-hidden rounded-3xl bg-[#133d2a] text-white shadow-[0_12px_32px_rgba(19,61,42,0.18)] transition-transform active:scale-[0.99] sm:grid-cols-[1fr_155px]"
          >
            <span className="flex flex-col justify-center p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f0d498]"><Gift className="h-4 w-4" /> Fall garden bundles</span>
              <span className="mt-2 font-heading text-2xl font-bold leading-tight">Fall garden bundles $99 / $149 / $399</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-[#f8edcf]">See deals <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </span>
            <img src="/images/performance/campaign-worm-thumb-384.webp" alt="Mikey's Worm Poop worm castings" className="h-full w-full object-cover" />
          </a>

          <a
            href={links.gardenClass}
            onClick={() => recordClick("garden-class-waitlist")}
            aria-label="Sign up to hear about the next garden class"
            className="group flex min-h-36 items-center gap-4 rounded-3xl border-2 border-[#d6b470] bg-white p-5 shadow-[0_10px_26px_rgba(87,62,29,0.1)] transition-transform active:scale-[0.99] sm:p-6"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#e8d3a8] text-[#133d2a]">
              <BellRing className="h-8 w-8" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8b6940]">Garden class alerts</span>
              <span className="mt-1 block font-heading text-xl font-bold leading-tight sm:text-2xl">Tell me about the next class</span>
              <span className="mt-2 block text-sm font-semibold text-[#526457]">Sign me up for free alerts</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
          </a>

          <a
            href={links.organicSoil}
            onClick={() => recordClick("organic-soil-wholesale")}
            aria-label="Shop Organic Soil Wholesale for local soil sales"
            className="group flex min-h-24 items-center gap-4 rounded-2xl border-2 border-[#9fbb93] bg-[#dce8d6] px-5 py-4 shadow-[0_8px_22px_rgba(19,61,42,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(19,61,42,0.16)] active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block font-heading text-lg font-bold text-[#20251f] sm:text-xl">
                Organic <span className="text-primary">Soil</span>{" "}
                <span className="font-display italic text-[#8f7000]">Wholesale</span>
              </span>
              <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.14em] text-[#6b746c]">by Soil Seed &amp; Water</span>
              <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#133d2a] shadow-sm">Local soil sales</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#133d2a] text-white shadow-sm"><ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></span>
          </a>

          <a
            href={links.soilSeedWater}
            onClick={() => recordClick("soil-seed-and-water")}
            aria-label="Visit the Soil Seed and Water ecommerce retail store"
            className="group flex min-h-24 items-center gap-4 rounded-2xl border-2 border-[#d6b470] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(87,62,29,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(87,62,29,0.16)] active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <img src="/images/soil-seed-and-water-logo.png" alt="Soil Seed and Water" className="h-auto w-44 max-w-full object-contain object-left" />
              <span className="mt-2 inline-flex rounded-full bg-[#f4e6c6] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#6d4c25]">Ecommerce retail store</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8b6940] text-white shadow-sm"><ExternalLink className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
          </a>
        </section>

        <footer className="mt-7 text-center text-xs leading-5 text-[#637166]">
          Phoenix, Arizona · Locally made for healthier soil
        </footer>
      </div>
    </main>
  );
}
