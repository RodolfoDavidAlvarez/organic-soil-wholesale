import { useEffect, useState, type ReactNode } from "react";
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

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a]";

type PhotoCardProps = {
  href: string;
  onClick: () => void;
  ariaLabel?: string;
  shellClass: string;
  eyebrowClass: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail?: string;
  detailClass?: string;
  action: string;
  actionClass: string;
  image: ReactNode;
};

function PhotoCard({
  href,
  onClick,
  ariaLabel,
  shellClass,
  eyebrowClass,
  icon,
  eyebrow,
  title,
  detail,
  detailClass = "",
  action,
  actionClass,
  image,
}: PhotoCardProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`group grid min-h-[8.75rem] grid-cols-[1fr_6.75rem] overflow-hidden rounded-3xl shadow-[0_12px_32px_rgba(19,61,42,0.16)] transition duration-200 [-webkit-tap-highlight-color:transparent] active:scale-[0.985] sm:min-h-36 sm:grid-cols-[1fr_9.25rem] ${focusRing} ${shellClass}`}
    >
      <span className="flex min-w-0 flex-col justify-center px-4 py-4 sm:px-6 sm:py-5">
        <span className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] ${eyebrowClass}`}>
          {icon}
          {eyebrow}
        </span>
        <span className="mt-1.5 text-balance font-heading text-[1.35rem] font-bold leading-[1.15] sm:text-2xl">{title}</span>
        {detail ? <span className={`mt-1.5 text-pretty text-sm font-semibold leading-5 ${detailClass}`}>{detail}</span> : null}
        <span className={`mt-2.5 flex items-center gap-1.5 text-sm font-bold ${actionClass}`}>
          {action}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
      {image}
    </a>
  );
}

export default function InstagramLinks() {
  const channel = channelFromPath(window.location.pathname);
  const channelName = channelDetails[channel].name;
  const [buyLocalOpen, setBuyLocalOpen] = useState(false);
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

      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
        <header className="text-center">
          <img
            src="/images/soil-seed-and-water-logo.png"
            alt="Soil Seed & Water"
            width={2083}
            height={729}
            decoding="async"
            className="mx-auto -mb-1 h-[4.5rem] w-auto max-w-full object-contain sm:h-20"
          />
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8b6940]">Welcome, {channelName} friends</p>
          <h1 className="mt-2 font-heading text-[1.85rem] font-bold leading-[1.05] tracking-[-0.02em] text-[#133d2a] sm:text-4xl">
            <span className="block">What would you</span>
            <span className="block">like to do?</span>
          </h1>
          <p className="mt-3 text-sm leading-5 text-[#4f6255] sm:text-base sm:leading-6">
            <span className="block">Shop local, see what’s on,</span>
            <span className="block">or come work with us.</span>
          </p>
        </header>

        <section className="mt-6 space-y-3" aria-label="Featured links">
          <div className="overflow-hidden rounded-3xl border-2 border-[#d6b470] bg-[#fff8e8] shadow-[0_12px_32px_rgba(87,62,29,0.12)]">
            <button
              type="button"
              aria-expanded={buyLocalOpen}
              aria-controls="buy-local-options"
              onClick={() => setBuyLocalOpen((open) => !open)}
              className={`block w-full text-left [-webkit-tap-highlight-color:transparent] active:bg-[#fff3dc] ${focusRing}`}
            >
              <img
                src="/images/community/garden-harvest-480.webp"
                srcSet="/images/community/garden-harvest-480.webp 480w, /images/community/garden-harvest-800.webp 800w"
                sizes="(max-width: 575px) calc(100vw - 2rem), 528px"
                width={800}
                height={600}
                alt="A ripe cucumber growing in dark garden soil"
                decoding="async"
                fetchPriority="high"
                className="aspect-[2/1] w-full object-cover object-[18%_center]"
              />
              <span className="flex flex-col px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b6940]">Phoenix yard or online</span>
                <span className="mt-1.5 font-heading text-[1.7rem] font-bold leading-none tracking-[-0.02em] text-[#133d2a] sm:text-[1.85rem]">Buy Local</span>
                <span className="mt-2 text-pretty text-sm leading-5 text-[#4f6255]">Pick up at the yard, or shop the online store.</span>
                <span className="mt-3.5 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-[#264027] px-4 text-sm font-bold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)] transition active:bg-[#1b301c]">
                  Choose where to buy
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ease-out ${buyLocalOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </span>
              </span>
            </button>

            <div
              id="buy-local-options"
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${buyLocalOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className={`overflow-hidden motion-reduce:transition-none ${buyLocalOpen ? "" : "pointer-events-none"}`} inert={!buyLocalOpen}>
                <div className={`space-y-2.5 px-4 pb-4 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:px-5 sm:pb-5 ${buyLocalOpen ? "opacity-100 delay-75" : "opacity-0"}`}>
                  <a
                    href={links.organicSoil}
                    onClick={() => recordClick("organic-soil-wholesale")}
                    aria-label="Shop Organic Soil Wholesale for local soil sales"
                    className={`group/store flex min-h-[6.25rem] items-center gap-3 rounded-2xl border-2 border-[#9fbb93] bg-[#dce8d6] px-4 py-3 shadow-[0_8px_22px_rgba(19,61,42,0.08)] transition duration-200 [-webkit-tap-highlight-color:transparent] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(19,61,42,0.14)] active:translate-y-0 active:bg-[#d3e3cc] ${focusRing}`}
                  >
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block font-heading text-[1.05rem] font-bold leading-[1.15] text-[#20251f]">
                        Organic <span className="text-[#215330]">Soil</span>
                        <span className="mt-0.5 block font-heading text-[1.05rem] italic leading-none text-[#8f7000]">Wholesale</span>
                      </span>
                      <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.14em] text-[#6b746c]">by Soil Seed &amp; Water</span>
                      <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#133d2a] shadow-sm">Local soil sales</span>
                    </span>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#133d2a] text-white shadow-sm">
                      <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover/store:translate-x-1" aria-hidden="true" />
                    </span>
                  </a>
                  <a
                    href={links.soilSeedWater}
                    onClick={() => recordClick("soil-seed-and-water")}
                    aria-label="Visit the Soil Seed and Water e-commerce online store"
                    className={`group/store flex min-h-[6.25rem] items-center gap-3 rounded-2xl border-2 border-[#d6b470] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(87,62,29,0.08)] transition duration-200 [-webkit-tap-highlight-color:transparent] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(87,62,29,0.14)] active:translate-y-0 active:bg-[#fff8e8] ${focusRing}`}
                  >
                    <span className="min-w-0 flex-1">
                      <img src="/images/soil-seed-and-water-logo.png" alt="" width={2083} height={729} className="h-12 w-auto max-w-[12.5rem] object-contain object-left" />
                      <span className="mt-1.5 inline-flex rounded-full bg-[#f4e6c6] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#6d4c25]">E-commerce / online store</span>
                    </span>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8b6940] text-white shadow-sm">
                      <ExternalLink className="h-5 w-5 transition-transform duration-200 group-hover/store:-translate-y-0.5 group-hover/store:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <PhotoCard
            href={links.deals}
            onClick={() => recordClick("current-deals")}
            shellClass="bg-[#133d2a] text-white"
            eyebrowClass="text-[#f0d498]"
            icon={<Gift className="h-4 w-4 shrink-0" aria-hidden="true" />}
            eyebrow="Current offers"
            title="See Current Deals"
            action="Shop deals"
            actionClass="text-[#f8edcf]"
            image={
              <img
                src="/images/performance/campaign-worm-thumb-384.webp"
                alt=""
                width={384}
                height={384}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            }
          />

          <PhotoCard
            href={links.newsletter}
            onClick={() => recordClick("newsletter")}
            shellClass="border-2 border-[#d6b470] bg-white text-[#133d2a] shadow-[0_10px_26px_rgba(87,62,29,0.1)]"
            eyebrowClass="text-[#8b6940]"
            icon={<Sprout className="h-4 w-4 shrink-0" aria-hidden="true" />}
            eyebrow="Stay in the loop"
            title="Join our newsletter"
            detail="Sign up to see what's going on"
            detailClass="font-medium text-[#526457]"
            action="Sign me up"
            actionClass="text-[#133d2a]"
            image={
              <img
                src="/images/community/seedling-800.webp"
                alt=""
                width={800}
                height={533}
                loading="lazy"
                className="h-full w-full object-cover object-[center_60%]"
              />
            }
          />

          <PhotoCard
            href={links.careers}
            onClick={() => recordClick("careers")}
            ariaLabel="Get hired. Apply to work with us."
            shellClass="border-2 border-[#d6b470] bg-gradient-to-br from-[#fff8e8] via-[#f3e0b5] to-[#dce8d6] text-[#133d2a] shadow-[0_12px_32px_rgba(87,62,29,0.16)]"
            eyebrowClass="text-[#7a552c]"
            icon={<Briefcase className="h-4 w-4 shrink-0" aria-hidden="true" />}
            eyebrow="We're hiring"
            title="Get hired"
            detail="Apply to work with us"
            detailClass="font-medium text-[#526457]"
            action="See open roles"
            actionClass="text-[#133d2a]"
            image={
              <span className="relative block h-full min-h-full overflow-hidden">
                <img
                  src="/images/recruitment/sales-representative-hiring-square-2026.webp"
                  alt=""
                  width={1254}
                  height={1254}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full origin-[92%_24%] scale-[2.15] object-cover object-[92%_24%]"
                />
              </span>
            }
          />
        </section>

        <footer className="mt-6 text-center text-xs leading-5 text-[#637166]">
          Phoenix, Arizona · Locally made for healthier soil
        </footer>
      </div>
    </div>
  );
}
