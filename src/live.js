import { json, err } from './util.js';
import { graph, graphAll } from './meta.js';

/* Modo servidor do painel ao vivo: o mesmo front do Placar Meta, com o Worker fazendo o papel dos conectores.
   /api/live/tool  → emula ads_get_ad_entities, ads_update_entity, ads_activate_entity, ads_get_ad_accounts (Graph API com META_TOKEN)
   /api/live/sales → lê o fluxo "PLACAR - DADOS DO PAINEL" do n8n (N8N_DADOS_URL) */

const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const major = (v) => v == null || v === '' ? undefined : (Number(v) / 100).toFixed(2);
const actOf = (id) => 'act_' + String(id || '').replace(/^act_/, '');
const isId = (s) => /^\d{1,25}$/.test(String(s));
// token por conta (contas em BMs diferentes): secret META_TOKEN_<id da conta>; senão usa META_TOKEN
const envFor = (env, acc) => { const t = acc && env['META_TOKEN_' + String(acc).replace(/^act_/, '')]; return t ? Object.assign(Object.create(env), { META_TOKEN: t }) : env; };

async function cached(ctx, key, ttl, fn) {
  const cache = caches.default;
  const req = new Request('https://placar.cache/' + encodeURIComponent(key));
  const hit = await cache.match(req);
  if (hit) return hit.json();
  const data = await fn();
  const res = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` } });
  ctx.waitUntil(cache.put(req, res));
  return data;
}

async function adEntities(env0, ctx, input) {
  const acc = actOf(input.ad_account_id);
  const env = envFor(env0, acc);
  const ids = Array.isArray(input.object_ids) ? input.object_ids.map(String).filter(isId) : null;
  const tr = input.time_range ? JSON.parse(input.time_range) : null;
  if (tr && !(/^\d{4}-\d{2}-\d{2}$/.test(tr.since) && /^\d{4}-\d{2}-\d{2}$/.test(tr.until))) throw new Error('Período inválido');

  // gasto por anúncio por dia
  if (input.level === 'ad' && tr && !ids) {
    const ttl = tr.until >= new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10) ? 240 : 3600;
    const rows = await cached(ctx, `ins|${acc}|${tr.since}|${tr.until}`, ttl, async () => {
      const out = [];
      for (let s = tr.since; s <= tr.until; s = addDays(s, 7)) {
        const e = addDays(s, 6) < tr.until ? addDays(s, 6) : tr.until;
        const part = await graphAll(env, `/${acc}/insights`, { level: 'ad', time_increment: 1, time_range: { since: s, until: e }, limit: 500,
          fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,date_start' });
        for (const r of part) out.push({ date_start: r.date_start, id: r.ad_id, name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, amount_spent: r.spend, impressions: r.impressions, link_click: r.inline_link_clicks });
      }
      return out;
    });
    return { ad_entities: rows, pagination: {} };
  }
  // frequência e alcance por campanha no período
  if (input.level === 'campaign' && tr && ids) {
    if (!ids.length) return { ad_entities: [] };
    const rows = await cached(ctx, `freq|${acc}|${tr.since}|${tr.until}|${ids.slice().sort().join(',')}`, 600, async () => {
      const part = await graphAll(env, `/${acc}/insights`, { level: 'campaign', time_range: tr, limit: 500, fields: 'campaign_id,frequency,reach', filtering: [{ field: 'campaign.id', operator: 'IN', value: ids }] });
      return part.map(r => ({ id: r.campaign_id, frequency: r.frequency, reach: r.reach }));
    });
    return { ad_entities: rows };
  }
  // status e orçamento ao vivo (sem cache)
  if (ids && ['campaign', 'adset', 'ad'].includes(input.level)) {
    const fields = input.level === 'ad' ? 'name,status,effective_status' : 'name,status,effective_status,daily_budget,lifetime_budget';
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const j = await graph(env, '/', { ids: ids.slice(i, i + 50).join(','), fields });
      for (const [id, e] of Object.entries(j)) if (e && typeof e === 'object') out.push({ id, name: e.name, status: e.status, effective_status: e.effective_status, daily_budget: major(e.daily_budget), lifetime_budget: major(e.lifetime_budget) });
    }
    return { ad_entities: out };
  }
  // anúncios ativos da conta (inclusive os que ainda não gastaram)
  if (input.level === 'ad' && !ids && Array.isArray(input.filtering) && input.filtering.some(f => /effective_status$/.test(f?.field || ''))) {
    const rows = await cached(ctx, `active|${acc}`, 120, async () => {
      const part = await graphAll(env, `/${acc}/ads`, { effective_status: ['ACTIVE'], limit: 500, fields: 'name,status,effective_status,adset_id,campaign_id,adset{name},campaign{name}' });
      return part.map(a => ({ id: a.id, name: a.name, status: a.status, effective_status: a.effective_status, adset_id: a.adset_id, adset_name: a.adset?.name, campaign_id: a.campaign_id, campaign_name: a.campaign?.name }));
    });
    return { ad_entities: rows };
  }
  throw new Error('Consulta não suportada');
}

export async function liveTool(req, env, ctx) {
  let b; try { b = await req.json(); } catch { return err('Corpo precisa ser JSON'); }
  const { tool, input = {} } = b || {};
  try {
    if (tool === 'ads_get_ad_entities') return json(await adEntities(env, ctx, input));
    if (tool === 'ads_update_entity' || tool === 'ads_activate_entity') {
      if (!isId(input.entity_id)) return err('Id inválido');
      const fields = tool === 'ads_activate_entity' ? { status: 'ACTIVE' } : JSON.parse(input.fields || '{}');
      const allowed = {};
      if (fields.status && ['ACTIVE', 'PAUSED'].includes(fields.status)) allowed.status = fields.status;
      for (const k of ['daily_budget', 'lifetime_budget']) if (fields[k] != null) { const v = Number(fields[k]); if (!Number.isInteger(v) || v < 100) return err('Orçamento inválido'); allowed[k] = v; }
      if (!Object.keys(allowed).length) return err('Nada pra alterar');
      await graph(envFor(env, input.ad_account_id), '/' + input.entity_id, allowed, 'POST');
      await env.DB.prepare('INSERT INTO events (kind, subkind, ref, detail_json) VALUES (?, ?, ?, ?)').bind('change', allowed.status ? 'status' : 'budget', String(input.entity_id), JSON.stringify({ fields: allowed, via: 'painel' })).run();
      return json({ success: true });
    }
    if (tool === 'ads_get_ad_accounts') {
      const rows = await graphAll(env, '/me/adaccounts', { fields: 'account_id,name,currency,account_status', limit: 200 });
      return json({ ad_accounts: rows.map(a => ({ ad_account_id: a.account_id, ad_account_name: a.name, currency: a.currency, account_status: a.account_status === 1 ? 'ACTIVE' : 'DISABLED', is_ads_mcp_enabled: true, is_queryable: a.account_status === 1 })) });
    }
    return err('Ferramenta não permitida', 403);
  } catch (e) {
    return err(e.message || 'Erro na Meta', 502);
  }
}

export async function liveSales(req, env, ctx) {
  if (!env.N8N_DADOS_URL) return err('N8N_DADOS_URL não configurado no Worker', 500);
  let b; try { b = await req.json(); } catch { b = {}; }
  const since = typeof b.since === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b.since) ? b.since : new Date(Date.now() - 31 * 864e5).toISOString();
  try {
    const data = await cached(ctx, 'sales|' + since.slice(0, 13), 20, async () => {
      const r = await fetch(env.N8N_DADOS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ since }) });
      if (!r.ok) throw new Error(`n8n respondeu ${r.status}`);
      const j = await r.json();
      if (!j?.ok) throw new Error('n8n respondeu sem os dados de vendas (o fluxo PLACAR - DADOS DO PAINEL está publicado?)');
      return j;
    });
    return json(data);
  } catch (e) { return err(e.message, 502); }
}

export function liveConfigScript(env) {
  let accounts = [];
  try { accounts = JSON.parse(env.LIVE_ACCOUNTS || '[]'); } catch {}
  return `<script>window.PLACAR_LIVE=${JSON.stringify({ transport: 'worker', accounts }).replace(/</g, '\\u003c')};</script>`;
}
