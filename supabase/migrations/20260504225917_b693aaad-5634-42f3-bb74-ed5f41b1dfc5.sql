-- Adiciona tipo 'pdv' ao enum order_type
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'pdv';

-- Adiciona colunas de desconto e taxa de serviço para pedidos
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0;