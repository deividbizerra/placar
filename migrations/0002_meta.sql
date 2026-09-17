-- Placar · migration 0002 · ligação com a Meta
ALTER TABLE sales ADD COLUMN gateway TEXT;
-- Corte automático só roda com a chave ligada E quando a oferta já recebe vendas por webhook
-- (sem webhook, todo anúncio teria "zero venda" e seria pausado).
INSERT OR IGNORE INTO config (key, value) VALUES ('auto_cut', 'false');
CREATE INDEX IF NOT EXISTS spend_ad ON spend (ad_id);
