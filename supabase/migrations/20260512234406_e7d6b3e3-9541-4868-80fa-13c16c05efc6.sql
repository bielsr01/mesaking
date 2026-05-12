UPDATE public.order_items
SET unit_price = 16.00,
    notes = '1× Complemento 1 - Segundo Nível • 1× Complemento 2 - Segundo Nível • 1× Complemento 3 - Segundo Nível • 1× Complemento 4 - Segundo Nível • ↳ 1× Customização 1 do Complemento 4 - Terceiro Nível • ↳ 1× Customização 2 do Complemento 4 - Terceiro Nível • ↳ 1× Customização 3 do Complemento 4 - Terceiro Nível'
WHERE order_id = 'b0b127b3-d124-495e-a1bc-44b0c365e325'
  AND product_name = 'PRODUTO 2 (COMBO) - NÃO ENTREGAR - Primeiro Nível';

UPDATE public.orders
SET payment_method = 'online'
WHERE id = 'b0b127b3-d124-495e-a1bc-44b0c365e325';