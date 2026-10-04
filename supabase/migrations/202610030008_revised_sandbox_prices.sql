-- Historical mappings remain valid for entitlement resolution, not new checkout.
update public.billing_prices set checkout_enabled=false where environment='sandbox'
and price_id in ('pri_01m3ytbd6gcsryxwe8fbfadsgz','pri_01m3ytbde7rh43snkbnee4atdh',
 'pri_01m3ytbdymdkjgr76nqp69drc1','pri_01m3ytbe6kjkrxa13zjy7gegkb');
insert into public.billing_prices(environment,price_id,tier,checkout_enabled) values
 ('sandbox','pri_01m41bn725t30w2ta3zjf181mx','pro',true),
 ('sandbox','pri_01m41bn7b9gww2020gar6d25v7','pro',true),
 ('sandbox','pri_01m41bn7n481yz3hhyw7pgyyce','advanced',true),
 ('sandbox','pri_01m41bn7yanzs6t1596hjd5n05','advanced',true);
