# Organic Soil Wholesale — Local Pricing V5 Update Log

**Date:** 2026-08-03  
**Sheet name:** V5 Local Pricing (Victor Five)  
**Audience:** Organic Soil Wholesale sales + website ops  
**Source of truth (print):** `_pricing-v4/official/V5-Organic-Soil-Wholesale-Local-Pricing/`  
**GitHub:** `myorganicsoil.com` → `docs/local-pricing-v5/`

Use this log to bring the live OSW website, quotes, and yard talk tracks in line with the V5 local pricing sheet.

---

## Why V5

V4 was **list only · no discounts**. That made the tote look like the only smart bulk buy, so loaders stayed busy and pallets underperformed.

V5 keeps list bag prices visible, then makes **pallets the easy yes**:

1. **Pallet = 20% off** bag × qty list (shown with list price crossed out).
2. **Potting soils** standardize to **1.5 CF bags · 30 bags per pallet** (was 40).
3. **Pickup** sits between tote and truckload on light products so totes stay useful without killing pallet/tote mix.
4. **Full flatbed (exactly 22 spots)** stays **+10%** on top of product pricing (website rule unchanged).

---

## Rules to match on the website

| Rule | V5 value | Website note |
|---|---|---|
| Pallet volume discount | **20%** off bag×qty list | `PALLET_VOLUME_DISCOUNT = 0.2` |
| Full flatbed bonus | **+10%** when cart spots = **22** | Keep; do not raise |
| Potting bag format | **1.5 CF** | Soil Craft, PlantPal |
| Potting pallet count | **30 bags** | Was 40 |
| Mulch bag / pallet | **2 CF · 25 bags** | Unchanged count |
| Amendment 9 lb pallet | **144 bags** | Unchanged |
| Amendment 1 CF pallet | **50 bags** | Unchanged |

---

## New pickup ladder (light products)

Truckload **unchanged**. Pickup **raised** so it sits between tote and truckload (encourage totes/pallets; protect loader time).

| Product | Tote (keep) | **New pickup** | Truckload (keep) |
|---|---|---|---|
| Soil Craft | $359.78 | **$120 / cu yd · $300 / ton** | $150 / ton · $3,600 |
| PlantPal | $247.28 | **$80 / cu yd · $200 / ton** | $90 / ton · $2,160 |
| Nature’s Blanket Premium | $137.50 | **$44 / cu yd · $110 / ton** | $60 / ton · $1,440 |

Amendments already laddered — leave as sheet:

| Product | Tote | Pickup | Truckload |
|---|---|---|---|
| Simon’s Gold | $149 | $18 / cy · $45 / ton | $30 / ton · $720 |
| Mikey’s Worm Poop | $399 | $120 / cy · $300 / ton | $200 / ton · $4,800 |

---

## Pallet prices @ 20% (V5)

| Product | Bags / pallet | List (bag×qty) | **Pallet @ 20%** |
|---|---:|---:|---:|
| Soil Craft (1.5 CF) | 30 | $479.70 | **$383.76** |
| PlantPal (1.5 CF) | 30 | $329.70 | **$263.76** |
| Nature’s Blanket (2 CF) | 25 | $274.75 | **$219.80** |
| Simon’s Gold 9 lb | 144 | $1,794.24 | **$1,435.39** |
| Simon’s Gold 1 CF | 50 | $1,245.00 | **$996.00** |
| Mikey’s 9 lb | 144 | $2,606.40 | **$2,085.12** |
| Mikey’s 1 CF | 50 | $1,745.00 | **$1,396.00** |

### Intuition — why 20% + 30-bag potting works

- At **30 × 1.5 CF** and **20% off**, Soil Craft pallet (**$383.76**) sits only ~**$24** above the tote (**$359.78**). Same story for PlantPal (~**$16** gap). Buyers can choose bags-on-pallet for handling/resale without feeling punished vs tote.
- Mulch pallet stays bagged convenience; tote remains the cheaper loose/movable bulk path.
- Amendments keep 144 / 50 counts; 20% simply replaces the old flat/weaker pallet incentive so the sheet and site match.

---

## Website checklist (make congruent)

- [ ] Product detail pallet badge / copy says **20% off** (not 10%).
- [ ] Soil Craft + PlantPal pallet qty = **30** (labels: 1.5 cu ft bags).
- [ ] Mulch pallet qty = **25** · 2 CF.
- [ ] Amendment pallets = **144** (9 lb) / **50** (1 CF).
- [ ] Pickup MSRP / quote paths use V5 pickup $/cy and $/ton above (or `sp_pricing` updated to match).
- [ ] Full flatbed still only at **22 spots · +10%** (no change to that trigger).
- [ ] Remove stale “10% off” marketing lines on wholesale/nursery pages if any remain.
- [ ] Train yard/sales: push **pallet** when customer wants bagged units; push **tote** when they have unload gear and want movable bulk; push **pickup/truckload** only when loose volume is real.

---

## What not to change casually

- Bag list prices on the sheet (MSRP anchors).
- Truckload $/ton floors for Soil Craft / PlantPal / Nature’s.
- Stacking: pallet 20% is already in the pallet unit price; full flatbed +10% can still apply on a 22-spot cart — that is intentional volume fuel, not a second pallet SKU discount.

---

## File map

| Artifact | Path |
|---|---|
| Editable sheet | `Organic-Soil-Wholesale-Local-Pricing-V5-EDIT.html` |
| Print PDF | `Organic-Soil-Wholesale-Local-Pricing-V5.pdf` |
| This log | `OSW-LOCAL-PRICING-V5-UPDATE-LOG.md` |
| Prior baseline | `../V4-Organic-Soil-Wholesale-Local-Pricing/` (list · no discounts) |

---

## One-line handoff

**V5 Local Pricing = same hero products, potting pallets at 30×1.5 CF, pallet 20% off list, raised light-product pickup between tote and truckload, full flatbed still +10% at 22 spots — update the OSW website and talk tracks to match this sheet.**

---

## Companion pack — V5 All Products (2026-08-03)

Expanded catalog sheet lives beside this core pack:

`_pricing-v4/official/V5-All-Products-Organic-Soil-Wholesale-Local-Pricing/`

Same V5 discount rules (pallet 20%, potting 30×1.5 CF, flatbed +10%). Adds PropaGrow, PlugBoost, Nature's Blanket, specialty blends, and concentrated amendments. **Not V6.** Website mirror: `docs/local-pricing-v5-all-products/`. See that folder's `OSW-LOCAL-PRICING-V5-ALL-PRODUCTS-UPDATE-LOG.md`.
