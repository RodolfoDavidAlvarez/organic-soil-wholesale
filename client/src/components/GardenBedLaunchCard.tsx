import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { GARDEN_BED } from '@shared/gardenBedOrders.js';

export default function GardenBedLaunchCard() {
  return <section aria-labelledby="garden-bed-launch" className="mx-auto my-8 max-w-7xl px-4 sm:px-8">
    <div className="grid overflow-hidden rounded-3xl bg-[#264027] text-white md:grid-cols-[.85fr_1.15fr]">
      <img src={GARDEN_BED.image} width={1200} height={800} alt="Wood and steel garden bed concept" loading="lazy" className="aspect-[4/3] h-full w-full bg-[#ece8dc] object-contain p-4 md:max-h-96" />
      <div className="flex flex-col justify-center p-6 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-[#efd29d]">New · Taking orders for a limited time</p>
        <h2 id="garden-bed-launch" className="mt-3 font-heading text-3xl font-bold">Your next garden starts here.</h2>
        <p className="mt-3 text-white/80">4 × 8 ft garden bed kit. Four steel posts, lumber, pea gravel, and soil cloth.</p>
        <p className="mt-4 text-3xl font-bold">$599 <span className="text-sm font-normal text-white/75">per bed</span></p>
        <p className="mt-2 text-xs leading-relaxed text-white/70">Delivery, assembly, soil, mulch, and soil amendments sold separately. Tax extra. Concept image; plants and accessories not included.</p>
        <Link href="/products/garden-bed-kit" className="mt-6 inline-flex min-h-12 w-fit items-center gap-3 rounded-xl bg-[#f2d9a4] px-5 font-semibold text-[#264027] hover:bg-[#f8e6c4]">Explore &amp; request your bed <ArrowRight className="h-4 w-4" /></Link>
        <p className="mt-3 text-xs text-white/75">Choose your quantity. No payment required today.</p>
      </div>
    </div>
  </section>;
}
