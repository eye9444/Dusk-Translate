-- Permanent production catalogue mappings. Public Paddle IDs are safe to store.
insert into public.billing_prices(environment, price_id, tier, checkout_enabled) values
  ('production', 'pri_01m448vhxb2ca4mjf274wv2hb4', 'pro', true),
  ('production', 'pri_01m448vjs9txa3ja1eqzzwn7wg', 'pro', true),
  ('production', 'pri_01m448vkcr2vk5k49j0zmzxnzt', 'advanced', true),
  ('production', 'pri_01m448vkpspsvzn4cgvtgft2ej', 'advanced', true)
on conflict (environment, price_id) do update
set tier = excluded.tier,
    checkout_enabled = excluded.checkout_enabled;
