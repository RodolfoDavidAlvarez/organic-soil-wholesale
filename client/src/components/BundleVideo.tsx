import { useState } from "react";
import { Play, X } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { bundleVideoEmbedUrl, bundleVideos } from "@/data/bundleVideos";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BundleVideo({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const video = bundleVideos[slug];
  if (!video) return null;
  const embedUrl = open ? bundleVideoEmbedUrl(video.youtubeId, !prefersReducedMotion()) : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="bo-video-trigger" aria-label={`Watch the ${title} walkthrough`}>
          <img src={video.poster} alt="" width={48} height={72} loading="lazy" />
          <span className="bo-video-play"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
          <span><strong>Watch the walkthrough</strong><small>See every product · {video.duration}</small></span>
        </button>
      </DialogTrigger>
      <DialogContent className="bo-video-dialog" hideCloseButton>
        <div className="bo-video-heading">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose aria-label="Close video"><X size={22} aria-hidden="true" /></DialogClose>
        </div>
        <DialogDescription className="sr-only">Vanessa walks through the bundle. Captions are included in the video.</DialogDescription>
        {embedUrl && (
          <div className="bo-video-frame">
            <iframe
              key={embedUrl}
              src={embedUrl}
              title={`${title} product walkthrough`}
              width={720}
              height={1280}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
