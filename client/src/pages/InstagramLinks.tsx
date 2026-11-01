import { useEffect } from "react";
import { ArrowRight, Briefcase, ChevronDown, ExternalLink, Gift, Sprout } from "lucide-react";
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
  if (/^https?:\/\//i.test(target)) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function InstagramLinks() {
  const channel = channelFromPath(window.location.pathname);
  const channelName = channelDetails[channel].name;
  const links = {
    organicSoil: trackedLink(channel, "https://www.organicsoilwholesale.com/", "social_bio_2026", "organic_soil_wholesale"),
    soilSeedWater: trackedLink(channel, "https://soilseedandwater.com/", "social_bio_2026", "soil_seed_water_store"),
    deals: trackedLink(channel, "/offers", "social_bio_2026", "current_deals"),
    newsletter: trackedLink(channel, "/newsletter", "social_bio_2026", "newsletter"),
    careers: trackedLink(channel, "/careers", "social_bio_2026", "careers"),
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
    <div className="min-h-screen bg-[#f4f0e3] text-[#133d2a]">
      <Helmet>
        <title>Choose Your Next Step | Organic Soil Wholesale</title>
        <meta
          name="description"
          content="Buy local, see current deals, join the newsletter, or apply to work with Soil Seed & Water."
        />
      </Helmet>

      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-7 sm:px-6 sm:pt-10">
        <header className="text-center">
          <p className="font-heading text-xl font-bold text-[#20251f] sm:text-2xl">Welcome to Soil Seed and Water</p>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#8b6940]">Welcome, {channelName} friends</p>
          <h1 className="mt-2 font-heading text-3xl font-bold leading-tight sm:text-4xl">What would you like to do?</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#4f6255] sm:text-base">There’s more growing here. Shop local, see what’s on, or come work with us.</p>
        </header>

        <section className="mt-7 space-y-3" aria-label="Featured links">
          <details className="group/buy overflow-hidden rounded-3xl border-2 border-[#d6b470] bg-[#fff8e8] shadow-[0_12px_32px_rgba(87,62,29,0.12)] transition-transform active:scale-[0.99]">
            <summary className="cursor-pointer list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] [&::-webkit-details-marker]:hidden">
              <img
                src="/images/community/garden-harvest-480.webp"
                srcSet="/images/community/garden-harvest-480.webp 480w, /images/community/garden-harvest-800.webp 800w"
                sizes="(max-width: 575px) calc(100vw - 2rem), 528px"
                width={800}
                height={600}
                alt="A ripe cucumber growing in dark garden soil"
                decoding="async"
                fetchPriority="high"
                className="aspect-[16/10] w-full object-cover"
              />
              <span className="flex flex-col p-5 sm:p-6">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8b6940]">Phoenix yard or online</span>
                <span className="mt-2 font-heading text-2xl font-bold leading-tight">Buy Local</span>
                <span className="mt-2 text-sm leading-6 text-[#4f6255]">Pick up at the yard, or shop the online store.</span>
                <span className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[#264027] px-4 py-3 text-sm font-bold text-white">
                  Choose where to buy
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open/buy:rotate-180" aria-hidden="true" />
                </span>
              </span>
            </summary>
            <div className="space-y-3 px-4 pb-5 sm:px-5">
              <a
                href={links.organicSoil}
                onClick={() => recordClick("organic-soil-wholesale")}
                aria-label="Shop Organic Soil Wholesale for local soil sales"
                className="group/store flex min-h-24 items-center gap-4 rounded-2xl border-2 border-[#9fbb93] bg-[#dce8d6] px-5 py-4 shadow-[0_8px_22px_rgba(19,61,42,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(19,61,42,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block font-heading text-lg font-bold text-[#20251f] sm:text-xl">
                    Organic <span className="text-primary">Soil</span>{" "}
                    <span className="font-display italic text-[#8f7000]">Wholesale</span>
                  </span>
                  <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.14em] text-[#6b746c]">by Soil Seed &amp; Water</span>
                  <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#133d2a] shadow-sm">Local soil sales</span>
                </span>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#133d2a] text-white shadow-sm">
                  <ArrowRight className="h-5 w-5 transition-transform group-hover/store:translate-x-1" aria-hidden="true" />
                </span>
              </a>
              <a
                href={links.soilSeedWater}
                onClick={() => recordClick("soil-seed-and-water")}
                aria-label="Visit the Soil Seed and Water e-commerce online store"
                className="group/store flex min-h-24 items-center gap-4 rounded-2xl border-2 border-[#d6b470] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(87,62,29,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(87,62,29,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <img src="/images/soil-seed-and-water-logo.png" alt="Soil Seed and Water" width={2083} height={729} className="h-auto w-44 max-w-full object-contain object-left" />
                  <span className="mt-2 inline-flex max-w-full rounded-full bg-[#f4e6c6] px-3 py-1 text-[11px] font-extrabold uppercase leading-4 tracking-[0.04em] text-[#6d4c25]">E-commerce / online store</span>
                </span>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8b6940] text-white shadow-sm">
                  <ExternalLink className="h-5 w-5 transition-transform group-hover/store:-translate-y-0.5 group-hover/store:translate-x-0.5" aria-hidden="true" />
                </span>
              </a>
            </div>
          </details>

          <a
            href={links.deals}
            onClick={() => recordClick("current-deals")}
            className="group grid min-h-36 grid-cols-[1fr_112px] overflow-hidden rounded-3xl bg-[#133d2a] text-white shadow-[0_12px_32px_rgba(19,61,42,0.18)] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:scale-[0.99] sm:grid-cols-[1fr_155px]"
          >
            <span className="flex flex-col justify-center p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f0d498]">
                <Gift className="h-4 w-4" aria-hidden="true" /> Current offers
              </span>
              <span className="mt-2 font-heading text-2xl font-bold leading-tight">See Current Deals</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-[#f8edcf]">
                Shop deals <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </span>
            <img
              src="/images/performance/campaign-worm-thumb-384.webp"
              alt="Hands holding rich worm castings"
              width={384}
              height={384}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </a>

          <a
            href={links.newsletter}
            onClick={() => recordClick("newsletter")}
            className="group grid min-h-40 grid-cols-[1fr_112px] overflow-hidden rounded-3xl bg-[#173d25] text-white shadow-[0_14px_34px_rgba(19,61,42,0.22)] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:scale-[0.99] sm:grid-cols-[1fr_155px]"
          >
            <span className="flex flex-col justify-center p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f5bb45]">
                <Sprout className="h-4 w-4" aria-hidden="true" /> Stay in the loop
              </span>
              <span className="mt-2 font-heading text-2xl font-bold leading-tight">Join our newsletter</span>
              <span className="mt-2 text-sm font-semibold text-[#dce7de]">Sign up to see what&apos;s going on</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-[#f5d77d]">
                Sign me up <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </span>
            <img
              src="/images/community/growing-garden-640.webp"
              alt="A planted garden with beds and growing vegetables"
              width={640}
              height={480}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </a>

          <a
            href={links.careers}
            onClick={() => recordClick("careers")}
            aria-label="Get hired. Apply to work with us."
            className="group grid min-h-36 grid-cols-[1fr_112px] overflow-hidden rounded-3xl border-2 border-[#d6b470] bg-gradient-to-br from-[#fff8e8] via-[#f3e0b5] to-[#dce8d6] text-[#133d2a] shadow-[0_12px_32px_rgba(87,62,29,0.16)] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:scale-[0.99] sm:grid-cols-[1fr_155px]"
          >
            <span className="flex flex-col justify-center p-5 sm:p-6">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7a552c]">
                <Briefcase className="h-4 w-4" aria-hidden="true" /> We&apos;re hiring
              </span>
              <span className="mt-2 font-heading text-2xl font-bold leading-tight">Get hired</span>
              <span className="mt-1 text-sm font-semibold text-[#526457]">Apply to work with us</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-[#133d2a]">
                See open roles <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </span>
            <span
              role="img"
              aria-label="A gardener holding soil in a planted bed"
              className="block h-full min-h-36 w-full bg-[length:auto_230%] bg-[position:100%_22%] bg-no-repeat"
              style={{ backgroundImage: "url(/images/recruitment/sales-representative-hiring-square-2026.webp)" }}
            />
          </a>
        </section>

        <footer className="mt-7 text-center text-xs leading-5 text-[#637166]">
          Phoenix, Arizona · Locally made for healthier soil
        </footer>
      </div>
    </div>
  );
}
