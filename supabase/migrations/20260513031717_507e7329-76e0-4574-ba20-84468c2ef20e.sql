
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.admin_expenses ADD COLUMN IF NOT EXISTS receipt_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Expense receipts public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated upload expense receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated update expense receipts"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated delete expense receipts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'expense-receipts');
