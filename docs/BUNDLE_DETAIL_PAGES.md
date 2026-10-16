# Native garden bundle pages · October 15, 2026

The local design branch replaces flyer-led bundle pages with native content at `/offers/garden-refresh`, `/offers/garden-refresh-plus` and `/offers/big-garden-setup`. Existing aliases, SKU IDs 4100–4102, fixed prices, discount exclusions and cart normalization remain unchanged.

Each page shows quantities, each product’s purpose, application steps, coverage qualifications, pickup information and FAQs. The physical bed is explicitly excluded from these three bag bundles. Pickup is included; delivery is quoted separately at checkout. Product copy comes from the designer PDFs and existing approved product content, documented in `client/src/data/bundleDetails.ts`.

The Deals index also links to the separate raised-bed package at `/garden-bed-offer.html`. Its $945.43 upfront price, $1,039.87 installment total, November-only free Arizona delivery and personal-link requirement remain separate from regular cart checkout.

## Images and volume correction

Optimized textures and branded bag artwork replace flyer images on detail pages and homepage bundle cards. `client/public/images/bundles/manifest.json` records sources and dimensions. Artwork identifies products; some reference bags show smaller packages, so displayed bundle quantities and volumes are authoritative. No new labels or generated product packaging were created.

Big Garden Setup contains 45 cu ft PlantPal + 4 cu ft compost + 3 cu ft castings + 6 cu ft mulch = **58 cu ft**, approximately **2.15 cu yd**. Its old flyer headline said 54 cu ft / 2.64 cu yd. Bag counts and prices were preserved; shared copy and volume regression checks were corrected. Active card, cart and social-preview imagery no longer shows the old volume text. Original designer assets remain available as references.

Search metadata, Product/Offer schema, social previews and sitemap entries cover the canonical Deals and three bundle routes without invented availability, deadlines or review claims. Bundle detail views now include value, SKU, variant, price and quantity in `view_item`; existing cart tracking is retained.

## Raised-bed video

User-supplied source: `Downloads/Large Raised Garden Bed Structure.mp4`. The 23-second video appears in the homepage’s `new-garden-package` section and the raised-bed offer page, titled **Large 4x8 ft Raised Garden Bed**. The original H.264/AAC streams are preserved, with MP4 metadata moved before the media data for fast start. The 30 KB WebP poster comes from the video at one second. Playback is inline, user initiated, with `preload="none"`; no autoplay. Existing captions in the supplied video remain intact, and the separate assembly guide stays available.

## Local verification

Browser checks covered all three bundle pages at 392 px, current quantities, loaded images, no horizontal overflow, a $99 bundle added correctly to the local cart and removal afterward. The new video decoded and played through the native player; its 22.917-second duration and byte-range responses were verified. Homepage and offer playback start without downloading the video on initial load. Production API writes remain blocked by the local preview configuration; no order or payment was submitted.

The production build/security gate, pricing regressions, seven garden-offer API tests, phone-link/CallRail synchronization suite, call-tracking exclusions, JS syntax and whitespace checks passed. The mobile footer links remain above the fixed order bar at the end of the page. No production deployment was made.
