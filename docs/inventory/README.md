# OSW inventory (Phoenix yard)

Supabase project `govktyrtmwzbzqkmzmrf`. Migrations: `supabase/migrations/20261124_osw_inventory_stock.sql`, `20261124_osw_inventory_seed_provisional.sql`.

## Tables
- `inventory_stock` — one row per physical SKU per location (`phx`): `on_hand` in bags or totes, `units_per_pallet`, `count_status` (`provisional` | `confirmed`).
- `inventory_variant_map` — storefront variant -> SKU x units. Bag = 1, pallet = bags per pallet, bundle = its component bags.
- `inventory_movements` — append-only ledger: `count`, `receipt`, `sale`, `restock`, `adjustment`.
- `inventory_count_sessions` — one row per physical count (voice note, mobile app, admin).
- View `inventory_variant_availability` — sellable units per variant (bundles = min over components).

## Automatic
- Order `payment_status` -> `paid`: one `sale` movement per order item x SKU (idempotent).
- Item inserted on an already-paid order: same.
- Order `status`/`payment_status` -> `cancelled` / `refunded`: `restock` of every sale movement.
- Checkout (`/api/checkout/create-session`): `inventory_check_cart` refuses carts that need more than on hand (409). Fails open on lookup errors.
- Storefront: `GET /api/inventory/stock?productIds=...`; product page shows "N in stock" / "Only N left" / "Sold out" for the chosen size.

## Load confirmed counts (one call)
```sql
select public.inventory_record_count(
  '[{"sku_code":"mikeys-9lb-bag","on_hand":864},
    {"sku_code":"mikeys-1cf-bag","on_hand":100},
    {"sku_code":"simons-1cf-bag","on_hand":100},
    {"sku_code":"simons-tote","on_hand":1},
    {"sku_code":"nb-2cf-bag","on_hand":150},
    {"sku_code":"nb-tote","on_hand":4},
    {"sku_code":"plantpal-1.5cf-bag","on_hand":165},
    {"sku_code":"plantpal-tote","on_hand":0},
    {"sku_code":"superbooster-1cf-bag","on_hand":25},
    {"sku_code":"biochar-tote","on_hand":0.5}]'::jsonb,
  'confirmed', 'admin', 'EA confirmation', null, 'Rodolfo Alvarez');
```
Sets each SKU to the counted value (movement = difference) and marks it confirmed. Include only SKUs you counted.

## Receiving (e.g. Friday truckload)
```sql
select public.inventory_receive('[{"sku_code":"plantpal-1.5cf-bag","qty":660}]'::jsonb, 'Truck Nov 27', 'Rodolfo Alvarez');
```

## Adding a tracked variant
Insert into `inventory_stock` (new SKU) and `inventory_variant_map`. Variants without a map row are untracked: no badge, no limit.

## Not covered yet
- Yard/rep sales entered only in `sp_orders` (mobile sales portal) do not decrement. Website orders already sync to `sp_orders`, so wire rep-entered orders with a source filter to avoid double counting.
- Mobile app count screen: call `inventory_record_count` with `p_source = 'mobile_app'` via a service-role API.
