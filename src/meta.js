import { todaySP, addDays, getConfig, setConfig, logEvent, brl } from './util.js';
import { restampAll } from './offers.js';
import { fxResolver } from './fx.js';

export class MetaError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
const base = (env) => (env.META_GRAPH_URL || 'https://graph.facebook.com') + '/' + (env.META_API_VERSION || 'v25.0');

export async function graph(env, path, params = {}, method = 'GET') {
  if (!env.META_TOKEN) throw new MetaError('Secret META_TOKEN não configurado no Worker');
  const url = new URL(base(env) + path);
  let body;
  if (method === 'GET') for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  else body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  let r, j;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(url, { method, body, headers: { authorization: 'Bearer ' + env.META_TOKEN, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) } });
    j = await r.json().catch(() => ({}));
    const code = j?.error?.code;
    // limite de chamadas / erro temporário → espera e tenta de novo
    if ((r.status >= 500 || code === 4 || code === 17 || code === 32 || code === 613 || j?.error?.is_transient) && attempt < 2) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
    break;
  }
  if (!r.ok || j.error) throw new MetaError(j?.error?.error_user_msg || j?.error?.message || `Meta respondeu ${r.status}`, j?.error?.code);
  return j;
}
export async function graphAll(env, path, params) {
  const out = []; let after;
  for (let page = 0; page < 200; page++) {
    const j = await graph(env, path, after ? { ...params, after } : params);
    out.push(...(j.data || []));
    after = j.paging?.cursors?.after;
    if (!j.paging?.next || !after) break;
  }
  return out;
}

const cents = (v) => Math.round(parseFloat(v || '0') * 100);
const linkClicks = (row) => row.inline_link_clicks != null ? +row.inline_link_clicks : (row.actions || []).filter(a => a.action_type === 'link_click').reduce((s, a) => s + +a.value, 0);

/* ---------- sync de insights (level=ad, time_increment=1) ---------- */
export async function syncMeta(env, { days = 3 } = {}) {
  days = Math.min(Math.max(1, Math.floor(days)), 90);
  const { results: offers } = await env.DB.prepare('SELECT DISTINCT ad_account_id FROM offers WHERE ad_account_id IS NOT NULL').all();
  const until = todaySP(), since = addDays(until, -(days - 1));
  const report = { since, until, accounts: [], rows: 0, errors: [] };
  for (const { ad_account_id: acc } of offers) {
    try {
      let n = 0;
      const info = await accountInfo(env, acc);
      const fx = await fxResolver(env, info.currency, since, until);
      let skipped = 0;
      // janelas de 7 dias pra não estourar tempo de resposta da Meta
      for (let s = since; s <= until; s = addDays(s, 7)) {
        const e = addDays(s, 6) < until ? addDays(s, 6) : until;
        const rows = await graphAll(env, `/${acc}/insights`, {
          level: 'ad', time_increment: 1, time_range: { since: s, until: e }, limit: 500,
          fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,date_start',
        });
        const stmts = [];
        for (const r of rows) {
          const orig = cents(r.spend), q = fx(r.date_start);
          if (!q) { skipped++; continue; } // sem cotação: não grava número inventado; próxima sync tenta de novo
          stmts.push(env.DB.prepare(`INSERT INTO spend (day, ad_id, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_name, spend_cents, impressions, clicks, link_clicks, currency, spend_orig_cents, fx_rate, fx_day, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ON CONFLICT(day, ad_id) DO UPDATE SET account_id=excluded.account_id, campaign_id=excluded.campaign_id, campaign_name=excluded.campaign_name, adset_id=excluded.adset_id, adset_name=excluded.adset_name, ad_name=excluded.ad_name,
            spend_cents=excluded.spend_cents, impressions=excluded.impressions, clicks=excluded.clicks, link_clicks=excluded.link_clicks, currency=excluded.currency, spend_orig_cents=excluded.spend_orig_cents, fx_rate=excluded.fx_rate, fx_day=excluded.fx_day, synced_at=excluded.synced_at`)
          .bind(r.date_start, r.ad_id, acc, r.campaign_id, r.campaign_name, r.adset_id, r.adset_name, r.ad_name, Math.round(orig * q.rate), +r.impressions || 0, +r.clicks || 0, linkClicks(r), info.currency, orig, q.rate, q.fx_day));
        }
        for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
        n += rows.length;
      }
      report.accounts.push({ account: acc, rows: n, currency: info.currency, sem_cotacao: skipped }); report.rows += n;
      if (skipped) report.errors.push({ account: acc, error: `${skipped} linha(s) sem cotação ${info.currency} — tentarei de novo na próxima sync` });
    } catch (e) {
      report.errors.push({ account: acc, error: e.message });
      await logEvent(env, { kind: 'sync', subkind: 'error', ref: acc, detail: { error: e.message } });
    }
  }
  await restampAll(env);
  await setConfig(env, 'last_sync', { at: new Date().toISOString(), ...report });
  return report;
}

