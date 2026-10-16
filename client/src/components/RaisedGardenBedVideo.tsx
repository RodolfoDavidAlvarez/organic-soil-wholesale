export default function RaisedGardenBedVideo() {
  return (
    <figure className="mt-6 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-5 rounded-xl border border-[#d9dece] bg-white p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6 sm:p-5">
      <video
        controls
        playsInline
        preload="none"
        poster="/garden-bed/large-raised-garden-bed-4x8-poster.webp"
        width={480}
        height={848}
        aria-label="Large 4x8 ft Raised Garden Bed"
        className="aspect-[30/53] w-full rounded-lg bg-[#17291c] object-contain"
      >
        <source
          src="/garden-bed/large-raised-garden-bed-4x8.mp4"
          type="video/mp4"
        />
        <a href="/garden-bed/large-raised-garden-bed-4x8.mp4">
          Watch the raised garden bed video
        </a>
        .
      </video>
      <figcaption>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9b573b]">
          See the bed up close · 23 sec
        </p>
        <h3 className="mt-2 font-heading text-lg font-semibold leading-snug tracking-[-0.025em] sm:text-xl">
          Large 4x8 ft Raised Garden Bed
        </h3>
        <p className="mt-3 text-xs leading-6 text-[#626b5d]">
          A closer look at the wood panels, steel corners and roomy planting
          space.
        </p>
        <p className="mt-2 text-[10px] leading-5 text-[#626b5d]">
          Shade accessories, plants and assembly are not included.
        </p>
      </figcaption>
    </figure>
  );
}
