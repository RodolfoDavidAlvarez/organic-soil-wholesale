import { useState } from "react";
import { Play, X } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { bundleVideos } from "@/data/bundleVideos";

export function BundleVideo({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const video = bundleVideos[slug];
  if (!video) return null;
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
        {open && <video key={video.src} controls playsInline autoPlay preload="metadata" poster={video.poster} aria-label={`${title} product walkthrough`}>
          <source src={video.src} type="video/mp4" />
          <track kind="captions" src={video.captions} srcLang="en" label="English" />
          Your browser does not support video. <a href={video.src}>Open the video</a>.
        </video>}
      </DialogContent>
    </Dialog>
  );
}
