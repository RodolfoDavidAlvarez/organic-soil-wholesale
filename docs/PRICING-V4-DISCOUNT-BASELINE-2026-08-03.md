> **Superseded for the printed local sheet:** B5 Local Pricing is current — see `PRICING-B5-LOCAL-2026-08-03.md` and `_pricing-v4/official/B5-Organic-Soil-Wholesale-Local-Pricing/`. This V4 checkpoint remains the pre-edit / no-discount baseline.

# Pricing V4 + discount baseline (2026-08-03)

Checkpoint before local-pricing ladder edits (pickup between tote and truckload) and before expanding discount presentation on the no-discount V4 sheet.

## Official list sheet (no discounts)

- Source of truth (print/reference):  
  `Organic Soil Wholesale/_pricing-v4/official/V4-Organic-Soil-Wholesale-Local-Pricing/`
- GitHub reference (merged PR #52):  
  `myorganicsoil.com` → `docs/local-pricing-v4/`
- Sheet title intent: **list price · no discounts**
- Hero products: Soil Craft, PlantPal, Nature's Blanket Premium, Simon's Gold, Mikey's Worm Poop

## Website discounts already integrated (organicsoilwholesale.com)

### 1) Pallet = 10% off bag×qty list

- Code: `client/src/pages/ProductDetail.tsx`  
  `PALLET_VOLUME_DISCOUNT = 0.1` via `applyPalletDiscount`
- UI: pallet choice shows badge **10% off** and `compareAtPrice` = full bag×qty list
- Example from V4 bag list:

| Product | Bags/pallet | List | Website pallet (10% off) |
|---|---:|---:|---:|
| Soil Craft 1.5 CF | 40 | $639.60 | $575.64 |
| PlantPal 1.5 CF | 40 | $439.60 | $395.64 |
| Nature's Blanket 2 CF | 25 | $274.75 | $247.28 |
| Simon's Gold 9 lb | 144 | $1,794.24 | $1,614.82 |
| Simon's Gold 1 CF | 50 | $1,245.00 | $1,120.50 |
| Mikey's 9 lb | 144 | $2,606.40 | $2,345.76 |
| Mikey's 1 CF | 50 | $1,745.00 | $1,570.50 |

### 2) Full flatbed (exactly 22 spots) = additional 10%

- Code: `client/src/lib/flatbedSpots.ts` + `shared/flatbedSpots.js`  
  `FULL_LOAD_PRODUCT_DISCOUNT = 0.1` when `spots === 22`
- Checkout enforces server-side (`server/routes/checkout.ts`)
- Marketing copy also references 22-tote/full-load 10% (`Wholesale.tsx`)

**Note:** pallet unit prices already include the pallet 10%. A full 22-spot cart can apply the flatbed 10% on those already-discounted lines (stacking). Confirm with owner before changing.

## Planned next sheet edits (not applied in this commit)

- Raise **pickup** $/ton for Soil Craft / PlantPal / Nature's Blanket so pickup sits between tote and truckload (encourage totes; loading capacity is limited).
- Keep truckload floors unless owner decides otherwise.
- Add discount story onto a V4.5 sheet (list stays visible; pallet 10% and full-load 10% called out).

## Rollback

- This commit is the pre-edit baseline for OSW website docs.
- Revert sheet/PDF work against the V4 files above + `myorganicsoil.com` PR #52 hash `a5eb333` / merge `42b0aeb`.
