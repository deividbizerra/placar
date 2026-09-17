-- Placar · migration 0001 · schema inicial
-- Dinheiro sempre em centavos (INTEGER). Datas em ISO-8601 UTC; "dia" em America/Sao_Paulo (YYYY-MM-DD).

CREATE TABLE offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,          -- usado em /wh/<plataforma>/<slug> e /go/<slug>
  name            TEXT    NOT NULL,
  platform        TEXT    NOT NULL DEFAULT 'ggcheckout',
  webhook_token   TEXT    NOT NULL,                 -- gerado pelo Worker; exigido em ?token= ou header
  pixel_id        TEXT,
  capi_token      TEXT,                             -- opcional; nunca devolvido pela API (só "definido")
  capi_secret     TEXT,                             -- alternativa: nome do secret do Worker (ex.: CAPI_GUIA)
  ad_account_id   TEXT,                             -- act_123...
  campaign_filter TEXT,                             -- substrings separadas por |; vazio = resto da conta
  page_url        TEXT,                             -- destino do /go/
  page_url_b      TEXT,                             -- variante ?lp=b
  ticket_target_cents INTEGER,
  cpa_target_cents    INTEGER,
  cut_spend_cents     INTEGER,                      -- X do corte automático; NULL = corte desligado
  hidden          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id        INTEGER NOT NULL REFERENCES offers(id),
  platform        TEXT    NOT NULL,
  order_id        TEXT    NOT NULL,                 -- dedupe
  status          TEXT    NOT NULL CHECK (status IN ('paid','pending','refunded','chargeback','abandoned')),
  product         TEXT,
  gross_cents     INTEGER NOT NULL DEFAULT 0,       -- bruto (inclui bumps)
  fee_cents       INTEGER NOT NULL DEFAULT 0,       -- taxa da plataforma
  bump_cents      INTEGER NOT NULL DEFAULT 0,
  bumps_json      TEXT,                             -- [{name, cents}]
  method          TEXT,                             -- pix | card | boleto | outro
  customer_email  TEXT,                             -- PII: só usado p/ CAPI e LTV; nunca sai em endpoint público
  customer_name   TEXT,
  customer_phone  TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  sck             TEXT,                             -- id de sessão do /go/ (ou ty_<sessão> vindo da página de obrigado)
  no_utm          INTEGER NOT NULL DEFAULT 0,       -- venda chegou sem utm_content
  fbc TEXT, fbp TEXT, ip TEXT, ua TEXT,
  paid_at         TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  capi_event_id   TEXT,
  capi_sent_at    TEXT,
  raw_json        TEXT,
  UNIQUE (platform, order_id)
);
CREATE INDEX sales_offer_status_paid ON sales (offer_id, status, paid_at);
CREATE INDEX sales_created ON sales (offer_id, created_at);
CREATE INDEX sales_ad ON sales (utm_content);
CREATE INDEX sales_email ON sales (customer_email);

-- Log genérico: webhook bruto, envio CAPI, mudanças (corte, orçamento, status) que viram marcas no gráfico por dia
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id    INTEGER REFERENCES offers(id),
  kind        TEXT NOT NULL,        -- webhook | capi | change | sync
  subkind     TEXT,                 -- paid/pending... | Purchase/InitiateCheckout | cut/budget/status | ok/error
  ref         TEXT,                 -- order_id, ad_id, event_id...
  detail_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX events_offer_kind ON events (offer_id, kind, created_at);

-- Meta Marketing API, level=ad, time_increment=1
CREATE TABLE spend (
  day            TEXT NOT NULL,     -- YYYY-MM-DD (fuso da conta)
  ad_id          TEXT NOT NULL,
  offer_id       INTEGER REFERENCES offers(id),   -- carimbado por mapa manual > filtro > resto da conta
  account_id     TEXT NOT NULL,
  campaign_id    TEXT, campaign_name TEXT,
  adset_id       TEXT, adset_name    TEXT,
  ad_name        TEXT,
  spend_cents    INTEGER NOT NULL DEFAULT 0,
  impressions    INTEGER NOT NULL DEFAULT 0,
  clicks         INTEGER NOT NULL DEFAULT 0,
  link_clicks    INTEGER NOT NULL DEFAULT 0,
  synced_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (day, ad_id)
);
CREATE INDEX spend_offer_day ON spend (offer_id, day);
CREATE INDEX spend_campaign ON spend (campaign_id);

-- Redirecionador /go/<oferta>
CREATE TABLE clicks (
  session_id   TEXT PRIMARY KEY,
  offer_id     INTEGER NOT NULL REFERENCES offers(id),
  variant      TEXT NOT NULL DEFAULT 'a',
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  fbclid TEXT, fbc TEXT,
  ip TEXT, ua TEXT, country TEXT, device TEXT,
  is_bot       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX clicks_offer_created ON clicks (offer_id, created_at);

-- Beacon /api/pulso
CREATE TABLE pulse (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  offer_id    INTEGER NOT NULL REFERENCES offers(id),
  variant     TEXT,
  type        TEXT NOT NULL CHECK (type IN ('view','section','click','modal_shown','modal_accept','modal_decline','exit')),
  section     TEXT,
  button      TEXT,               -- id do botão; relatório usa button@section
  target      TEXT,               -- host do link (identifica gateway em "iniciados")
  time_ms     INTEGER,
  scroll_pct  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX pulse_offer_type ON pulse (offer_id, type, created_at);
CREATE INDEX pulse_session ON pulse (session_id);

-- Chave/valor: imposto, régua do funil, regras de veredito, mapa campanha→oferta (campaign_map:<id>), cache de status ao vivo
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,       -- JSON
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE cuts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id        INTEGER NOT NULL REFERENCES offers(id),
  ad_id           TEXT NOT NULL,
  ad_name         TEXT,
  spend_cents     INTEGER NOT NULL,
  threshold_cents INTEGER NOT NULL,
  meta_response   TEXT,
  ok              INTEGER NOT NULL DEFAULT 0,
  dismissed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX cuts_open ON cuts (dismissed_at, created_at);

INSERT INTO config (key, value) VALUES
  ('tax_rate', '0'),
  ('funnel_refs', '{"click_checkout":0.15,"checkout_paid":0.85,"bump":0.20}'),
  ('verdict', '{"scale_min_sales":3,"scale_min_roas":1.3,"kill_roas":0.8,"kill_spend_mult":2}');
