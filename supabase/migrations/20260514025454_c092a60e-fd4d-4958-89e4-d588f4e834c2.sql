-- Backfill order_item_options for existing iFood orders from PLC events
WITH plc AS (
  SELECT DISTINCT ON (order_id) order_id, payload->'order_details'->'items' AS items
  FROM ihub_events
  WHERE full_code = 'PLACED' AND payload->'order_details'->'items' IS NOT NULL
  ORDER BY order_id, created_at DESC
),
matched_items AS (
  SELECT
    o.id AS order_id,
    oi.id AS order_item_id,
    oi_idx.idx AS oi_idx,
    item AS payload_item
  FROM orders o
  JOIN plc ON plc.order_id = o.external_order_id
  JOIN LATERAL (
    SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS idx
    FROM order_items WHERE order_id = o.id
  ) oi_idx ON TRUE
  JOIN order_items oi ON oi.id = oi_idx.id
  JOIN LATERAL jsonb_array_elements(plc.items) WITH ORDINALITY AS t(item, ord) ON (t.ord - 1) = oi_idx.idx
  WHERE o.external_source = 'ifood'
    AND NOT EXISTS (SELECT 1 FROM order_item_options opt WHERE opt.order_item_id = oi.id)
),
flat_opts AS (
  SELECT
    mi.order_item_id,
    COALESCE(opt->>'groupName', 'Itens') AS group_name,
    CASE WHEN COALESCE((opt->>'quantity')::numeric, 1) > 1
         THEN ((opt->>'quantity')::int)::text || '× ' || COALESCE(opt->>'name','')
         ELSE COALESCE(opt->>'name','')
    END AS item_name,
    COALESCE(
      NULLIF((opt->>'addition')::numeric, 0),
      NULLIF((opt->>'unitPrice')::numeric, 0),
      CASE WHEN COALESCE((opt->>'quantity')::numeric, 1) > 0
           THEN COALESCE((opt->>'price')::numeric, 0) / COALESCE((opt->>'quantity')::numeric, 1)
           ELSE 0 END,
      0
    ) AS extra_price
  FROM matched_items mi
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(mi.payload_item->'options', '[]'::jsonb)) opt
  WHERE COALESCE(opt->>'name','') <> ''
)
INSERT INTO order_item_options (order_item_id, group_name, item_name, extra_price)
SELECT order_item_id, group_name, item_name, extra_price FROM flat_opts;