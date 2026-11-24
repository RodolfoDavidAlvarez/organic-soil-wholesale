do $$
declare oid int; snap0 jsonb; snap1 jsonb; snap2 jsonb; snap3 jsonb; chk jsonb; chk2 jsonb; avail jsonb; mv jsonb;
begin
  select jsonb_object_agg(sku_code,on_hand) into snap0 from inventory_stock;
  insert into orders(order_items,business_name,phone,delivery_type,order_number,email,customer_email,customer_name,status,payment_status,subtotal,total,fulfillment_type,location_id,notes)
  values ('[]'::jsonb,'INVENTORY ROLLBACK TEST','0000000000','pickup','INVTEST-ROLLBACK','inventory-test@example.invalid','inventory-test@example.invalid','INVENTORY ROLLBACK TEST','pending_payment','pending',0,0,'pickup',1,'rollback test')
  returning id into oid;
  insert into order_items(order_id,product_id,size_option,quantity,unit_price,total_price,status) values
   (oid,111,'1.5CF Bag',2,7.69,15.38,'pending'),
   (oid,111,'Pallet (30 x 1.5CF)',1,230.79,230.79,'pending'),
   (oid,4102,'40-bag Phoenix pickup bundle',1,399,399,'pending'),
   (oid,1000,'Bulk Pickup',1,75,75,'pending');
  select jsonb_object_agg(sku_code,on_hand) into snap1 from inventory_stock;
  update orders set payment_status='paid', status='paid' where id=oid;
  select jsonb_object_agg(sku_code,on_hand) into snap2 from inventory_stock;
  update orders set payment_status='paid', status='confirmed' where id=oid;   -- repeat paid: must not double count
  insert into order_items(order_id,product_id,size_option,quantity,unit_price,total_price,status)
   values (oid,1001,'9lb Bag',3,1,3,'reserved');                               -- item added to an already-paid order
  select jsonb_agg(jsonb_build_array(kind,sku_code,delta)) into mv from inventory_movements where order_id=oid;
  update orders set status='cancelled', payment_status='cancelled' where id=oid;
  select jsonb_object_agg(sku_code,on_hand) into snap3 from inventory_stock;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into chk from inventory_check_cart('[{"product_id":111,"size_option":"Pallet (30 x 1.5CF)","quantity":5},{"product_id":4101,"size_option":"16-bag Phoenix pickup bundle","quantity":2}]'::jsonb) c;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into chk2 from inventory_check_cart('[{"product_id":111,"size_option":"Pallet (30 x 1.5CF)","quantity":5}]'::jsonb) c;
  select jsonb_agg(jsonb_build_array(product_id,size_option,available)) into avail from inventory_variant_availability;
  raise exception 'ROLLBACK_RESULT %', jsonb_build_object('before',snap0,'pending',snap1,'paid',snap2,'movements_while_paid',mv,'after_cancel',snap3,
    'oversell_5pal_2bundles',chk,'check_5pal',chk2,'avail',avail,
    'errors',(select jsonb_agg(message) from system_errors where kind='inventory'));
end $$;
