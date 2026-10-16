import { ArrowRight } from 'lucide-react';
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from '@/config/contact';

export default function GardenBedLaunchCard() {
  return <section aria-labelledby="garden-bed-launch" className="mx-auto my-8 max-w-7xl px-4 sm:px-8">
    <div className="grid overflow-hidden rounded-3xl bg-[#264027] text-white md:grid-cols-[.85fr_1.15fr]">
      <img src="/garden-bed/bundle.jpg" width={1200} height={800} alt="Illustration of the raised garden bed bundle with soil bags, mulch and pea gravel totes" loading="lazy" decoding="async" className="aspect-[3/2] h-full w-full self-center bg-[#ece8dc] object-contain" />
      <div className="flex flex-col justify-center p-6 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-[#efd29d]">The full garden bundle · Giveaway community offer</p>
        <h2 id="garden-bed-launch" className="mt-3 font-heading text-3xl font-bold">Your next garden starts here.</h2>
        <p className="mt-3 text-white/80">A 4 × 8 ft raised bed, 2 ft deep, plus the materials to fill it: raw mulch, pea gravel, potting soil, Nature’s Blanket, worm castings and dairy compost. Hardware, setup instructions and assembly video included.</p>
        <p className="mt-4 text-3xl font-bold">$945.43 <span className="text-sm font-normal text-white/75">pay in full, plus tax</span></p>
        <p className="mt-2 text-sm text-white/80">Or choose three monthly payments · $1,039.87 total, plus tax.</p>
        <p className="mt-4 text-sm font-semibold text-[#efd29d]">Free Arizona delivery in November 2026 only.</p>
        <p className="mt-4 text-sm text-white/90">Use your personal giveaway offer link to pay. Need your link? Our team can help.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href="/garden-bed-offer.html" className="inline-flex min-h-12 w-fit items-center gap-3 rounded-xl bg-[#f2d9a4] px-5 py-3 font-semibold text-[#264027] hover:bg-[#f8e6c4]">View bundle &amp; payment options <ArrowRight className="h-4 w-4 shrink-0" /></a>
          <a href={CUSTOMER_SUPPORT_PHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY} for your garden bundle offer link`} className="inline-flex min-h-12 items-center rounded-xl border border-white/35 px-5 py-3 font-semibold hover:bg-white/10">Call for your offer link</a>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/75">Package illustration; assembly, plants, irrigation and shade accessories are not included.</p>
      </div>
    </div>
  </section>;
}
