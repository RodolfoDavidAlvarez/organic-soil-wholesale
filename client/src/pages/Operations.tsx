import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, MapPin, Phone, Play, X } from "lucide-react";
import SEO from "@/components/layout/SEO";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL, PHOENIX_YARD_DIRECTIONS_URL } from "@/config/contact";

const processSteps = [
  { title: "Start with known materials", text: "Dairy material and clean wood fiber are part of our foundation. Our wood fiber comes from our tree-care operations, giving those local materials another purpose." },
  { title: "Manage the composting", text: "Dairy material goes through months of managed composting. Heat, oxygen, moisture and time turn the original material into mature compost." },
  { title: "Put the worms to work", text: "Red wigglers work through prepared feed in our worm-production system. Airflow, irrigation and regular feeding help maintain their habitat." },
  { title: "Harvest and screen", text: "Moisture and feeding encourage the worms to move toward fresh material. Finished vermicompost is harvested and screened, and worms and cocoons return to production." },
  { title: "Blend for the growing job", text: "Compost, castings, wood fiber and selected mineral ingredients go into different products for different uses—from amending existing soil to growing mixes and surface mulch." },
  { title: "Get it to your garden", text: "Shop eligible bags and bundles for Phoenix pickup. For pallets, super sacks, bulk loads or delivery, our team helps confirm the material, quantity and logistics." },
];

const learningVideos = [
  { id: "1b7OBJPixgKs0bKzkmPG8tXHDMrET0pGk", title: "What worms do for soil", description: "A closer look at worms, castings and the living processes beneath our feet.", poster: "/images/performance/home-product-worm-480.webp", alt: "A close look at worm castings" },
  { id: "1T2Ip_XkqjhElRJ7UHtZ8CjulzaQt3xE4", title: "Meet the soil food web", description: "How plants, microbes and other soil organisms connect through nutrients and energy.", poster: "/images/community/seedling-800.webp", alt: "A young plant growing in soil" },
  { id: "11Eseix7wtLqwT7t4-3mZldW0Lke2D6Go", title: "Organic matter, water and life", description: "How decomposition and nutrient cycling fit into the bigger soil picture.", poster: "/images/community/cyanobacteria-closeup-800.webp", alt: "A close look at the water in our cyanobacteria tanks" },
];

type ProcessVideoProps = { id: string; title: string; poster: string; alt: string; posterSrcSet?: string; posterSizes?: string };

function ProcessVideo({ id, title, poster, alt, posterSrcSet, posterSizes }: ProcessVideoProps) {
  const [playing, setPlaying] = useState(false);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const wasPlaying = useRef(false);

  useEffect(() => {
    if (playing) playerRef.current?.focus();
    else if (wasPlaying.current) playButtonRef.current?.focus();
    wasPlaying.current = playing;
  }, [playing]);
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#182e22]">
        {playing ? (
          <iframe ref={playerRef} tabIndex={0} src={`https://drive.google.com/file/d/${id}/preview?autoplay=1`} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 h-full w-full border-0" />
        ) : (
          <button ref={playButtonRef} type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className="group absolute inset-0 h-full w-full text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-[#e4c18c]">
            <img src={poster} srcSet={posterSrcSet} sizes={posterSizes} alt={alt} width="800" height="450" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-75 transition-opacity group-hover:opacity-60" />
            <span className="absolute inset-0 bg-gradient-to-t from-[#102318]/85 via-transparent to-transparent" aria-hidden="true" />
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f0dfc7] text-[#264027] shadow-lg"><Play className="ml-1 h-6 w-6" fill="currentColor" /></span></span>
            <span className="absolute bottom-4 left-4 text-xs font-semibold">Watch the video</span>
          </button>
        )}
      </div>
      {playing && <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#626b5d]"><button type="button" onClick={() => setPlaying(false)} className="inline-flex min-h-11 items-center gap-1 font-semibold"><X className="h-3.5 w-3.5" />Close video</button><a href={`https://drive.google.com/file/d/${id}/view`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1">Open video in a new tab <ArrowUpRight className="h-3.5 w-3.5" /></a></div>}
    </div>
  );
}

