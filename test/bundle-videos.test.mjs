import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bundleVideoEmbedUrl, bundleVideos } from "../client/src/data/bundleVideos.ts";

const expected = {
  "garden-refresh": "w0XoOh8t5vQ",
  "garden-refresh-plus": "pTmJRLgJZYw",
  "big-garden-setup": "kWwvyyMVqnk",
};

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("garden bundle pages map to the unlisted YouTube walkthroughs", () => {
  assert.deepEqual(Object.keys(bundleVideos).sort(), Object.keys(expected).sort());
  for (const [slug, youtubeId] of Object.entries(expected)) {
    assert.equal(bundleVideos[slug].youtubeId, youtubeId);
    assert.equal(bundleVideos[slug].src, undefined);
    assert.equal(bundleVideos[slug].captions, undefined);
    const url = new URL(bundleVideoEmbedUrl(youtubeId, true));
    assert.equal(url.origin, "https://www.youtube-nocookie.com");
    assert.equal(url.pathname, `/embed/${youtubeId}`);
    assert.equal(url.searchParams.get("autoplay"), "1");
    assert.equal(url.searchParams.get("playsinline"), "1");
    assert.equal(url.searchParams.get("rel"), "0");
    assert.equal(url.searchParams.get("modestbranding"), "1");
  }

  const quiet = new URL(bundleVideoEmbedUrl(expected["garden-refresh"], false));
  assert.equal(quiet.searchParams.get("autoplay"), null);
  assert.throws(() => bundleVideoEmbedUrl("not-an-id", true), /Invalid YouTube video id/);

  const player = read("../client/src/components/BundleVideo.tsx");
  const offers = read("../client/src/pages/BundleOffers.tsx");
  const data = read("../client/src/data/bundleVideos.ts");
  assert.equal(player.includes(".mp4"), false);
  assert.equal(player.includes("<video"), false);
  assert.equal(data.includes(".mp4"), false);
  assert.equal(offers.includes("vertical-v1.mp4"), false);
  assert.match(player, /embedUrl &&/);
  assert.match(offers, /<BundleVideo slug=\{offer\.slug\} title=\{offer\.title\} \/>/);
});
