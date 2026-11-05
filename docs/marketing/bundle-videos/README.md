# Bundle video publication and coverage guide

Updated 2026-11-05. Rodolfo approved Big Garden Setup and Garden Refresh Plus for their bundle pages and authorized Garden Refresh publication after checking its quantities. This supersedes the earlier deployment hold.

## Video mapping

| Page | Preserved master | Duration | Contents |
| --- | --- | --- | --- |
| `/offers/garden-refresh` | Garden Refresh Bundle Video - Vertical V1.mp4 | 81.400 s | 5 mulch, 3 dairy compost, 2 worm castings; $99 |
| `/offers/garden-refresh-plus` | Garden Refresh Plus Bundle Video - Vertical V1.mp4 | 123.567 s | 10 PlantPal, 3 mulch, 3 worm castings; $149 |
| `/offers/big-garden-setup` | Big Garden Setup Bundle Final Video - Vertical V3.mp4 | 91.433 s | 30 PlantPal, 4 dairy compost, 3 worm castings, 3 mulch; $399 |

Masters live in `Garden Bundles Edit/Final Videos` in the SSW workspace. The approved masters were **not changed**. `media-manifest.json` records both master and website-copy hashes. Website filename `vertical-v1` means first web delivery; Big Garden's underlying approved edit is V3.

### Garden Refresh take audit

The finished V1 already uses the correct take. The source is `DJI_20261102131852_0036_D.mp4`, source selection **406.4–421.7 s**, corresponding to **47.10–62.40 s** in the finished edit. Its speech names five Nature's Blanket mulch bags, three Simon's Gold dairy compost bags and two Mikey's Worm Poop bags. Final transcript, captions and product graphics agree: 10 bags total.

Do not substitute the unused 0036 take around 340–349 s or 0037 take around 239–270 s: those contain conflicting counts. The edit's Simon's Gold introduction uses 0037 at 317.63–327.65 s, replacing the take with the wrong product name. Detailed source selections remain in `Refresh Series/Garden Refresh Vertical V1/config.json` and `Final Videos/Handoff/REFRESH SERIES TIMELINE.md`.

### Web delivery

Each portrait MP4 is H.264, 720×1280, 30 fps, with the original AAC audio copied unchanged, fast-start metadata, and burned-in caption styling preserved. No frame-rate conversion, new cuts, voice changes, speed changes or new music were introduced. Entire copies passed FFmpeg decoding, built assets matched delivery SHA-256 values, and audio stream hashes matched their masters.

Recreate with FFmpeg (quote the input/output paths):

```sh
ffmpeg -i MASTER.mp4 -vf scale=720:1280:flags=lanczos \
  -c:v libx264 -preset medium -crf 24 -maxrate 2500k -bufsize 5000k \
  -g 60 -c:a copy -movflags +faststart -map_metadata -1 OUTPUT.mp4
```

Poster frames: Big Garden 5.5 s, Plus 4.0 s, Refresh 1.5 s; JPEG quality 3. Optional WebVTT tracks are converted from each project's `Captions.srt`. Captions are already visible in the video; do not enable the extra track by default and double them.

`BundleVideo.tsx` loads the video only after a customer clicks the walkthrough button. Native controls, inline portrait playback, a keyboard-accessible Radix dialog and a 44 px close button are provided. Closing unmounts the video. Existing hero/product photos and checkout behavior are preserved.

## Product guidance

Catalog quantities come from `shared/promoBundles.js`; `shared/bundleUsage.js` derives coverage from those values. It does not use pounds to estimate volume.

| Product | Assumption | Refresh | Plus | Big Garden |
| --- | --- | --- | --- | --- |
| PlantPal | One 4×8 bed = 32 sq ft; rounded down to nearest ½ inch | — | One bed, about 5½ inches | Two beds, about 8 inches each |
| Dairy compost | 1-inch topdressing | 36 sq ft | — | 48 sq ft |
| Worm castings | ½-inch topdressing | 48 sq ft | 72 sq ft | 72 sq ft |
| Mulch | 2-inch surface layer | 60 sq ft | 36 sq ft | 36 sq ft |

Formula: square feet = cubic feet × 12 ÷ depth in inches. Growing-mix depth = cubic feet × 12 ÷ (32 × number of beds). Mulch is surface cover and never counted as growing-mix fill. Coverage is per product before settling, not a promise that all products cover the same area at their stated example depths.

Rodolfo supplied approximate package weights on 2026-11-05: dairy compost 1 cu ft ≈50 lb; worm castings 1 cu ft ≈45 lb. Weights vary with moisture. No unverified mulch/potting-mix weight or universal tree count is claimed.

Reapplication guidance is conditional: compost spring/fall as needed; castings at planting and as plants need them; mulch when its layer thins; growing mix as it settles. It is not a guaranteed fertilizer duration or instruction to replace the whole bundle twice yearly.

### Application sources

- [Manufacturer: Simon's Gold](https://www.soilseedandwater.com/products/simons-gold-organic-dairy-compost) — 1–2 inch topdressing; guide uses 1 inch.
- [Manufacturer: Mikey's Worm Poop](https://www.soilseedandwater.com/products/mikeys-worm-poop-organic-dairy-vermicompost-worm-castings) — ½–2 inch topdressing heading; guide uses the light ½-inch example.
- [University of Arizona: Mulches](https://extension.arizona.edu/sites/extension.arizona.edu/files/attachment/Mulches.pdf) — organic mulch depth guidance; guide uses 2 inches.
- Local catalog application directions: `client/src/data/json/Amendment Products.json`, `Mulch Products.json`, `Potting Soil Products.json`. Old prices in these files are not used.

## Checks

- `node --test test/bundle-usage.test.mjs`: package sizes and bundle totals reconcile; depth/area examples pass; unknown quantities omit guidance.
- `npm run build`: passed, including security configuration and spec-sheet checks.
- `node scripts/test-call-tracking.mjs`: passed; no telephone code changed.
- `npm run test:phone-links`: source/build checks passed, browser portion could not run because its pinned Puppeteer Chrome is absent. Bundle-page phone links checked in the supported browser instead; no claim of a real-device call test.
- Browser review: the three routes, corresponding portrait sources/durations, dialog close behavior, and mobile widths 375/390/414 px. No mobile horizontal overflow.

Release through the existing `main-clean` Git → Vercel workflow. Verify the resulting commit is READY on project `organic-soil-wholesale`, then check all three public pages and byte-range video delivery. Do not deploy a dirty tree or modify the unrelated Product Showcase review draft.
