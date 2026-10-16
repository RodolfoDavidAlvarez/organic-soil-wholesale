# V5 Local Pricing (All Products)

Expanded catalog companion to the core sheet **V5 Local Pricing** (hero / daily use). Same discount rules; more SKUs.

**Do not overwrite** `official/V5-Organic-Soil-Wholesale-Local-Pricing/` with this pack.

## Naming

- Core sheet = **V5 Local Pricing**
- This companion = **V5 Local Pricing (All Products)**

## Files

- `Organic-Soil-Wholesale-Local-Pricing-V5-All-Products.pdf` — share/print PDF
- `Organic-Soil-Wholesale-Local-Pricing-V5-All-Products-EDIT.html` — editable browser version
- `Organic-Soil-Wholesale-Local-Pricing-V5-All-Products.html` — static HTML (same content)
- `OSW-LOCAL-PRICING-V5-ALL-PRODUCTS-UPDATE-LOG.md` — companion notes + deploy path

## Pages (5)

1. Potting soils (Soil Craft, PlantPal, PropaGrow, PlugBoost) + Mulch (Premium + Nature's Blanket) — yard pickup / truckload where defined
2. Core amendments — Simon's Gold + Mikey's Worm Poop (same numbers as V5 heroes; pickup kept)
3. Specialty amendments — bag / pallet / tote only (**no yard pickup**)
4. Concentrated amendments — SuperBooster + Cultivator's Rose — bag / pallet / tote only (**no yard pickup**)
5. Size Category Guide (**How to Choose the Right Format**)

Pickup and Delivery Notes are **not** on this sheet.

## Rules (same as V5 core)

- Pallet **20%** off bag×qty list (struck list + discounted)
- Potting: **1.5 CF · 30 bags/pallet**
- Mulch: **2 CF · 25 bags**
- Amendments: **144 × 9 lb** and **50 × 1 CF**
- Full flatbed (22 spots) **+10%** (byline)

## Render PDF

```bash
cd "../../"
node scripts/render-simple-tables-pdf.mjs \
  --input "official/V5-All-Products-Organic-Soil-Wholesale-Local-Pricing/Organic-Soil-Wholesale-Local-Pricing-V5-All-Products-EDIT.html" \
  --output "official/V5-All-Products-Organic-Soil-Wholesale-Local-Pricing/Organic-Soil-Wholesale-Local-Pricing-V5-All-Products.pdf"
```

## Website

`myorganicsoil.com` / `organic-Soil-Wholesale-Cursor` → `docs/local-pricing-v5-all-products/`

Use **V5 Local Pricing** (`docs/local-pricing-v5/`) for the short hero sheet; use this pack when the full catalog is needed. Do not replace core docs.
