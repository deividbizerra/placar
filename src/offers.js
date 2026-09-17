import { randomToken, logEvent, getConfig, setConfig } from './util.js';

const EDITABLE = ['name', 'platform', 'pixel_id', 'ad_account_id', 'campaign_filter', 'page_url', 'page_url_b', 'ticket_target_cents', 'cpa_target_cents', 'cut_spend_cents', 'hidden', 'capi_token', 'capi_secret'];
const INT_FIELDS = new Set(['ticket_target_cents', 'cpa_target_cents', 'cut_spend_cents', 'hidden']);

export async function listOffers(env) {
  const { results } = await env.DB.prepare(`SELECT o.*, (SELECT COUNT(*) FROM sales s WHERE s.offer_id = o.id) AS sales_count FROM offers o ORDER BY o.hidden, o.name`).all();
  return results;
}
// Nunca devolve token CAPI; só se está definido
export const publicOffer = ({ capi_token, capi_secret, ...o }) => ({ ...o, capi_set: !!(capi_token || capi_secret) });

function validate(field, v) {
  if (v === null) return null;
  if (INT_FIELDS.has(field)) { if (v === '' ) return null; const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new Error(`Campo ${field} inválido`); return n; }
  if (typeof v !== 'string') throw new Error(`Campo ${field} inválido`);
  v = v.trim();
  if (field === 'ad_account_id' && v && !/^act_\d+$/.test(v)) throw new Error('Conta de anúncios no formato act_123…');
  if ((field === 'page_url' || field === 'page_url_b') && v && !/^https:\/\//.test(v)) throw new Error('URL da página precisa começar com https://');
  if (field === 'platform' && !/^[a-z0-9-]{2,30}$/.test(v)) throw new Error('Plataforma inválida');
  return v === '' ? null : v;
}

// Editar não apaga campo omitido: só as chaves presentes no corpo são gravadas.
// Tokens (capi_token) vazios são ignorados — só sobrescrevem quando vêm preenchidos.
export async function saveOffer(env, body) {
  const patch = {};
  for (const f of EDITABLE) {
    if (!(f in body) || body[f] === undefined) continue;
    if ((f === 'capi_token' || f === 'capi_secret') && !body[f]) continue;
    patch[f] = validate(f, body[f]);
  }
  if (body.id) {
    const cur = await env.DB.prepare('SELECT * FROM offers WHERE id = ?').bind(body.id).first();
    if (!cur) throw new Error('Oferta não encontrada');
    if ('name' in patch && !patch.name) throw new Error('Dê um nome à oferta');
    const keys = Object.keys(patch);
    if (keys.length) {
      await env.DB.prepare(`UPDATE offers SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(...keys.map(k => patch[k]), body.id).run();
    }
    return { ok: true, id: body.id, restamp: keys.some(k => k === 'ad_account_id' || k === 'campaign_filter') };
  }
  const slug = String(body.slug || '').trim();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error('Id: só letras minúsculas, números e hífen (2 a 40)');
  if (!patch.name) throw new Error('Dê um nome à oferta');
  if (await env.DB.prepare('SELECT 1 FROM offers WHERE slug = ?').bind(slug).first()) throw new Error('Já existe oferta com esse id');
  patch.platform ||= 'ggcheckout';
  const keys = Object.keys(patch);
  const r = await env.DB.prepare(`INSERT INTO offers (slug, webhook_token, ${keys.join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`).bind(slug, randomToken('whk_'), ...keys.map(k => patch[k])).run();
  return { ok: true, id: r.meta.last_row_id, restamp: !!patch.ad_account_id };
}

export async function deleteOffer(env, id) {
  const o = await env.DB.prepare('SELECT id FROM offers WHERE id = ?').bind(id).first();
  if (!o) throw new Error('Oferta não encontrada');
  if (await env.DB.prepare('SELECT 1 FROM sales WHERE offer_id = ? LIMIT 1').bind(id).first()) throw new Error('Oferta tem pedidos — só dá pra ocultar');
  await env.DB.batch([
    env.DB.prepare('UPDATE spend SET offer_id = NULL WHERE offer_id = ?').bind(id),
    env.DB.prepare('DELETE FROM cuts WHERE offer_id = ?').bind(id),
    env.DB.prepare('DELETE FROM events WHERE offer_id = ?').bind(id),
    env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(id),
  ]);
  return { ok: true };
}

/* ---------- campanha → oferta ----------
   1) mapa manual (config campaign_map) vale mais
   2) oferta da mesma conta cujo filtro (substrings |) aparece no nome
   3) oferta da mesma conta sem filtro recebe o resto
   Ofertas ocultas continuam recebendo carimbo (ocultar não muda atribuição). */
export function matchByFilter(offers, accountId, campaignName) {
  const inAcc = offers.filter(o => o.ad_account_id && o.ad_account_id === accountId);
  const name = String(campaignName || '').toUpperCase();
  const byFilter = inAcc.find(o => o.campaign_filter && o.campaign_filter.split('|').map(s => s.trim().toUpperCase()).filter(Boolean).some(s => name.includes(s)));
  return byFilter || inAcc.find(o => !o.campaign_filter) || null;
}
export const getCampaignMap = (env) => getConfig(env, 'campaign_map', {});

export async function restampAll(env) {
  const offers = (await env.DB.prepare('SELECT id, slug, ad_account_id, campaign_filter FROM offers').all()).results;
  const map = await getCampaignMap(env);
  const { results: camps } = await env.DB.prepare(`SELECT campaign_id, account_id, campaign_name, MAX(day) AS last_day FROM spend WHERE campaign_id IS NOT NULL GROUP BY campaign_id`).all();
  const stmts = camps.map(c => {
    const manual = map[c.campaign_id] ? offers.find(o => o.slug === map[c.campaign_id]) : null;
    const o = manual || matchByFilter(offers, c.account_id, c.campaign_name);
    return env.DB.prepare('UPDATE spend SET offer_id = ? WHERE campaign_id = ?').bind(o ? o.id : null, c.campaign_id);
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return camps.length;
}

export async function setCampaignMap(env, campaignId, slug) {
  if (!/^\d+$/.test(String(campaignId))) throw new Error('Campanha inválida');
  const map = await getCampaignMap(env);
  let offerId = null;
  if (slug) {
    const o = await env.DB.prepare('SELECT id FROM offers WHERE slug = ?').bind(slug).first();
    if (!o) throw new Error('Oferta não encontrada');
    map[campaignId] = slug; offerId = o.id;
  } else delete map[campaignId];
  await setConfig(env, 'campaign_map', map);
  const n = await restampAll(env);
  await logEvent(env, { offer_id: offerId, kind: 'change', subkind: 'map', ref: String(campaignId), detail: { text: slug ? `Campanha ${campaignId} mapeada manualmente para ${slug}` : `Campanha ${campaignId} voltou a usar o filtro` } });
  return { ok: true, campaigns: n };
}