export async function accountInfo(env, acc) {
  const key = 'acct:' + acc;
  const c = await getConfig(env, key);
  if (c && Date.now() - c.t < 24 * 3600e3) return c;
  const j = await graph(env, '/' + acc, { fields: 'currency,timezone_name,name' });
  const info = { t: Date.now(), currency: j.currency || 'BRL', timezone: j.timezone_name || null, name: j.name || null };
  await setConfig(env, key, info);
  return info;
}

/* ---------- status e orçamento ao vivo (cache curto no config) ---------- */
export async function liveStatus(env, acc, { fresh = false } = {}) {
  const key = 'live:' + acc;
  if (!fresh) { const c = await getConfig(env, key); if (c && Date.now() - c.t < 90e3) return c.data; }
  const [camps, adsets, ads] = await Promise.all([
    graphAll(env, `/${acc}/campaigns`, { fields: 'id,status,effective_status,daily_budget,lifetime_budget', limit: 500 }),
    graphAll(env, `/${acc}/adsets`, { fields: 'id,status,effective_status,daily_budget,lifetime_budget', limit: 500 }),
    graphAll(env, `/${acc}/ads`, { fields: 'id,status,effective_status', limit: 500 }),
  ]);
  const info = await accountInfo(env, acc).catch(() => ({ currency: 'BRL' }));
  const data = { _currency: info.currency };
  for (const x of [...camps, ...adsets, ...ads]) data[x.id] = {
    status: x.status ?? null, effective: x.effective_status ?? null,
    budget_cents: x.daily_budget ? +x.daily_budget : null,
    budget_type: x.daily_budget ? 'daily' : x.lifetime_budget ? 'lifetime' : null,
    lifetime_cents: x.lifetime_budget ? +x.lifetime_budget : null,
  };
  await setConfig(env, key, { t: Date.now(), data });
  return data;
}

/* ---------- ações humanas: pausar / ativar / orçamento ---------- */
export async function updateEntity(env, { id, action, budget_cents, label }) {
  id = String(id || '');
  if (!/^\d{1,25}$/.test(id)) throw new Error('Id inválido');
  const owner = await env.DB.prepare(`SELECT account_id, offer_id,
      CASE WHEN ad_id = ?1 THEN 'ad' WHEN adset_id = ?1 THEN 'adset' ELSE 'campaign' END AS level,
      CASE WHEN ad_id = ?1 THEN ad_name WHEN adset_id = ?1 THEN adset_name ELSE campaign_name END AS name
    FROM spend WHERE ad_id = ?1 OR adset_id = ?1 OR campaign_id = ?1 ORDER BY day DESC LIMIT 1`).bind(id).first();
  if (!owner) throw new Error('Esse item não aparece em nenhuma conta sincronizada');
  const name = owner.name || label || id;
  let text;
  if (action === 'pause' || action === 'activate') {
    await graph(env, '/' + id, { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' }, 'POST');
    text = `${action === 'pause' ? 'Pausado' : 'Ativado'} ${name}`;
  } else if (action === 'budget') {
    const v = Number(budget_cents);
    if (!Number.isInteger(v) || v < 100) throw new Error('Orçamento inválido');
    if (owner.level === 'ad') throw new Error('Anúncio não tem orçamento — mude no conjunto ou na campanha');
    const cur = await graph(env, '/' + id, { fields: 'daily_budget,lifetime_budget' });
    if (!cur.daily_budget) throw new Error(cur.lifetime_budget ? 'Esse item usa orçamento total; o painel só altera orçamento diário' : 'Esse item não tem orçamento próprio (veja o nível acima)');
    await graph(env, '/' + id, { daily_budget: v }, 'POST');
    const info = await accountInfo(env, owner.account_id).catch(() => ({ currency: 'BRL' }));
    const f = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: info.currency });
    text = `Orçamento ${name}: ${f(+cur.daily_budget)} → ${f(v)}/dia`;
  } else throw new Error('Ação inválida');
  await logEvent(env, { offer_id: owner.offer_id, kind: 'change', subkind: action === 'budget' ? 'budget' : 'status', ref: id, detail: { text, by: 'painel' } });
  await env.DB.prepare('DELETE FROM config WHERE key = ?').bind('live:' + owner.account_id).run();
  return { ok: true, text };
}

