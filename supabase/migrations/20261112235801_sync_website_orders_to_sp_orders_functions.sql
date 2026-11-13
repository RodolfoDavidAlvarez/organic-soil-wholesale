-- Functions and trigger that copy a paid public.orders row into sp_orders,
-- sp_order_items, and sp_order_payments. The copy is idempotent, does not
-- create commissions, and a trigger error must never block checkout.
-- Applied live on 2026-11-12 to Supabase project govktyrtmwzbzqkmzmrf
-- (version 20261112235801, sync_website_orders_to_sp_orders_functions).
-- Sync log and indexes:
-- 20261112235722_sync_website_orders_to_sp_orders.sql.

CREATE OR REPLACE FUNCTION public.sync_osw_web_order_to_sp(p_order_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  w public.orders%ROWTYPE;
  v_label text;
  v_existing_id integer;
  v_order_number text;
  v_fulfillment text;
  v_status text;
  v_total_cents integer;
  v_delivery_cents integer;
  v_tax_cents integer;
  v_discount_cents integer;
  v_product_cents integer;
  v_paid_at timestamptz;
  v_created_at timestamptz;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_customer_id integer;
  v_rep_id integer;
  v_rep_name text;
  v_rep_email text;
  v_city text;
  v_state text;
  v_zip text;
  v_street text;
  v_first jsonb;
  v_item jsonb;
  v_sort integer;
  v_unit_cents integer;
  v_line_cents integer;
  v_qty integer;
  v_line_sum_raw numeric;
  v_line_sum_as_dollars integer;
  v_items_are_dollars boolean;
  v_sp_id integer;
  v_header_name text;
  v_header_size text;
  v_header_qty integer;
  v_header_unit integer;
  v_header_product_id integer;
  v_notes text;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO w FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    INSERT INTO public.osw_web_order_sync_log(website_order_id, event, message)
    VALUES (p_order_id, 'skipped', 'Website order not found');
    RETURN NULL;
  END IF;

  v_label := 'OSW web #' || w.id::text;

  -- Already synced (by website id label or Stripe PI).
  SELECT id INTO v_existing_id
  FROM public.sp_orders
  WHERE internal_label = v_label
     OR (
       w.stripe_payment_intent_id IS NOT NULL
       AND stripe_payment_intent_id = w.stripe_payment_intent_id
     )
  ORDER BY id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    INSERT INTO public.osw_web_order_sync_log(website_order_id, sp_order_id, event, message)
    VALUES (w.id, v_existing_id, 'skipped', 'Already present in sp_orders');
    RETURN v_existing_id;
  END IF;

  IF COALESCE(w.payment_status, '') IN ('refunded', 'partially_refunded')
     OR COALESCE(w.status, '') IN ('refunded', 'partially_refunded') THEN
    INSERT INTO public.osw_web_order_sync_log(website_order_id, event, message)
    VALUES (w.id, 'skipped', 'Refunded website order');
    RETURN NULL;
  END IF;

  IF NOT (
    COALESCE(w.payment_status, '') IN ('paid', 'completed')
    OR COALESCE(w.status, '') IN ('paid', 'complete', 'completed')
  ) THEN
    INSERT INTO public.osw_web_order_sync_log(website_order_id, event, message)
    VALUES (w.id, 'skipped', 'Not paid (status=' || COALESCE(w.status, '') || ', payment_status=' || COALESCE(w.payment_status, '') || ')');
    RETURN NULL;
  END IF;

  v_total_cents := COALESCE(w.total, 0);
  IF v_total_cents <= 0 THEN
    INSERT INTO public.osw_web_order_sync_log(website_order_id, event, message)
    VALUES (w.id, 'skipped', 'Zero or empty total');
    RETURN NULL;
  END IF;

  v_delivery_cents := COALESCE(w.trucking_fee_cents, 0);
  v_tax_cents := CASE
    WHEN w.tax_amount IS NULL THEN 0
    ELSE ROUND(w.tax_amount::numeric * 100)::integer
  END;
  v_discount_cents := COALESCE(w.discount, 0);
  v_product_cents := GREATEST(0, v_total_cents - v_delivery_cents - v_tax_cents);
  v_paid_at := COALESCE(w.paid_at, timezone('utc', w.created_at));
  v_created_at := COALESCE(timezone('utc', w.created_at), w.paid_at, now());

  v_fulfillment := CASE
    WHEN lower(COALESCE(w.fulfillment_type, w.delivery_type, w.order_type, '')) IN ('delivery', 'deliver') THEN 'delivery'
    ELSE 'pickup'
  END;
  v_status := 'submitted';

  -- Line items on the website are stored in dollars; header totals are cents.
  v_line_sum_raw := 0;
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(w.order_items, '[]'::jsonb))
  LOOP
    v_line_sum_raw := v_line_sum_raw + COALESCE(
      NULLIF(v_item->>'total', '')::numeric,
      COALESCE(NULLIF(v_item->>'price', '')::numeric, 0)
        * COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1)
    );
  END LOOP;
  v_line_sum_as_dollars := ROUND(COALESCE(v_line_sum_raw, 0) * 100)::integer;
  v_items_are_dollars := ABS(v_line_sum_as_dollars - v_product_cents) <= 2
    OR ABS(ROUND(COALESCE(v_line_sum_raw, 0)) - v_product_cents) > 2;

  v_email := NULLIF(lower(btrim(COALESCE(w.customer_email, w.email))), '');
  v_phone := NULLIF(btrim(COALESCE(w.phone, w.customer_phone_formatted)), '');
  v_phone_digits := NULLIF(right(regexp_replace(COALESCE(v_phone, ''), '[^0-9]', '', 'g'), 10), '');

  SELECT cu.id, cu.assigned_to_user_id
    INTO v_customer_id, v_rep_id
  FROM public.sp_customers cu
  WHERE (v_email IS NOT NULL AND lower(cu.email) = v_email)
     OR (
       v_phone_digits IS NOT NULL
       AND right(regexp_replace(COALESCE(cu.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone_digits
     )
  ORDER BY
    CASE WHEN v_email IS NOT NULL AND lower(cu.email) = v_email THEN 0 ELSE 1 END,
    CASE WHEN cu.assigned_to_user_id IS NOT NULL THEN 0 ELSE 1 END,
    cu.updated_at DESC NULLS LAST,
    cu.id DESC
  LIMIT 1;

  IF v_customer_id IS NULL AND (v_email IS NOT NULL OR v_phone IS NOT NULL OR COALESCE(w.customer_name, '') <> '') THEN
    BEGIN
      INSERT INTO public.sp_customers (full_name, email, phone, source, stage, first_contact_at)
      VALUES (
        NULLIF(btrim(COALESCE(w.customer_name, w.business_name, 'Website customer')), ''),
        v_email,
        v_phone,
        'osw_checkout',
        'customer',
        v_created_at
      )
      RETURNING id, assigned_to_user_id INTO v_customer_id, v_rep_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT cu.id, cu.assigned_to_user_id
        INTO v_customer_id, v_rep_id
      FROM public.sp_customers cu
      WHERE v_email IS NOT NULL AND lower(cu.email) = v_email
      LIMIT 1;
    END;
  END IF;

  -- If the matched customer has no owner, a clearly accepted lead can supply one.
  IF v_rep_id IS NULL AND (v_email IS NOT NULL OR v_phone_digits IS NOT NULL) THEN
    SELECT l.accepted_by_user_id
      INTO v_rep_id
    FROM public.sp_leads l
    WHERE l.accepted_by_user_id IS NOT NULL
      AND (
        (v_email IS NOT NULL AND lower(l.email) = v_email)
        OR (
          v_phone_digits IS NOT NULL
          AND right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone_digits
        )
      )
    ORDER BY l.accepted_at DESC NULLS LAST, l.id DESC
    LIMIT 1;
  END IF;

  IF v_rep_id IS NOT NULL THEN
    SELECT full_name, email INTO v_rep_name, v_rep_email
    FROM public.sp_users
    WHERE id = v_rep_id;
  END IF;

  v_zip := NULLIF(btrim(COALESCE(w.delivery_zip, '')), '');
  v_street := NULLIF(btrim(COALESCE(w.address, '')), '');
  IF v_street IS NOT NULL AND v_street LIKE '%,%' THEN
    -- "14117 East Aloe Vera Drive, Scottsdale, AZ, 85262"
    v_city := NULLIF(btrim(split_part(v_street, ',', 2)), '');
    v_state := NULLIF(btrim(split_part(v_street, ',', 3)), '');
    IF v_zip IS NULL THEN
      v_zip := NULLIF(btrim(split_part(v_street, ',', 4)), '');
    END IF;
    v_street := NULLIF(btrim(split_part(w.address, ',', 1)), '');
  END IF;
  IF v_state IS NOT NULL AND length(v_state) > 2 AND v_state LIKE '% %' THEN
    -- tolerate "AZ 85262" in the state slot
    IF v_zip IS NULL THEN
      v_zip := NULLIF(btrim(regexp_replace(v_state, '.*\s', '')), '');
    END IF;
    v_state := NULLIF(btrim(split_part(v_state, ' ', 1)), '');
  END IF;
  v_state := COALESCE(NULLIF(v_state, ''), 'AZ');

  v_first := COALESCE(w.order_items -> 0, '{}'::jsonb);
  v_header_name := COALESCE(NULLIF(v_first->>'name', ''), 'Website order');
  v_header_size := NULLIF(v_first->>'size', '');
  v_header_qty := GREATEST(COALESCE(NULLIF(v_first->>'quantity', '')::integer, 1), 1);
  v_header_product_id := NULLIF(v_first->>'product_id', '')::integer;
  IF v_items_are_dollars THEN
    v_header_unit := ROUND(COALESCE(NULLIF(v_first->>'price', '')::numeric, 0) * 100)::integer;
  ELSE
    v_header_unit := ROUND(COALESCE(NULLIF(v_first->>'price', '')::numeric, 0))::integer;
  END IF;

  v_order_number := 'SP-'
    || to_char(v_paid_at AT TIME ZONE 'America/Phoenix', 'YYYYMMDD')
    || '-'
    || upper(substr(md5('osw-web-' || w.id::text), 1, 8));

  IF EXISTS (SELECT 1 FROM public.sp_orders WHERE order_number = v_order_number) THEN
    v_order_number := 'SP-'
      || to_char(v_paid_at AT TIME ZONE 'America/Phoenix', 'YYYYMMDD')
      || '-'
      || upper(substr(md5('osw-web-' || w.id::text || '-' || COALESCE(w.stripe_payment_intent_id, '')), 1, 8));
  END IF;

  v_notes := concat_ws(
    E'\n',
    'Imported from OSW website checkout public.orders id ' || w.id::text || '.',
    NULLIF(w.notes, ''),
    CASE WHEN w.stripe_checkout_session_id IS NOT NULL
      THEN 'Stripe Checkout ' || w.stripe_checkout_session_id
    END
  );

  INSERT INTO public.sp_orders (
    order_number, user_id, organization_id,
    product_id, product_name, size_category, size_category_name,
    quantity, quantity_type, unit_price, discount_percent, subtotal,
    delivery_address, delivery_city, delivery_state, delivery_zip,
    delivery_date, delivery_notes, delivery_fee, delivery_fee_reason,
    fulfillment_method, status, payment_status, payment_schedule, payment_channel,
    payment_collection_owner, amount_paid_cents, payment_request_cents,
    tax_enabled, tax_cents, discount_cents, deposit_required,
    customer_id, customer_name, customer_company, customer_phone, customer_email,
    account_owner_user_id, account_owner_name, account_owner_email,
    stripe_payment_intent_id, stripe_invoice_id,
    paid_at, created_at, updated_at,
    order_notes, admin_notes, internal_label, is_custom, pickup_location_code
  ) VALUES (
    v_order_number,
    v_rep_id,
    NULL,
    v_header_product_id,
    v_header_name,
    CASE WHEN v_header_size IS NULL THEN NULL ELSE 'custom' END,
    v_header_size,
    v_header_qty,
    'unit',
    v_header_unit,
    0,
    v_product_cents,
    CASE WHEN v_fulfillment = 'delivery' THEN COALESCE(v_street, w.address) ELSE NULL END,
    CASE WHEN v_fulfillment = 'delivery' THEN v_city ELSE NULL END,
    CASE WHEN v_fulfillment = 'delivery' THEN v_state ELSE NULL END,
    CASE WHEN v_fulfillment = 'delivery' THEN v_zip ELSE NULL END,
    CASE WHEN v_fulfillment = 'delivery' THEN w.preferred_date ELSE NULL END,
    NULLIF(w.special_instructions, ''),
    v_delivery_cents,
    CASE WHEN v_delivery_cents > 0 THEN 'Website checkout delivery / trucking fee' ELSE NULL END,
    v_fulfillment,
    v_status,
    'paid',
    'full',
    NULL,
    'legacy',
    v_total_cents,
    v_total_cents,
    (v_tax_cents > 0),
    v_tax_cents,
    v_discount_cents,
    false,
    v_customer_id,
    NULLIF(btrim(COALESCE(w.customer_name, w.business_name)), ''),
    NULLIF(btrim(COALESCE(w.business_name, '')), ''),
    v_phone,
    v_email,
    v_rep_id,
    v_rep_name,
    v_rep_email,
    w.stripe_payment_intent_id,
    NULL,
    v_paid_at,
    v_created_at,
    COALESCE(timezone('utc', w.updated_at), v_paid_at),
    v_notes,
    'Automatic bridge from organicsoilwholesale.com checkout. No commission was created.',
    v_label,
    (v_header_product_id IS NULL),
    CASE WHEN v_fulfillment = 'pickup' THEN NULLIF(w.pickup_location, '') ELSE NULL END
  )
  RETURNING id INTO v_sp_id;

  v_sort := 0;
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(w.order_items, '[]'::jsonb))
  LOOP
    v_qty := GREATEST(COALESCE(NULLIF(v_item->>'quantity', '')::integer, 1), 1);
    IF v_items_are_dollars THEN
      v_unit_cents := ROUND(COALESCE(NULLIF(v_item->>'price', '')::numeric, 0) * 100)::integer;
      v_line_cents := ROUND(COALESCE(
        NULLIF(v_item->>'total', '')::numeric,
        COALESCE(NULLIF(v_item->>'price', '')::numeric, 0) * v_qty
      ) * 100)::integer;
    ELSE
      v_unit_cents := ROUND(COALESCE(NULLIF(v_item->>'price', '')::numeric, 0))::integer;
      v_line_cents := ROUND(COALESCE(
        NULLIF(v_item->>'total', '')::numeric,
        COALESCE(NULLIF(v_item->>'price', '')::numeric, 0) * v_qty
      ))::integer;
    END IF;

    INSERT INTO public.sp_order_items (
      order_id, product_id, product_name, size_category, size_category_name,
      quantity, quantity_type, total_units, unit_price, subtotal, sort_order,
      line_description, is_custom, line_discount_percent, line_discount_cents,
      gross_subtotal_cents, created_at
    ) VALUES (
      v_sp_id,
      NULLIF(v_item->>'product_id', '')::integer,
      COALESCE(NULLIF(v_item->>'name', ''), v_header_name),
      CASE WHEN NULLIF(v_item->>'size', '') IS NULL THEN NULL ELSE 'custom' END,
      NULLIF(v_item->>'size', ''),
      v_qty,
      'unit',
      v_qty,
      v_unit_cents,
      v_line_cents,
      v_sort,
      NULLIF(v_item->>'size', ''),
      (NULLIF(v_item->>'product_id', '') IS NULL),
      0,
      0,
      v_line_cents,
      v_created_at
    );
    v_sort := v_sort + 1;
  END LOOP;

  IF w.stripe_payment_intent_id IS NOT NULL THEN
    INSERT INTO public.sp_order_payments (
      provider_id, order_id, amount_cents, stripe_invoice_id, stripe_charge_id, refund_cents, created_at
    ) VALUES (
      w.stripe_payment_intent_id,
      v_sp_id,
      v_total_cents,
      NULL,
      NULL,
      0,
      v_paid_at
    )
    ON CONFLICT (provider_id) DO NOTHING;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.sp_customers
    SET last_order_id = v_sp_id,
        last_order_at = v_paid_at,
        stage = CASE WHEN stage IN ('lead', 'lost') THEN 'customer' ELSE stage END,
        updated_at = now()
    WHERE id = v_customer_id
      AND (last_order_at IS NULL OR last_order_at <= v_paid_at);
  END IF;

  INSERT INTO public.osw_web_order_sync_log(website_order_id, sp_order_id, event, message)
  VALUES (w.id, v_sp_id, 'synced', 'Copied paid website order ' || v_total_cents::text || ' cents');

  RETURN v_sp_id;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.osw_web_order_sync_log(website_order_id, event, message)
    VALUES (p_order_id, 'error', SQLERRM);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sync_osw_web_orders_backfill()
RETURNS TABLE(
  website_order_id integer,
  sp_order_id integer,
  event text,
  message text,
  amount_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r record;
  v_id integer;
  v_event text;
  v_message text;
BEGIN
  FOR r IN
    SELECT o.id, o.total
    FROM public.orders o
    WHERE (o.payment_status IN ('paid', 'completed') OR o.status IN ('paid', 'complete', 'completed'))
      AND COALESCE(o.total, 0) > 0
    ORDER BY o.id
  LOOP
    v_id := public.sync_osw_web_order_to_sp(r.id);
    SELECT l.event, l.message
      INTO v_event, v_message
    FROM public.osw_web_order_sync_log l
    WHERE l.website_order_id = r.id
    ORDER BY l.id DESC
    LIMIT 1;
    website_order_id := r.id;
    sp_order_id := v_id;
    event := COALESCE(v_event, 'unknown');
    message := v_message;
    amount_cents := r.total;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trg_sync_osw_web_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  BEGIN
    PERFORM public.sync_osw_web_order_to_sp(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.osw_web_order_sync_log(website_order_id, event, message)
      VALUES (NEW.id, 'error', 'Trigger caught: ' || SQLERRM);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_sync_to_sp_orders ON public.orders;
CREATE TRIGGER trg_orders_sync_to_sp_orders
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
WHEN (
  NEW.payment_status IN ('paid', 'completed')
  OR NEW.status IN ('paid', 'complete', 'completed')
)
EXECUTE FUNCTION public.trg_sync_osw_web_order();

COMMENT ON FUNCTION public.sync_osw_web_order_to_sp(integer) IS
  'Idempotent copy of one paid website order into sp_orders. Never creates commissions. Errors are logged and swallowed.';
