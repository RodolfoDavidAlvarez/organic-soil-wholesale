import { useEffect } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Phone, ShoppingBag, Tag } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import {
  CUSTOMER_SUPPORT_PHONE_DIAL,
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
} from "@/config/contact";

export default function ExpiredAugustGift() {
  useEffect(() => {
    trackEvent("Expired Offer Viewed", {
      path: window.location.pathname,
      campaign: "free-worm-castings-2026-08",
    });
  }, []);

  return (
    <main className="min-h-[calc(100vh-var(--app-header-height,5rem))] bg-[#f7f6f0] px-4 py-10 sm:py-16">
      <Helmet>
        <title>This offer is no longer available | Organic Soil Wholesale</title>
        <meta
          name="description"
          content="The August free worm castings community gift has ended. Browse current Phoenix pickup deals or products."
        />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://organicsoilwholesale.com/free-worm-castings" />
      </Helmet>

      <div className="mx-auto w-full max-w-lg rounded-[1.75rem] border border-[#d8e1d4] bg-white px-5 py-8 text-center shadow-[0_20px_60px_rgba(28,62,36,0.10)] sm:px-8 sm:py-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a6f39]">August community gift</p>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight text-[#183a23] sm:text-4xl">
          This offer is no longer available
        </h1>
        <p className="mt-4 text-base leading-7 text-[#5b665d]">
          The free 9-lb worm castings gift ran August 1–31, 2026. Public signup and new claims are closed.
        </p>
        <p className="mt-3 text-sm leading-6 text-[#5b665d]">
          Current Phoenix pickup deals are on the Deals page.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <Link href="/offers">
            <a className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#214a2c] px-5 text-base font-bold text-white transition hover:bg-[#17381f]">
              <Tag className="h-4 w-4" /> See current deals
            </a>
          </Link>
          <Link href="/products">
            <a className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#214a2c] bg-white px-5 text-base font-bold text-[#214a2c] transition hover:bg-[#f7f3ea]">
              <ShoppingBag className="h-4 w-4" /> Browse products
            </a>
          </Link>
          <a
            href={CUSTOMER_SUPPORT_PHONE_TEL}
            aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
            data-official-support-phone="true"
            data-phone-number={CUSTOMER_SUPPORT_PHONE_DIAL}
            data-callrail-ignore="true" data-calltrk-noswap="true"
            data-dynamic-number-ignore="true"
            data-call-tracking-ignore="true"
            className="no-call-tracking inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#d8e1d4] bg-[#f6f7f3] px-5 text-base font-bold text-[#214a2c]"
          >
            <Phone className="h-4 w-4" /> Call <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
          </a>
        </div>

        <Link href="/">
          <a className="mt-5 inline-flex min-h-11 items-center justify-center text-sm font-semibold text-[#5b665d] underline-offset-4 hover:underline">
            Back to home
          </a>
        </Link>
      </div>
    </main>
  );
}
