-- OSW inventory: stock per physical SKU (bags / totes), variant map (bag, pallet,
-- bundle -> SKU x units), append-only movements, count sessions, automatic
-- decrement when an order is paid and restock when it is cancelled/refunded.
-- Additive only. Legacy public.inventory / inventory_transactions are untouched.
-- Service role only: RLS on, no policies, anon/authenticated revoked.

create table if not exists public.inventory_stock (
  location_code text not null default 'phx' references public.ops_inventory_locations(code),
  sku_code text not null,
  product_id integer references public.products(id),
  label text not null,
  unit text not null default 'bag',            -- bag | tote
  units_per_pallet integer,                    -- bags per pallet for this SKU
  on_hand numeric(12,2) not null default 0,    -- in `unit`s (0.5 tote allowed)
  count_status text not null default 'provisional' check (count_status in ('provisional','confirmed')),
  last_counted_at timestamptz,
  last_count_session_id bigint,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (location_code, sku_code)
);

create table if not exists public.inventory_variant_map (
  product_id integer not null references public.products(id),
  size_option text not null,                   -- canonical V5 label, e.g. 'Pallet (50 x 1CF)'
  location_code text not null default 'phx',
  sku_code text not null,
  units_per_item numeric(12,2) not null check (units_per_item > 0),
  primary key (product_id, size_option, location_code, sku_code),
  foreign key (location_code, sku_code) references public.inventory_stock(location_code, sku_code)
);

create table if not exists public.inventory_count_sessions (
  id bigserial primary key,
  location_code text not null default 'phx' references public.ops_inventory_locations(code),
  status text not null default 'provisional' check (status in ('provisional','confirmed')),
  source text not null,                        -- wispr_voice_note | mobile_app | admin
  source_ref text,
  raw_text text,
  counted_by text,
  counted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id bigserial primary key,
  location_code text not null,
  sku_code text not null,
  delta numeric(12,2) not null,
  kind text not null check (kind in ('count','receipt','sale','restock','adjustment')),
  order_id integer references public.orders(id),
  order_item_id integer references public.order_items(id),
  count_session_id bigint references public.inventory_count_sessions(id),
  on_hand_after numeric(12,2),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  foreign key (location_code, sku_code) references public.inventory_stock(location_code, sku_code)
);
create unique index if not exists inventory_movements_order_item_kind_uq
  on public.inventory_movements (order_item_id, sku_code, kind) where order_item_id is not null;
create index if not exists inventory_movements_sku_idx on public.inventory_movements (location_code, sku_code, created_at desc);
create index if not exists inventory_movements_order_idx on public.inventory_movements (order_id);

alter table public.inventory_stock enable row level security;
alter table public.inventory_variant_map enable row level security;
alter table public.inventory_count_sessions enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_stock, public.inventory_variant_map, public.inventory_count_sessions, public.inventory_movements from anon, authenticated;

