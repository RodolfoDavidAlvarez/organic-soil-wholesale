# Pricing B5 Local (2026-08-03)

Current official Organic Soil Wholesale **local** pricing sheet after the pickup ladder and on-sheet pallet discount presentation.

## Official sheet

- Path: `Organic Soil Wholesale/_pricing-v4/official/B5-Organic-Soil-Wholesale-Local-Pricing/`
- Branding: **B5 Local Pricing** · pallet 10% off · full flatbed (22 spots) +10% off
- Prior baseline (list · no discounts): V4 folder + `PRICING-V4-DISCOUNT-BASELINE-2026-08-03.md`

## Pickup ladder (truckloads unchanged for these three)

| Product | Pickup B5 | Truckload |
|---|---|---|
| Soil Craft | $120/cu yd · $300/ton eq. | $3,600 · $150/ton |
| PlantPal | $80/cu yd · $200/ton eq. | $2,160 · $90/ton |
| Nature's Blanket | $44/cu yd · $110/ton eq. | $1,440 · $60/ton |

Simon's Gold / Mikey's pickup & truckload: unchanged from V4.

## Pallet prices on sheet (10% off list as primary)

Matches website `PALLET_VOLUME_DISCOUNT = 0.1` examples:

- Soil Craft $575.64 (list $639.60)
- PlantPal $395.64 (list $439.60)
- Nature's $247.28 (list $274.75)
- Simon's Gold $1,614.82 / $1,120.50
- Mikey's $2,345.76 / $1,570.50

## Website discount code (unchanged by this sheet)

- Pallet 10%: `ProductDetail.tsx` / `applyPalletDiscount`
- Full 22-spot flatbed +10%: `flatbedSpots` + checkout

## GitHub mirror

- `myorganicsoil.com` → `docs/local-pricing-b5/`
