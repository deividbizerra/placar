-- Placar · migration 0003 · vendas pelo n8n (WhatsApp) e câmbio do dia
ALTER TABLE sales ADD COLUMN lead_id TEXT;
ALTER TABLE sales ADD COLUMN ad_id TEXT;          -- quando o n8n conhece o id do anúncio (mais preciso que o nome)
CREATE INDEX IF NOT EXISTS sales_lead ON sales (offer_id, lead_id);
CREATE INDEX IF NOT EXISTS sales_ad_id ON sales (ad_id);
-- spend_cents passa a ser SEMPRE em BRL; o valor original da conta fica guardado
ALTER TABLE spend ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE spend ADD COLUMN spend_orig_cents INTEGER;
ALTER TABLE spend ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1;
ALTER TABLE spend ADD COLUMN fx_day TEXT;         -- dia da cotação usada (fim de semana/feriado usa o último dia útil)
-- leads (conversa iniciada no WhatsApp) ficam em events kind='lead', ref = lead_id
CREATE UNIQUE INDEX IF NOT EXISTS events_lead_unique ON events (offer_id, kind, ref) WHERE kind = 'lead';
INSERT OR IGNORE INTO config (key, value) VALUES ('fx_markup', '0');