-- ---------- core: apply one movement ----------
create or replace function public.inventory_apply_movement(
  p_location text, p_sku text, p_delta numeric, p_kind text,
  p_order_id integer default null, p_order_item_id integer default null,
  p_count_session_id bigint default null, p_note text default null, p_created_by text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_after numeric;
begin
  update inventory_stock set on_hand = on_hand + p_delta, updated_at = now()
   where location_code = p_location and sku_code = p_sku
   returning on_hand into v_after;
  if not found then return null; end if;
  insert into inventory_movements(location_code, sku_code, delta, kind, order_id, order_item_id, count_session_id, on_hand_after, note, created_by)
  values (p_location, p_sku, p_delta, p_kind, p_order_id, p_order_item_id, p_count_session_id, v_after, p_note, p_created_by);
  return v_after;
end $$;

-- ---------- counts (mobile app / EA confirmation) ----------
-- p_counts: [{"sku_code":"mikeys-9lb-bag","on_hand":864,"note":"6 pallets x 144"}]
-- Sets on_hand to the counted value (movement = difference). One call loads a whole count.
create or replace function public.inventory_record_count(
  p_counts jsonb, p_status text default 'confirmed', p_source text default 'admin',
  p_source_ref text default null, p_raw_text text default null, p_counted_by text default null,
  p_location text default 'phx', p_counted_at timestamptz default now())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_session bigint; r jsonb; v_cur numeric; v_new numeric;
begin
  if p_status not in ('provisional','confirmed') then raise exception 'bad status %', p_status; end if;
  insert into inventory_count_sessions(location_code, status, source, source_ref, raw_text, counted_by, counted_at)
  values (p_location, p_status, p_source, p_source_ref, p_raw_text, p_counted_by, p_counted_at) returning id into v_session;
  for r in select * from jsonb_array_elements(p_counts) loop
    select on_hand into v_cur from inventory_stock where location_code = p_location and sku_code = r->>'sku_code' for update;
    if not found then raise exception 'unknown sku %', r->>'sku_code'; end if;
    v_new := (r->>'on_hand')::numeric;
    perform inventory_apply_movement(p_location, r->>'sku_code', v_new - v_cur, 'count', null, null, v_session, r->>'note', p_counted_by);
    update inventory_stock set count_status = p_status, last_counted_at = p_counted_at, last_count_session_id = v_session
     where location_code = p_location and sku_code = r->>'sku_code';
  end loop;
  return v_session;
end $$;

-- Receiving (e.g. Friday truckload): [{"sku_code":"plantpal-1.5cf-bag","qty":660}]
create or replace function public.inventory_receive(p_items jsonb, p_note text default null, p_created_by text default null, p_location text default 'phx')
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(p_items) loop
    if inventory_apply_movement(p_location, r->>'sku_code', (r->>'qty')::numeric, 'receipt', null, null, null, p_note, p_created_by) is null then
      raise exception 'unknown sku %', r->>'sku_code';
    end if;
  end loop;
end $$;

-- ---------- orders: decrement on paid, restock on cancel/refund ----------
create or replace function public.inventory_apply_order_item(p_item_id integer)
returns void language plpgsql security definer set search_path = public as $$
declare it record; m record; v_loc text;
begin
  select oi.id, oi.order_id, oi.product_id, oi.size_option, oi.quantity into it from order_items oi where oi.id = p_item_id;
  if not found or coalesce(it.quantity,0) <= 0 then return; end if;
  for m in select * from inventory_variant_map vm where vm.product_id = it.product_id and vm.size_option = it.size_option loop
    if not exists (select 1 from inventory_movements where order_item_id = it.id and sku_code = m.sku_code and kind = 'sale') then
      perform inventory_apply_movement(m.location_code, m.sku_code, -(m.units_per_item * it.quantity), 'sale', it.order_id, it.id, null,
        format('%s x %s', it.quantity, it.size_option), 'order_paid');
    end if;
  end loop;
end $$;

create or replace function public.inventory_apply_order(p_order_id integer)
returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  for i in select id from order_items where order_id = p_order_id loop
    perform inventory_apply_order_item(i.id);
  end loop;
end $$;

create or replace function public.inventory_restock_order(p_order_id integer, p_reason text default 'cancelled')
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select * from inventory_movements mv where mv.order_id = p_order_id and mv.kind = 'sale'
           and not exists (select 1 from inventory_movements r where r.order_item_id = mv.order_item_id and r.sku_code = mv.sku_code and r.kind = 'restock') loop
    perform inventory_apply_movement(s.location_code, s.sku_code, -s.delta, 'restock', s.order_id, s.order_item_id, null, p_reason, 'order_' || p_reason);
  end loop;
end $$;

create or replace function public.trg_inventory_orders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if lower(coalesce(new.status,'')) in ('cancelled','canceled','refunded')
       or lower(coalesce(new.payment_status,'')) in ('refunded','cancelled','canceled') then
      if lower(coalesce(old.status,'')) is distinct from lower(coalesce(new.status,''))
         or lower(coalesce(old.payment_status,'')) is distinct from lower(coalesce(new.payment_status,'')) then
        perform inventory_restock_order(new.id, lower(coalesce(nullif(new.payment_status,'paid'), new.status)));
      end if;
    elsif new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
      perform inventory_apply_order(new.id);
    end if;
  exception when others then
    -- Never block an order/payment update because of inventory bookkeeping.
    insert into system_errors(kind, path, message) values ('inventory', 'trigger:orders', sqlerrm);
  end;
  return new;
end $$;

create or replace function public.trg_inventory_order_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if exists (select 1 from orders o where o.id = new.order_id and o.payment_status = 'paid'
               and lower(coalesce(o.status,'')) not in ('cancelled','canceled','refunded')) then
      perform inventory_apply_order_item(new.id);
    end if;
  exception when others then
    insert into system_errors(kind, path, message) values ('inventory', 'trigger:order_items', sqlerrm);
  end;
  return new;
end $$;

drop trigger if exists trg_inventory_orders on public.orders;
create trigger trg_inventory_orders after update of status, payment_status on public.orders
  for each row execute function public.trg_inventory_orders();
drop trigger if exists trg_inventory_order_items on public.order_items;
create trigger trg_inventory_order_items after insert on public.order_items
  for each row execute function public.trg_inventory_order_items();

-- ---------- storefront reads ----------
-- Available sellable units per product variant (bundles = min over components).
create or replace view public.inventory_variant_availability as
select vm.product_id, vm.size_option, vm.location_code,
       greatest(0, floor(min(s.on_hand / vm.units_per_item)))::integer as available,
       bool_and(s.count_status = 'confirmed') as confirmed,
       max(s.updated_at) as updated_at
from inventory_variant_map vm
join inventory_stock s on s.location_code = vm.location_code and s.sku_code = vm.sku_code
group by vm.product_id, vm.size_option, vm.location_code;
revoke all on public.inventory_variant_availability from anon, authenticated;

-- Oversell guard. p_items: [{"product_id":111,"size_option":"Pallet (30 x 1.5CF)","quantity":2}]
-- Aggregates demand per SKU across the cart (bags + pallets + bundles share stock).
create or replace function public.inventory_check_cart(p_items jsonb, p_location text default 'phx')
returns table(sku_code text, label text, requested numeric, on_hand numeric)
language sql stable security definer set search_path = public as $$
  with lines as (
    select (e->>'product_id')::int pid, e->>'size_option' sz, greatest(0, coalesce((e->>'quantity')::numeric,0)) q
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) e
  ), demand as (
    select vm.sku_code, sum(vm.units_per_item * l.q) req
    from lines l join inventory_variant_map vm on vm.product_id = l.pid and vm.size_option = l.sz and vm.location_code = p_location
    group by vm.sku_code
  )
  select d.sku_code, s.label, d.req, s.on_hand
  from demand d join inventory_stock s on s.location_code = p_location and s.sku_code = d.sku_code
  where d.req > s.on_hand;
$$;

revoke execute on function public.inventory_apply_movement(text,text,numeric,text,integer,integer,bigint,text,text),
  public.inventory_record_count(jsonb,text,text,text,text,text,text,timestamptz),
  public.inventory_receive(jsonb,text,text,text),
  public.inventory_apply_order_item(integer), public.inventory_apply_order(integer),
  public.inventory_restock_order(integer,text), public.inventory_check_cart(jsonb,text)
  from public, anon, authenticated;
