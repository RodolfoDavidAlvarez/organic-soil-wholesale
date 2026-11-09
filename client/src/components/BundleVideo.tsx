import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { bundleVideoEmbedUrl, bundleVideos } from "@/data/bundleVideos";

export function BundleVideo({ slug, title }: { slug: string; title: string }) {
  const container = useRef<HTMLElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const video = bundleVideos[slug];

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAutoplay(!reducedMotion.matches);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [slug]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    expandButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExpanded(false); expandButton.current?.focus(); }
      if (event.key === "Tab") {
        const items = container.current?.querySelectorAll<HTMLElement>('button, a[href], iframe');
        if (!items?.length) return;
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [expanded]);

  if (!video) return null;
  return (
    <section ref={container} className={`bo-video-inline${expanded ? " bo-video-expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={`${title} video walkthrough`}>
      <div className="bo-video-topbar">
        <div><span className="bo-video-eyebrow">See the bundle</span><h2>{title}</h2></div>
        <button ref={expandButton} type="button" className="bo-video-expand" onClick={() => setExpanded(value => !value)} aria-label={expanded ? "Close expanded video" : `Expand ${title} video`} aria-expanded={expanded}>
          {expanded ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          {expanded ? "Close" : "Expand"}
        </button>
      </div>
      <div className="bo-video-frame" style={{ backgroundImage: `url(${video.poster})` }}>
        {ready && <iframe
          key={video.youtubeId}
          src={bundleVideoEmbedUrl(video.youtubeId, autoplay)}
          title={`${title} product walkthrough`}
          width={720}
          height={1280}
          allow="autoplay; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />}
      </div>
      <div className="bo-video-copy">
        <span className="bo-video-duration">{video.duration} · Captions included</span>
        <p className="bo-video-hint">Starts muted. Turn on sound in the player.</p>
        <a className="bo-video-fallback" href={`https://www.youtube.com/watch?v=${video.youtubeId}`} target="_blank" rel="noopener noreferrer">
          Watch on YouTube<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </section>
  );
}
