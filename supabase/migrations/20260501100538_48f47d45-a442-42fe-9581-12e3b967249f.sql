-- Adiciona tipo de pedido (delivery / retirada)
CREATE TYPE public.order_type AS ENUM ('delivery', 'pickup');

ALTER TABLE public.orders
  ADD COLUMN order_type public.order_type NOT NULL DEFAULT 'delivery';

-- Permite endereço nulo para pedidos de retirada
ALTER TABLE public.orders ALTER COLUMN address_cep DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN address_street DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN address_number DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN address_neighborhood DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN address_city DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN address_state DROP NOT NULL;

-- Novo status: aguardando retirada
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_pickup';