/* ---------- corte automático (cron) ----------
   Anúncio ATIVO com gasto acumulado > X da oferta e zero venda paga (utm_content = nome do anúncio) é pausado.
   Travas: chave auto_cut ligada; oferta com X definido; oferta já recebeu ao menos 1 pedido por webhook;
   anúncio que já foi cortado antes não é cortado de novo (se alguém reativou, a decisão foi humana). */
export async function autoCut(env) {
  if ((await getConfig(env, 'auto_cut', false)) !== true) return { skipped: 'corte automático desligado' };
  const { results: offers } = await env.DB.prepare(`SELECT o.id, o.slug, o.ad_account_id, o.cut_spend_cents FROM offers o
    WHERE o.cut_spend_cents > 0 AND o.ad_account_id IS NOT NULL AND EXISTS (SELECT 1 FROM sales s WHERE s.offer_id = o.id)`).all();
  const done = [];
  for (const o of offers) {
    const { results: cands } = await env.DB.prepare(`SELECT sp.ad_id, MAX(sp.ad_name) AS ad_name, SUM(sp.spend_cents) AS spend
      FROM spend sp WHERE sp.offer_id = ? AND NOT EXISTS (SELECT 1 FROM cuts c WHERE c.ad_id = sp.ad_id)
      GROUP BY sp.ad_id HAVING SUM(sp.spend_cents) > ?`).bind(o.id, o.cut_spend_cents).all();
    if (!cands.length) continue;
    let live;
    try { live = await liveStatus(env, o.ad_account_id, { fresh: true }); } catch (e) { await logEvent(env, { offer_id: o.id, kind: 'sync', subkind: 'error', detail: { error: 'corte: ' + e.message } }); continue; }
    for (const c of cands) {
      if (live[c.ad_id]?.effective !== 'ACTIVE') continue;
      const paid = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE offer_id = ? AND status = 'paid' AND (utm_content = ? OR ad_id = ?)`).bind(o.id, c.ad_name, c.ad_id).first();
      if (paid.n > 0) continue;
      try {
        const resp = await graph(env, '/' + c.ad_id, { status: 'PAUSED' }, 'POST');
        await env.DB.prepare('INSERT INTO cuts (offer_id, ad_id, ad_name, spend_cents, threshold_cents, meta_response, ok) VALUES (?, ?, ?, ?, ?, ?, 1)')
          .bind(o.id, c.ad_id, c.ad_name, c.spend, o.cut_spend_cents, JSON.stringify(resp)).run();
        await logEvent(env, { offer_id: o.id, kind: 'change', subkind: 'cut', ref: c.ad_id, detail: { text: `Corte automático: ${c.ad_name} (${brl(c.spend)} sem venda)` } });
        done.push({ offer: o.slug, ad: c.ad_name, ok: 1 });
      } catch (e) {
        // falhou: não grava em cuts, tenta de novo no próximo cron
        await logEvent(env, { offer_id: o.id, kind: 'sync', subkind: 'error', ref: c.ad_id, detail: { error: 'corte falhou: ' + e.message } });
        done.push({ offer: o.slug, ad: c.ad_name, ok: 0 });
      }
    }
    await env.DB.prepare('DELETE FROM config WHERE key = ?').bind('live:' + o.ad_account_id).run();
  }
  return { cut: done };
}
