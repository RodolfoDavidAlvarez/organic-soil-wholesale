# Organic Soil Wholesale — V5 Local Pricing (All Products) Update Log

**Date:** 2026-08-03  
**Sheet name:** V5 Local Pricing (All Products)  
**Role:** Expanded catalog companion to core **V5 Local Pricing** (not a V6 rename)  
**Source of truth (print):** `_pricing-v4/official/V5-All-Products-Organic-Soil-Wholesale-Local-Pricing/`  
**GitHub / site docs:** `docs/local-pricing-v5-all-products/`

## Relationship to core V5

| Sheet | Brand name | Folder | Website docs |
|---|---|---|---|
| Core (hero / daily use) | **V5 Local Pricing** | `official/V5-Organic-Soil-Wholesale-Local-Pricing/` | `docs/local-pricing-v5/` |
| Companion (expanded catalog) | **V5 Local Pricing (All Products)** | `official/V5-All-Products-Organic-Soil-Wholesale-Local-Pricing/` | `docs/local-pricing-v5-all-products/` |

- **Do not overwrite** the core V5 sheet with this companion.
- Publish both paths; keep `docs/local-pricing-v5/` as the short hero default.

## Why this pack exists

Core V5 keeps the short hero sheet (Soil Craft, PlantPal, Nature's Blanket Premium, Simon's Gold, Mikey's Worm Poop) for everyday quotes.

**V5 Local Pricing (All Products)** uses the same discount math and design system, then adds PropaGrow, PlugBoost, specialty blends, and concentrated amendments so sales can price the full local catalog from one PDF. Mulch matches core V5: **Nature's Blanket Premium only**.

## Shared rules with V5 core

| Rule | Value |
|---|---|
| Pallet volume discount | **20%** off bag×qty list |
| Full flatbed bonus | **+10%** at exactly 22 spots |
| Potting | **1.5 CF · 30 bags** |
| Mulch | **2 CF · 25 bags** |
| Amendment pallets | **144 × 9 lb** · **50 × 1 CF** |

## Specialty / concentrated — no yard pickup

Matches old wholesale sheet (`Wholesale.tsx` amendments / concentrated): **bag, pallet, and tote only** — no pickup column, no loose truckload column.

- Specialty ladder (standard MSRP): 9 lb **$20.58** · 1 CF **$24.90** · tote **$459.00**
  - Pallet 9 lb list **$2,963.52** → **$2,370.82** @20%
  - Pallet 1 CF list **$1,245.00** → **$996.00** @20%
- Concentrated (verified):

| Product | 9 lb bag | Pallet 9 lb @20% | 1 CF bag | Pallet 1 CF @20% | Tote |
|---|---:|---:|---:|---:|---:|
| SuperBooster | $24.95 | $2,874.24 | $34.95 | $1,398.00 | $1,290.90 |
| Cultivator's Rose | $44.95 | $5,178.24 | $155.00 | $6,200.00 | $4,188.00 |

Potting/mulch and Simon's/Mikey's pages keep pickup where already defined.

## 2026-08-03 — companion branding + specialty columns

- Renamed visible titles/byline/editor/`<title>` to **V5 Local Pricing (All Products)**
- Removed Pickup + Truckload from specialty and concentrated pages (legend + table)
- Added muted note: bag/pallet/tote only — no yard pickup
