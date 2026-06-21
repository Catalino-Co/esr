-- ESR Cloud Phase 6: operational delivery/return fields on existing tables.
-- Uses conduces (not delivery_notes), work_order_checklists, incidents, stock_movements.

ALTER TABLE conduces ADD COLUMN IF NOT EXISTS note_number TEXT;
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS conduce_type TEXT DEFAULT 'entrega';
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS received_by_name TEXT;
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS received_by_document TEXT;
ALTER TABLE conduces ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE conduce_items ADD COLUMN IF NOT EXISTS work_order_item_id BIGINT;
ALTER TABLE conduce_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE conduce_items ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS delivered_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS work_order_item_id BIGINT;

CREATE INDEX IF NOT EXISTS conduces_company_note_number_idx ON conduces (company_id, note_number);
CREATE INDEX IF NOT EXISTS conduces_company_work_order_idx ON conduces (company_id, work_order_id);
CREATE INDEX IF NOT EXISTS conduces_company_type_idx ON conduces (company_id, conduce_type);
CREATE INDEX IF NOT EXISTS conduce_items_company_conduce_idx ON conduce_items (company_id, conduce_id);
CREATE INDEX IF NOT EXISTS work_order_checklists_company_wo_idx ON work_order_checklists (company_id, work_order_id);
CREATE INDEX IF NOT EXISTS stock_movements_company_wo_idx ON stock_movements (company_id, work_order_id);
