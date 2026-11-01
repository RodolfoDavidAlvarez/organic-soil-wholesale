import { Link } from "wouter";
import SEO from "@/components/layout/SEO";
import { Button } from "@/components/ui/button";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL, PHOENIX_YARD_ADDRESS, PHOENIX_YARD_DIRECTIONS_URL } from "@/config/contact";
import { buildLocalBusinessSchema, buildYardMapSchema } from "@/config/seo";
import { ArrowLeft, CheckCircle2, ExternalLink, Navigation, Phone } from "lucide-react";

const YardMap = () => {
  return (
    <>
      <SEO
        title="Phoenix Yard Pickup Map"
        description="Pickup directions for Organic Soil Wholesale at 1634 N 19th Ave, Phoenix. Enter through the Grand Ave south entrance."
        canonical="https://organicsoilwholesale.com/yard-map"
        structuredData={[buildLocalBusinessSchema(), buildYardMapSchema()]}
      />

      <section className="bg-stone-50 py-5 md:py-8">
        <div className="container mx-auto max-w-6xl px-4">
          <Link href="/products" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-[#264027]">
            <ArrowLeft className="h-4 w-4" />
            Back to products
          </Link>

          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-6">
              <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#438764]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Phoenix yard pickup
              </p>
              <h1 className="font-heading text-3xl font-bold leading-tight text-stone-950 md:text-4xl">
                Enter from Grand Ave.
              </h1>
              <p className="mt-3 text-base leading-relaxed text-stone-600">
                Use the south entrance on Grand Ave, then follow the yard lane toward the loading/check-in area.
              </p>

              <div className="mt-5 space-y-3">
                <DirectionStep n="1" title="Approach from Grand Ave" body="Stay on Grand Ave and look for the south yard entrance near the southwest side of the property." />
                <DirectionStep n="2" title="Turn into the yard entrance" body="Enter through the Grand Ave gate. Avoid using the N 19th Ave side unless staff directs you." />
                <DirectionStep n="3" title="Follow the marked lane" body="Continue inside and wait near the check-in/loading area for a representative." />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button asChild className="h-12 rounded-xl bg-[#438764] text-base font-bold text-white hover:bg-[#356f52]">
                  <a href={PHOENIX_YARD_DIRECTIONS_URL} target="_blank" rel="noreferrer">
                    <Navigation className="mr-2 h-5 w-5" />
                    Open directions
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-xl text-base font-bold">
                  <a
                    href={CUSTOMER_SUPPORT_PHONE_TEL}
                    data-official-support-phone="true"
                    data-callrail-ignore="true" data-calltrk-noswap="true"
                    data-dynamic-number-ignore="true"
                    data-call-tracking-ignore="true"
                    className="no-call-tracking"
                  >
                    <Phone className="mr-2 h-5 w-5" />
                    Call <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
                  </a>
                </Button>
              </div>

              <div className="mt-5 rounded-xl bg-stone-50 p-4 text-sm text-stone-700">
                <p className="font-bold text-stone-900">Address</p>
                <p className="mt-1">{PHOENIX_YARD_ADDRESS}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 p-4">
                <p className="text-sm font-bold text-stone-900">Yard entrance flow</p>
                <p className="mt-1 text-xs text-stone-500">Simplified map for pickup traffic. Follow the green route.</p>
              </div>
              <div className="bg-[#f7f4ee] p-3 md:p-5">
                <img
                  src="/email-assets/phoenix-yard-entrance-map-v2.png"
                  alt="Illustrated route map showing the Grand Avenue south entrance, yard lane, Organic Soil Wholesale pickup and loading area, and north exit"
                  className="h-auto w-full rounded-xl bg-[#efe9dc] shadow-inner"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">Pickup note</p>
            <p className="mt-1">
              For fastest loading, use the Grand Ave south entrance and keep the lane clear while waiting for a representative.
              <a className="ml-1 inline-flex items-center gap-1 font-bold underline-offset-2 hover:underline" href={PHOENIX_YARD_DIRECTIONS_URL} target="_blank" rel="noreferrer">
                Open Google Maps <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

function DirectionStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#264027] text-sm font-bold text-white">{n}</div>
      <div>
        <p className="font-bold text-stone-950">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-stone-600">{body}</p>
      </div>
    </div>
  );
}

export default YardMap;
