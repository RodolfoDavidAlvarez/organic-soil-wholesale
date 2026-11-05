export interface BundleVideoSource {
  youtubeId: string;
  poster: string;
  duration: string;
}

/**
 * Unlisted Soil Seed & Water walkthroughs. The page embeds these ids;
 * the local MP4 copies stay in public/ and are not requested.
 */
export const bundleVideos: Record<string, BundleVideoSource> = {
  "garden-refresh": {
    youtubeId: "w0XoOh8t5vQ",
    poster: "/videos/bundles/garden-refresh-poster.jpg",
    duration: "1:21",
  },
  "garden-refresh-plus": {
    youtubeId: "pTmJRLgJZYw",
    poster: "/videos/bundles/garden-refresh-plus-poster.jpg",
    duration: "2:04",
  },
  "big-garden-setup": {
    youtubeId: "kWwvyyMVqnk",
    poster: "/videos/bundles/big-garden-setup-poster.jpg",
    duration: "1:31",
  },
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function bundleVideoEmbedUrl(youtubeId: string, autoplay = true): string {
  if (!YOUTUBE_ID.test(youtubeId)) {
    throw new Error("Invalid YouTube video id");
  }
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`;
}