export default function Operations() {
  return (
    <>
      <SEO title="Our Operations: From Compost to Your Garden" description="See how Soil Seed & Water brings together dairy composting, worm production, soil blending and Phoenix pickup. Explore our process and educational videos." canonical="https://organicsoilwholesale.com/operations" ogImage="https://organicsoilwholesale.com/images/operations/compost-windrows-1200.webp" />

      <section aria-labelledby="operations-heading" className="bg-[#f7f5ef] px-5 py-8 text-[#264027] sm:px-8 lg:py-14">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[.9fr_1.1fr] lg:gap-12">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#895335]">Our operations · Soil Seed &amp; Water</p>
            <h1 id="operations-heading" className="mt-4 font-heading text-[38px] font-semibold leading-[1.08] tracking-[-0.05em] sm:text-5xl lg:text-[56px]">Good soil starts<br />with how <span className="text-[#a44f35]">it’s made.</span></h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#626b5d]">Know the ingredients. See the process. Choose what belongs in your garden.</p>
            <p className="mt-3 max-w-lg text-sm leading-7 text-[#626b5d]">Here’s how our composting, worm production and blending come together to make soil amendments for Arizona growers.</p>
            <div className="mt-6 flex flex-wrap gap-3"><a href="#worm-production" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#264027] px-5 text-sm font-semibold text-white hover:bg-[#3c5233]"><Play className="h-4 w-4" />See the process</a><Link href="/products" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-[#ddc18f] bg-[#f3e4c9] px-5 text-sm font-semibold hover:bg-[#ecd7b1]">Shop the products <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
          <figure>
            <img src="/images/operations/compost-windrows-1200.webp" srcSet="/images/operations/compost-windrows-640.webp 640w, /images/operations/compost-windrows-1200.webp 1200w" sizes="(min-width: 1280px) 650px, (min-width: 1024px) 55vw, 100vw" alt="Rows of maturing compost at our Arizona operation" width="1200" height="900" fetchPriority="high" loading="eager" decoding="async" className="aspect-[4/3] w-full rounded-xl object-cover" />
            <figcaption className="mt-2 text-xs leading-5 text-[#626b5d]">Our compost windrows. Real material, given time and care.</figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="source-heading" className="bg-[#263c2a] px-5 py-9 text-[#f6f3e9] sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-[1fr_1.2fr] md:gap-12">
          <h2 id="source-heading" className="font-heading text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">Know your source.<br />Know your process.<br /><span className="text-[#e4c18c]">Know your soil.</span></h2>
          <div className="space-y-3 text-sm leading-7 text-[#d8dfd0]"><p>We believe regenerative agriculture starts with the materials we choose and how we manage them. Composting gives local organic resources a useful role in the soil again.</p><p>Dairy compost, clean wood fiber and worm castings each have a job. We bring them together with attention to microbiology, plant nutrition and physical structure—including how soil holds water and air.</p></div>
        </div>
      </section>

      <section id="worm-production" aria-labelledby="worm-heading" className="scroll-mt-24 bg-[#efeee5] px-5 py-12 text-[#264027] sm:px-8 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#895335]">Inside the process</p><h2 id="worm-heading" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] lg:text-4xl">How we make worm compost.</h2></div><p className="max-w-sm text-sm leading-6 text-[#626b5d]">An animated walkthrough of the production system at our Congress, Arizona operation.</p></div>
          <div className="grid gap-7 lg:grid-cols-[1.4fr_.6fr] lg:items-center lg:gap-10">
            <ProcessVideo id="1_fu2NbHXrrYXod6YHaXJQXceWuF3ikvf" title="How we make worm compost" poster="/images/operations/worm-facility-1200.webp" posterSrcSet="/images/operations/worm-facility-640.webp 640w, /images/operations/worm-facility-1200.webp 1200w" posterSizes="(min-width: 1280px) 870px, (min-width: 1024px) 70vw, 100vw" alt="An aerial view of our covered worm-production facility" />
            <div><h3 className="text-xl font-semibold">A living production cycle.</h3><ul className="mt-4 space-y-4 text-sm leading-6 text-[#626b5d]"><li><strong className="text-[#264027]">Feed &amp; care.</strong> Prepared feed, airflow and moisture support the red wigglers.</li><li><strong className="text-[#264027]">Guide &amp; harvest.</strong> Feeding and irrigation help move worms toward fresh material.</li><li><strong className="text-[#264027]">Screen &amp; return.</strong> Finished vermicompost is separated, while worms and cocoons return to the system.</li></ul><Link href="/products/mikeys-worm-poop" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#895335]">Shop Mikey’s Worm Poop <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="steps-heading" className="bg-[#f7f5ef] px-5 py-12 text-[#264027] sm:px-8 lg:py-16">
        <div className="mx-auto max-w-7xl"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#895335]">From local materials to your growing space</p><h2 id="steps-heading" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] lg:text-4xl">How it all comes together.</h2><ol className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">{processSteps.map((step, index) => <li key={step.title} className="border-t border-[#d8d9cb] pt-5"><span className="text-xs font-semibold text-[#a44f35]" aria-hidden="true">0{index + 1}</span><h3 className="mt-2 text-lg font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-7 text-[#626b5d]">{step.text}</p></li>)}</ol></div>
      </section>

      <section aria-labelledby="biology-heading" className="bg-[#e8eee5] px-5 py-12 text-[#264027] sm:px-8 lg:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="grid grid-cols-2 gap-3"><figure><img src="/images/operations/compost-processing-800.webp" srcSet="/images/operations/compost-processing-480.webp 480w, /images/operations/compost-processing-800.webp 800w" sizes="(min-width: 1024px) 25vw, 50vw" alt="Compost moving through processing machinery at our operation" width="800" height="533" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-xl object-cover" /><figcaption className="mt-2 text-xs leading-5 text-[#536357]">Working the material.</figcaption></figure><figure className="pt-7"><img src="/images/community/cyanobacteria-tanks-800.webp" srcSet="/images/community/cyanobacteria-tanks-480.webp 480w, /images/community/cyanobacteria-tanks-800.webp 800w" sizes="(min-width: 1024px) 25vw, 50vw" alt="Our cyanobacteria tanks and connected watering equipment viewed from above" width="800" height="533" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-xl object-cover" /><figcaption className="mt-2 text-xs leading-5 text-[#536357]">A closer look at our watering system.</figcaption></figure></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#536e64]">Biology is part of the work</p><h2 id="biology-heading" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] lg:text-4xl">More than a pile of material.</h2><p className="mt-5 text-sm leading-7 text-[#536357]">Our composting process brings organic material, moisture, oxygen and time together. We also add cyanobacteria—often called blue-green algae—to the water used on our dairy-compost windrows.</p><p className="mt-3 text-sm leading-7 text-[#536357]">The goal is soil that functions: a home for living organisms, a source of organic matter and nutrients, and a structure that supports roots, water and air.</p><Link href="/products/simons-gold" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold">Explore Simon’s Gold dairy compost <ArrowRight className="h-4 w-4" /></Link></div>
        </div>
      </section>

      <section aria-labelledby="learn-heading" className="bg-[#f7f5ef] px-5 py-12 text-[#264027] sm:px-8 lg:py-16">
        <div className="mx-auto max-w-7xl"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#895335]">Understand what you’re putting in the ground</p><h2 id="learn-heading" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em]">A closer look at living soil.</h2><p className="mt-3 text-sm leading-7 text-[#626b5d]">Short educational animations about worms, microbes and nutrient cycling.</p><div className="mt-7 grid gap-7 md:grid-cols-3">{learningVideos.map((video) => <article key={video.id}><ProcessVideo {...video} /><h3 className="mt-4 text-lg font-semibold">{video.title}</h3><p className="mt-2 text-sm leading-6 text-[#626b5d]">{video.description}</p></article>)}</div></div>
      </section>

      <section aria-labelledby="pickup-heading" className="bg-[#263c2a] px-5 py-12 text-[#f6f3e9] sm:px-8 lg:py-14"><div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_.8fr] md:items-center"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e4c18c]">Made with care. Ready for your project.</p><h2 id="pickup-heading" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em]">Put good soil to work.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-[#d8dfd0]">Pick up bags and bundles at our Phoenix yard. For production-site visits, larger loads or delivery, call first so we can confirm the right location and arrangements.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/products" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#f0dfc7] px-5 text-sm font-semibold text-[#264027] hover:bg-[#e8d0af]">Shop soil &amp; amendments <ArrowRight className="h-4 w-4" /></Link><a href={CUSTOMER_SUPPORT_PHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`} data-official-support-phone="true" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-white/30 px-4 text-sm font-semibold"><Phone className="h-4 w-4" />{CUSTOMER_SUPPORT_PHONE_DISPLAY}</a></div></div><div className="border-t border-[#6a7b60] pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0"><h3 className="text-lg font-semibold">Phoenix pickup yard</h3><p className="mt-3 text-sm leading-7 text-[#d8dfd0]">1634 N 19th Ave<br />Phoenix, AZ 85009</p><a href={PHOENIX_YARD_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#e4c18c]"><MapPin className="h-4 w-4" />Get pickup directions <ArrowUpRight className="h-4 w-4" /></a></div></div></section>
    </>
  );
}
