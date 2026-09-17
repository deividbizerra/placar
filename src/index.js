import PAINEL_HTML from '../painel/dist/painel.html';
import { json, err, safeEqual, getConfig, setConfig, logEvent } from './util.js';
import { listOffers, saveOffer, deleteOffer, setCampaignMap, restampAll } from './offers.js';
import { syncMeta, updateEntity, autoCut } from './meta.js';
import { painel } from './painel.js';
import { handleWebhook } from './webhook.js';
import { liveTool, liveSales, liveConfigScript } from './live.js';

const [HEAD, BODY] = PAINEL_HTML.split('<!--BODY-->');
const page = (env) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${HEAD}</head><body>${env.LIVE_ACCOUNTS ? BODY.replace('<script>', liveConfigScript(env) + '<script>') : BODY}</body></html>`;
const SEC_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' };

function authed(req, env, url) {
  if (!env.PAINEL_KEY || env.PAINEL_KEY.length < 16) return false; // sem chave forte configurada, nada abre
  return safeEqual(req.headers.get('x-placar-key') || url.searchParams.get('key') || '', env.PAINEL_KEY);
}
async function body(req) { try { return await req.json(); } catch { return {}; } }

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (p === '/health') return json({ ok: true });
      if (p === '/' || p === '/painel') {
        if (!authed(req, env, url)) return new Response('Chave inválida.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
        return new Response(page(env), { headers: SEC_HEADERS });
      }
      const wh = p.match(/^\/wh\/([a-z0-9-]{2,30})\/([a-z0-9-]{2,40})$/);
      if (wh) return req.method === 'POST' ? handleWebhook(req, env, wh[1], wh[2], url) : err('Use POST', 405);
      if (!p.startsWith('/api/')) return err('Não encontrado', 404);
      if (!authed(req, env, url)) return err('Chave inválida', 401);
      const M = req.method;

      if (p === '/api/live/tool' && M === 'POST') return liveTool(req, env, ctx);
      if (p === '/api/live/sales' && M === 'POST') return liveSales(req, env, ctx);
      if (p === '/api/painel' && M === 'GET') return json(await painel(env, Object.fromEntries(url.searchParams), url.origin));
      if (p === '/api/sync' && M === 'POST') { const b = await body(req); return json(await syncMeta(env, { days: Number(b.days) || 7 })); }
      if (p === '/api/meta/entity' && M === 'POST') return json(await updateEntity(env, await body(req)));
      if (p === '/api/cuts/dismiss' && M === 'POST') { const b = await body(req); await env.DB.prepare(`UPDATE cuts SET dismissed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(Number(b.id)).run(); return json({ ok: true }); }
      if (p === '/api/config/refs' && M === 'POST') {
        const b = await body(req), r = {};
        for (const k of ['click_checkout', 'checkout_paid', 'bump']) { const v = Number(b[k]); if (!(v >= 0 && v <= 1)) return err('Régua: use valores entre 0 e 100%'); r[k] = v; }
        await setConfig(env, 'funnel_refs', r); return json({ ok: true });
      }
      if (p === '/api/config' && M === 'POST') {
        const b = await body(req);
        if ('tax_rate' in b) { const v = Number(b.tax_rate); if (!(v >= 0 && v < 1)) return err('Imposto entre 0 e 99%'); await setConfig(env, 'tax_rate', v); }
        if ('fx_markup' in b) { const v = Number(b.fx_markup); if (!(v >= 0 && v < 1)) return err('Acréscimo no câmbio entre 0 e 99%'); await setConfig(env, 'fx_markup', v); }
        if ('auto_cut' in b) { await setConfig(env, 'auto_cut', b.auto_cut === true); await logEvent(env, { kind: 'change', subkind: 'config', detail: { text: 'Corte automático ' + (b.auto_cut === true ? 'ligado' : 'desligado') } }); }
        return json({ ok: true });
      }
      if (p === '/api/offers' && M === 'GET') return json((await listOffers(env)).map(({ capi_token, capi_secret, ...o }) => ({ ...o, capi_set: !!(capi_token || capi_secret) })));
      if (p === '/api/offers' && M === 'POST') { const r = await saveOffer(env, await body(req)); if (r.restamp) await restampAll(env); return json(r); }
      if (p === '/api/offers/delete' && M === 'POST') return json(await deleteOffer(env, Number((await body(req)).id)));
      if (p === '/api/campaign-map' && M === 'POST') { const b = await body(req); return json(await setCampaignMap(env, b.campaign_id, b.offer || null)); }
      return err('Não encontrado', 404);
    } catch (e) {
      const status = e.status || (e.name === 'MetaError' || e.constructor?.name === 'MetaError' ? 502 : 400);
      if (status >= 500 && !(e.constructor?.name === 'MetaError')) console.error(e);
      return err(e.message || 'Erro', status);
    }
  },

  async scheduled(event, env, ctx) {
    const sync = await syncMeta(env, { days: 2 }).catch(e => ({ error: e.message }));
    const cut = await autoCut(env).catch(e => ({ error: e.message }));
    console.log(JSON.stringify({ cron: event.cron, sync: { rows: sync.rows, errors: sync.errors || sync.error }, cut }));
  },
};
