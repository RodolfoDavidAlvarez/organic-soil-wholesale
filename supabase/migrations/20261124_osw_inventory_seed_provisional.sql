-- Seed SKUs, variant map and the PROVISIONAL Phoenix yard count from Rodo's
-- Wispr Flow voice note (Nov 24, 2026 ~2:55 PM Phoenix). Final confirmed counts
-- will come through the EA; load them with one call to inventory_record_count
-- (see docs/inventory/README.md). Untracked variants (no map row) are not shown
-- or limited on the storefront.

insert into public.inventory_stock (location_code, sku_code, product_id, label, unit, units_per_pallet, notes) values
 ('phx','simons-1cf-bag',      1000, 'Simon''s Gold 1 cu ft bag',              'bag', 50,  null),
 ('phx','simons-tote',         1000, 'Simon''s Gold tote',                     'tote',null, null),
 ('phx','mikeys-9lb-bag',      1001, 'Mikey''s Worm Poop 9 lb bag',            'bag', 144, null),
 ('phx','mikeys-1cf-bag',      1001, 'Mikey''s Worm Poop 1 cu ft bag',         'bag', 50,  '50/pallet from pallet config; voice note did not say'),
 ('phx','plantpal-1.5cf-bag',  111,  'PlantPal Plus 1.5 cu ft bag',            'bag', 30,  null),
 ('phx','plantpal-tote',       111,  'PlantPal Plus tote',                     'tote',null, '3 totes on yard already sold (voice note: disregard)'),
 ('phx','nb-2cf-bag',          3000, 'Nature''s Blanket 2 cu ft bag',          'bag', 25,  'Shared by product 3000 (Premium) and 134 listings'),
 ('phx','nb-tote',             3000, 'Nature''s Blanket tote',                 'tote',null, 'Shared by product 3000 (Premium) and 134 listings'),
 ('phx','superbooster-1cf-bag',4000, 'SuperBooster 1 cu ft bag',               'bag', 50,  '50/pallet ASSUMED (no 1CF pallet config for 4000); not sold online'),
 ('phx','biochar-tote',        null, 'Biochar tote',                           'tote',null, 'No biochar product row; not sold online')
on conflict do nothing;

insert into public.inventory_variant_map (product_id, size_option, sku_code, units_per_item) values
 (1000,'1CF Bag','simons-1cf-bag',1), (1000,'Pallet (50 x 1CF)','simons-1cf-bag',50), (1000,'Tote','simons-tote',1),
 (1001,'9lb Bag','mikeys-9lb-bag',1), (1001,'Pallet (144 x 9lb)','mikeys-9lb-bag',144),
 (1001,'1CF Bag','mikeys-1cf-bag',1), (1001,'Pallet (50 x 1CF)','mikeys-1cf-bag',50),
 (111,'1.5CF Bag','plantpal-1.5cf-bag',1), (111,'Pallet (30 x 1.5CF)','plantpal-1.5cf-bag',30), (111,'Tote','plantpal-tote',1),
 (3000,'2CF Bag','nb-2cf-bag',1), (3000,'Pallet (25 x 2CF)','nb-2cf-bag',25), (3000,'Tote','nb-tote',1),
 (134,'2CF Bag','nb-2cf-bag',1),  (134,'Pallet (25 x 2CF)','nb-2cf-bag',25),  (134,'Tote','nb-tote',1),
 -- bundles decrement their components
 (4100,'10-bag Phoenix pickup bundle','nb-2cf-bag',5), (4100,'10-bag Phoenix pickup bundle','simons-1cf-bag',3), (4100,'10-bag Phoenix pickup bundle','mikeys-1cf-bag',2),
 (4101,'16-bag Phoenix pickup bundle','plantpal-1.5cf-bag',10), (4101,'16-bag Phoenix pickup bundle','nb-2cf-bag',3), (4101,'16-bag Phoenix pickup bundle','mikeys-1cf-bag',3),
 (4102,'40-bag Phoenix pickup bundle','plantpal-1.5cf-bag',30), (4102,'40-bag Phoenix pickup bundle','simons-1cf-bag',4), (4102,'40-bag Phoenix pickup bundle','mikeys-1cf-bag',3), (4102,'40-bag Phoenix pickup bundle','nb-2cf-bag',3)
on conflict do nothing;

select public.inventory_record_count(
  '[{"sku_code":"mikeys-9lb-bag","on_hand":864,"note":"6 pallets x 144"},
    {"sku_code":"simons-tote","on_hand":1,"note":"1 tote"},
    {"sku_code":"plantpal-tote","on_hand":0,"note":"3 totes sold, disregard"},
    {"sku_code":"nb-tote","on_hand":4,"note":"4 totes"},
    {"sku_code":"nb-2cf-bag","on_hand":150,"note":"6 pallets x 25"},
    {"sku_code":"simons-1cf-bag","on_hand":100,"note":"2 pallets x 50"},
    {"sku_code":"mikeys-1cf-bag","on_hand":100,"note":"2 pallets x 50 (per-pallet from config)"},
    {"sku_code":"plantpal-1.5cf-bag","on_hand":165,"note":"5.5 pallets x 30"},
    {"sku_code":"superbooster-1cf-bag","on_hand":25,"note":"0.5 pallet x 50 (assumed)"},
    {"sku_code":"biochar-tote","on_hand":0.5,"note":"half a tote"}]'::jsonb,
  'provisional', 'wispr_voice_note', 'wispr-scratchpad:3ada77c1-c654-415c-8b5c-61e1f9f2bb35',
  null, 'Rodolfo Alvarez (voice note)', 'phx', '2026-11-24T14:55:04-07:00');
