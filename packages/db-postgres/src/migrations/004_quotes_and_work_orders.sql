-- ESR Cloud Phase 5: quote/work-order commercial fields and numbering.
-- Uses existing tables quotations, quotation_items, work_orders, work_order_items.

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quote_number TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS end_date TEXT;

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'reserved';

ALTER TABLE work_order_stock_reservations ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE work_order_stock_reservations ADD COLUMN IF NOT EXISTS end_date TEXT;

CREATE INDEX IF NOT EXISTS quotations_company_quote_number_idx ON quotations (company_id, quote_number);
CREATE INDEX IF NOT EXISTS quotations_company_event_id_idx ON quotations (company_id, event_id);
CREATE INDEX IF NOT EXISTS quotation_items_company_quote_id_idx ON quotation_items (company_id, quotation_id);
CREATE INDEX IF NOT EXISTS work_orders_company_order_number_idx ON work_orders (company_id, order_number);
CREATE INDEX IF NOT EXISTS work_orders_company_quotation_id_idx ON work_orders (company_id, quotation_id);
