import { useEffect } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { trackEvent } from "@/lib/analytics";

type SocialChannel = "instagram" | "facebook" | "tiktok" | "youtube";

const channelDetails: Record<SocialChannel, { utmSource: string }> = {
  instagram: { utmSource: "instagram" },
  facebook: { utmSource: "facebook" },
  tiktok: { utmSource: "tiktok" },
  youtube: { utmSource: "youtube" },
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

const actionClass =
  "flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:bg-[#0e2c1e] [@media(hover:hover)]:hover:bg-[#1b4d34]";

type ActionLinkProps = {
  href: string;
  title: string;
  detail?: string;
  onClick: () => void;
};

function ActionLink({ href, title, detail, onClick }: ActionLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`${actionClass} rounded-2xl bg-[#133d2a] shadow-[0_8px_20px_rgba(19,61,42,0.12)]`}
    >
      <span className="min-w-0">
        <span className="block font-heading text-lg font-bold leading-tight">{title}</span>
        {detail ? <span className="mt-1 block text-sm font-medium leading-5 text-[#f3e6c4]">{detail}</span> : null}
      </span>
      <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
    </a>
  );
}

export default function InstagramLinks() {
  const channel = channelFromPath(window.location.pathname);
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
        <title>Soil Seed &amp; Water</title>
        <meta
          name="description"
          content="Buy local, see current deals, join the newsletter, or apply to work with Soil Seed & Water."
        />
      </Helmet>

      <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-12 pt-10">
        <header className="flex justify-center">
          <h1>
            <img
              src="/images/soil-seed-and-water-logo.png"
              alt="Soil Seed & Water"
              width={2083}
              height={729}
              decoding="async"
              className="h-auto w-52 max-w-full"
            />
          </h1>
        </header>

        <nav aria-label="What to do next" className="mt-8 flex flex-col gap-3">
          <details className="group overflow-hidden rounded-2xl bg-[#133d2a] shadow-[0_8px_20px_rgba(19,61,42,0.12)]">
            <summary className={`${actionClass} cursor-pointer list-none rounded-2xl [&::-webkit-details-marker]:hidden`}>
              <span className="font-heading text-lg font-bold leading-tight">Buy Local</span>
              <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-2 bg-[#fff8e8] p-2.5">
              <a
                href={links.organicSoil}
                onClick={() => recordClick("organic-soil-wholesale")}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 font-heading text-base font-bold text-[#133d2a] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:bg-[#f4f0e3]"
              >
                Organic Soil Wholesale
                <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              </a>
              <a
                href={links.soilSeedWater}
                onClick={() => recordClick("soil-seed-and-water")}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-[#133d2a] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a15a] active:bg-[#f4f0e3]"
              >
                <span className="min-w-0">
                  <span className="block font-heading text-base font-bold leading-tight">Soil Seed &amp; Water</span>
                  <span className="mt-0.5 block text-sm font-semibold leading-5 text-[#8b6940]">E-commerce / online store</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </details>

          <ActionLink href={links.deals} title="See Current Deals" onClick={() => recordClick("current-deals")} />
          <ActionLink
            href={links.newsletter}
            title="Join our newsletter"
            detail="Sign up to see what's going on"
            onClick={() => recordClick("newsletter")}
          />
          <ActionLink
            href={links.careers}
            title="Get hired"
            detail="Apply to work with us"
            onClick={() => recordClick("careers")}
          />
        </nav>
      </div>
    </div>
  );
}
