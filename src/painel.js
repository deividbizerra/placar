import { getConfig, addDays, isDay, todaySP } from './util.js';
import { listOffers, publicOffer, matchByFilter, getCampaignMap } from './offers.js';
import { liveStatus } from './meta.js';

const DEFAULT_REFS = { click_checkout: 0.15, checkout_paid: 0.85, bump: 0.20 };
const DEFAULT_VERDICT = { scale_min_sales: 3, scale_min_roas: 1.3, kill_roas: 0.8, kill_spend_mult: 2 };
const qm = (arr) => arr.length ? arr.map(() => '?').join(',') : 'NULL';
// janela [from 00:00, to+1 00:00) em America/Sao_Paulo (UTC−3) como ISO UTC, pra usar índice
const utcStart = (d) => d + 'T03:00:00.000Z';
const mask = (e) => {
  if (!e || !e.includes('@')) return '–';
  const [u, d] = e.split('@'); const parts = d.split('.');
  return u.slice(0, 2) + '***@' + parts[0].slice(0, 2) + '***' + (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');
};

export async function painel(env, q, baseUrl) {
  const to = isDay(q.to) ? q.to : todaySP();
  let from = isDay(q.from) ? q.from : addDays(to, -6);
  if (from > to) from = to;
  if (addDays(from, 400) < to) from = addDays(to, -400);
  const dayList = []; for (let d = from; d <= to; d = addDays(d, 1)) dayList.push(d);
  const t0 = utcStart(from), t1 = utcStart(addDays(to, 1));

  const [tax, refs, verdict, autoCut, lastSync, fxMarkup, map, offersRaw] = await Promise.all([
    getConfig(env, 'tax_rate', 0), getConfig(env, 'funnel_refs', DEFAULT_REFS), getConfig(env, 'verdict', DEFAULT_VERDICT),
    getConfig(env, 'auto_cut', false), getConfig(env, 'last_sync', null), getConfig(env, 'fx_markup', 0), getCampaignMap(env), listOffers(env),
  ]);
  const scope = q.offer && q.offer !== 'all' ? q.offer : 'all';
  const scopeOffers = scope === 'all' ? offersRaw.filter(o => !o.hidden) : offersRaw.filter(o => o.slug === scope);
  if (scope !== 'all' && !scopeOffers.length) { const e = new Error('Oferta não encontrada'); e.status = 404; throw e; }
  const ids = scopeOffers.map(o => o.id);
  const metaIds = new Set(scopeOffers.filter(o => o.ad_account_id).map(o => o.id));
  const DB = env.DB;

  /* ---- base agrupada por oferta × dia ---- */
  const [spRows, paidRows, ordRows] = await Promise.all([
    DB.prepare(`SELECT offer_id, day, SUM(spend_cents) spend, SUM(impressions) impressions, SUM(link_clicks) link_clicks FROM spend
      WHERE day BETWEEN ? AND ? AND offer_id IN (${qm(ids)}) GROUP BY offer_id, day`).bind(from, to, ...ids).all(),
    DB.prepare(`SELECT offer_id, date(paid_at, '-3 hours') day, COUNT(*) paid, SUM(gross_cents) gross, SUM(fee_cents) fee,
      SUM(method = 'pix') paid_pix, SUM(bump_cents > 0) bumps, SUM(no_utm) no_utm FROM sales
      WHERE status = 'paid' AND paid_at >= ? AND paid_at < ? AND offer_id IN (${qm(ids)}) GROUP BY offer_id, day`).bind(t0, t1, ...ids).all(),
    DB.prepare(`SELECT offer_id, date(created_at, '-3 hours') day, SUM(status <> 'abandoned') orders, SUM(status = 'pending') pending,
      SUM(status = 'refunded') refunds, SUM(status = 'chargeback') chargebacks, SUM(status = 'abandoned') abandoned FROM sales
      WHERE created_at >= ? AND created_at < ? AND offer_id IN (${qm(ids)}) GROUP BY offer_id, day`).bind(t0, t1, ...ids).all(),
  ]);
  const cell = {};
  const C = (oid, day) => (cell[oid + '|' + day] ||= { spend: 0, impressions: 0, link_clicks: 0, gross: 0, fee: 0, paid: 0, paid_pix: 0, bumps: 0, no_utm: 0, orders: 0, pending: 0, refunds: 0, chargebacks: 0, abandoned: 0 });
  for (const r of spRows.results) Object.assign(C(r.offer_id, r.day), { spend: r.spend, impressions: r.impressions, link_clicks: r.link_clicks });
  for (const r of paidRows.results) Object.assign(C(r.offer_id, r.day), { gross: r.gross, fee: r.fee, paid: r.paid, paid_pix: r.paid_pix, bumps: r.bumps, no_utm: r.no_utm });
  for (const r of ordRows.results) Object.assign(C(r.offer_id, r.day), { orders: r.orders, pending: r.pending, refunds: r.refunds, chargebacks: r.chargebacks, abandoned: r.abandoned });

  function build(offerIds) {
    const metaOn = offerIds.some(id => metaIds.has(id));
    const T = { spend: metaOn ? 0 : null, impressions: metaOn ? 0 : null, link_clicks: metaOn ? 0 : null, gross: 0, fee: 0, gross_m: 0, fee_m: 0, paid: 0, paid_pix: 0, bumps: 0, refunds: 0, chargebacks: 0, orders: 0, pending: 0, abandoned: 0, no_utm: 0 };
    const days = dayList.map(day => {
      const D = { day, spend: metaOn ? 0 : null, gross: 0, fee: 0, gross_m: 0, fee_m: 0, paid: 0, orders: 0 };
      for (const id of offerIds) {
        const c = cell[id + '|' + day]; if (!c) continue;
        const m = metaIds.has(id);
        if (m) { D.spend += c.spend; T.spend += c.spend; T.impressions += c.impressions; T.link_clicks += c.link_clicks; D.gross_m += c.gross; D.fee_m += c.fee; T.gross_m += c.gross; T.fee_m += c.fee; }
        D.gross += c.gross; D.fee += c.fee; D.paid += c.paid; D.orders += c.orders;
        for (const k of ['gross', 'fee', 'paid', 'paid_pix', 'bumps', 'refunds', 'chargebacks', 'orders', 'pending', 'abandoned', 'no_utm']) T[k] += c[k];
      }
      return D;
    });
    return { totals: T, days };
  }
  const main = build(ids);

  /* ---- comuns ---- */
  const [marks, cuts, camps, sales] = await Promise.all([
    DB.prepare(`SELECT date(created_at, '-3 hours') day, subkind, detail_json FROM events WHERE kind = 'change' AND subkind IN ('cut','budget','status')
      AND created_at >= ? AND created_at < ? AND offer_id IN (${qm(ids)}) ORDER BY created_at`).bind(t0, t1, ...ids).all(),
    DB.prepare(`SELECT c.id, o.slug offer, c.ad_name, c.spend_cents spend, c.threshold_cents threshold, c.created_at at FROM cuts c JOIN offers o ON o.id = c.offer_id
      WHERE c.ok = 1 AND c.dismissed_at IS NULL AND c.offer_id IN (${qm(ids)}) ORDER BY c.created_at DESC LIMIT 20`).bind(...ids).all(),
    DB.prepare(`SELECT campaign_id, campaign_name, account_id, MAX(day) last_day FROM spend WHERE campaign_id IS NOT NULL GROUP BY campaign_id ORDER BY last_day DESC, campaign_name`).all(),
    DB.prepare(`SELECT s.created_at, s.paid_at, o.slug offer, s.status, s.product, s.gross_cents, s.fee_cents, s.method, COALESCE(s.gateway, s.platform) gateway, s.utm_campaign, s.utm_content, s.customer_email
      FROM sales s JOIN offers o ON o.id = s.offer_id WHERE s.status <> 'abandoned' AND s.offer_id IN (${qm(ids)}) AND s.created_at >= ? AND s.created_at < ?
      ORDER BY COALESCE(s.paid_at, s.created_at) DESC LIMIT 30`).bind(...ids, t0, t1).all(),
  ]);

  const res = {
    demo: false, generated_at: new Date().toISOString(), base_url: baseUrl,
    tax_rate: Number(tax) || 0, refs: { ...DEFAULT_REFS, ...refs }, verdict: { ...DEFAULT_VERDICT, ...verdict }, auto_cut: autoCut === true, last_sync: lastSync, fx_markup: Number(fxMarkup) || 0,
    offers: offersRaw.map(publicOffer), scope, range: { from, to },
    totals: main.totals, days: main.days,
    marks: marks.results.map(m => ({ day: m.day, kind: m.subkind, text: (() => { try { return JSON.parse(m.detail_json).text; } catch { return m.subkind; } })() })),
    cuts: cuts.results,
    campaigns: camps.results.map(c => ({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, account_id: c.account_id, filter_offer: matchByFilter(offersRaw, c.account_id, c.campaign_name)?.slug ?? null, manual_offer: map[c.campaign_id] ?? null })),
    sales: sales.results.map(s => ({ at: s.paid_at || s.created_at, offer: s.offer, status: s.status, product: s.product, gross: s.gross_cents, fee: s.fee_cents, method: s.method, gateway: s.gateway, campaign: s.utm_campaign, ad: s.utm_content, email: mask(s.customer_email) })),
  };

  if (scope === 'all') {
    res.per_offer = scopeOffers.map(o => ({ slug: o.slug, ...build([o.id]) }));
    return res;
  }

  /* ---- detalhe da oferta ---- */
  const o = scopeOffers[0], id = o.id, T = main.totals;
  const [leadRow, pv, gw, est, org, adSpend, adNames, adPaid, adOrders] = await Promise.all([
    DB.prepare(`SELECT COUNT(*) n, EXISTS (SELECT 1 FROM events WHERE offer_id = ?1 AND kind = 'lead') ever FROM events WHERE offer_id = ?1 AND kind = 'lead' AND created_at >= ?2 AND created_at < ?3`).bind(id, t0, t1).first(),
    DB.prepare(`SELECT COUNT(DISTINCT CASE WHEN type = 'view' THEN session_id END) visits, COUNT(DISTINCT CASE WHEN type = 'click' THEN session_id END) clicked,
      EXISTS (SELECT 1 FROM pulse WHERE offer_id = ?1) ever FROM pulse WHERE offer_id = ?1 AND created_at >= ?2 AND created_at < ?3`).bind(id, t0, t1).first(),
    DB.prepare(`SELECT COALESCE(gateway, platform) gateway, SUM(status <> 'abandoned') orders, SUM(status = 'paid') paid,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN gross_cents END), 0) gross, COALESCE(SUM(CASE WHEN status = 'paid' THEN fee_cents END), 0) fee, SUM(status = 'paid' AND method = 'pix') paid_pix
      FROM sales WHERE offer_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1 HAVING orders > 0 ORDER BY orders DESC`).bind(id, t0, t1).all(),
    DB.prepare(`WITH b AS (SELECT DISTINCT customer_email e FROM sales WHERE offer_id = ?1 AND status = 'paid' AND paid_at >= ?2 AND paid_at < ?3 AND customer_email IS NOT NULL),
      h AS (SELECT customer_email e, COUNT(*) n, SUM(gross_cents - fee_cents) net FROM sales WHERE status = 'paid' AND customer_email IN (SELECT e FROM b) GROUP BY customer_email)
      SELECT (SELECT COUNT(*) FROM b) buyers, (SELECT COUNT(*) FROM h WHERE n >= 2) repeat_buyers, (SELECT SUM(net) FROM h) ltv_total`).bind(id, t0, t1).first(),
    DB.prepare(`SELECT CASE WHEN s.sck LIKE 'ty\\_%' ESCAPE '\\' THEN 'thankyou'
        WHEN c.session_id IS NOT NULL AND c.utm_medium = 'paid' THEN 'ad'
        WHEN s.sck IS NULL AND s.utm_medium = 'paid' AND s.utm_content IS NOT NULL THEN 'ad' ELSE 'other' END origin,
      COUNT(*) n, SUM(s.gross_cents - s.fee_cents) net
      FROM sales s LEFT JOIN clicks c ON c.session_id = s.sck WHERE s.offer_id = ? AND s.status = 'paid' AND s.paid_at >= ? AND s.paid_at < ? GROUP BY 1`).bind(id, t0, t1).all(),
    DB.prepare(`SELECT ad_id, SUM(spend_cents) spend, SUM(impressions) impressions, SUM(link_clicks) link_clicks FROM spend WHERE offer_id = ? AND day BETWEEN ? AND ? GROUP BY ad_id`).bind(id, from, to).all(),
    DB.prepare(`SELECT ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, MAX(day) last_day FROM spend WHERE offer_id = ? GROUP BY ad_id`).bind(id).all(),
    DB.prepare(`SELECT ad_id, utm_content name, COUNT(*) paid, SUM(gross_cents) gross, SUM(fee_cents) fee FROM sales WHERE offer_id = ? AND status = 'paid' AND (utm_content IS NOT NULL OR ad_id IS NOT NULL) AND paid_at >= ? AND paid_at < ? GROUP BY ad_id, utm_content`).bind(id, t0, t1).all(),
    DB.prepare(`SELECT ad_id, utm_content name, COUNT(*) orders FROM sales WHERE offer_id = ? AND status <> 'abandoned' AND (utm_content IS NOT NULL OR ad_id IS NOT NULL) AND created_at >= ? AND created_at < ? GROUP BY ad_id, utm_content`).bind(id, t0, t1).all(),
  ]);
  const hasPulse = pv.ever > 0;
  res.funnel = { clicks: T.link_clicks, visits: hasPulse ? pv.visits : null, button: hasPulse ? pv.clicked : null, leads: leadRow.ever ? leadRow.n : null, checkout: T.orders, paid: T.paid };
  res.gateways = gw.results.map(g => ({ ...g, initiated: null }));
  const O = { ad: { n: 0, net: 0 }, thankyou: { n: 0, net: 0 }, other: { n: 0, net: 0 } };
  for (const r of org.results) O[r.origin] = { n: r.n, net: r.net };
  res.esteira = { buyers: est.buyers, repeat_buyers: est.repeat_buyers, ltv_net_cents: est.buyers ? Math.round(est.ltv_total / est.buyers) : null, paid: T.paid, bumps: T.bumps, origin: O };

  /* página (beacon) */
  res.page = null;
  if (hasPulse && pv.visits > 0) {
    const w = [id, t0, t1];
    const [exitN, sec, ex, btn, modal, vars] = await Promise.all([
      DB.prepare(`SELECT COUNT(*) n FROM pulse WHERE offer_id = ? AND type = 'exit' AND created_at >= ? AND created_at < ?`).bind(...w).first(),
      DB.prepare(`SELECT section, COUNT(DISTINCT session_id) reached FROM pulse WHERE offer_id = ? AND type IN ('section','exit') AND section IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY section ORDER BY reached DESC`).bind(...w).all(),
      DB.prepare(`SELECT section, COUNT(*) exited FROM pulse WHERE offer_id = ? AND type = 'exit' AND created_at >= ? AND created_at < ? GROUP BY section`).bind(...w).all(),
      DB.prepare(`SELECT button, COALESCE(section, '?') section, COUNT(*) clicks FROM pulse WHERE offer_id = ? AND type = 'click' AND created_at >= ? AND created_at < ? GROUP BY button, section ORDER BY clicks DESC LIMIT 20`).bind(...w).all(),
      DB.prepare(`SELECT SUM(type = 'modal_shown') shown, SUM(type = 'modal_accept') accepted, SUM(type = 'modal_decline') declined FROM pulse WHERE offer_id = ? AND created_at >= ? AND created_at < ?`).bind(...w).first(),
      DB.prepare(`SELECT COALESCE(p.variant, 'a') variant, COUNT(DISTINCT CASE WHEN p.type = 'view' THEN p.session_id END) sessions, COUNT(DISTINCT CASE WHEN p.type = 'click' THEN p.session_id END) clicked,
        (SELECT COUNT(*) FROM sales s JOIN clicks c ON c.session_id = s.sck WHERE s.offer_id = ?1 AND s.status = 'paid' AND s.paid_at >= ?2 AND s.paid_at < ?3 AND c.variant = COALESCE(p.variant, 'a')) paid
        FROM pulse p WHERE p.offer_id = ?1 AND p.created_at >= ?2 AND p.created_at < ?3 GROUP BY 1`).bind(...w).all(),
    ]);
    const median = async (col) => {
      if (!exitN.n) return null;
      const r = await DB.prepare(`SELECT ${col} v FROM pulse WHERE offer_id = ? AND type = 'exit' AND ${col} IS NOT NULL AND created_at >= ? AND created_at < ? ORDER BY ${col} LIMIT 1 OFFSET ?`).bind(id, t0, t1, Math.floor(exitN.n / 2)).first();
      return r ? r.v : null;
    };
    const [medT, medS] = await Promise.all([median('time_ms'), median('scroll_pct')]);
    const exitedBy = Object.fromEntries(ex.results.map(r => [r.section, r.exited]));
    res.page = {
      sessions: pv.visits, clicked: pv.clicked, orders: T.orders, paid: T.paid,
      median_time_s: medT == null ? null : Math.round(medT / 1000), median_scroll_pct: medS,
      modal: { shown: modal.shown || 0, accepted: modal.accepted || 0, declined: modal.declined || 0 },
      sections: sec.results.map(s => ({ section: s.section, reached: s.reached, exited: exitedBy[s.section] || 0 })),
      buttons: btn.results, variants: vars.results.length > 1 ? vars.results : [],
    };
  }

  /* por anúncio: gasto por ad_id + vendas por utm_content (= nome do anúncio) */
  const meta = Object.fromEntries(adNames.results.map(a => [a.ad_id, a]));
  const rows = {};
  const row = (a) => (rows[a.ad_id] ||= { ad_id: a.ad_id, ad_name: a.ad_name, adset_id: a.adset_id, adset_name: a.adset_name, campaign_id: a.campaign_id, campaign_name: a.campaign_name, spend: 0, impressions: 0, link_clicks: 0, orders: 0, paid: 0, gross: 0, fee: 0 });
  for (const s of adSpend.results) Object.assign(row(meta[s.ad_id]), { spend: s.spend, impressions: s.impressions, link_clicks: s.link_clicks });
  // nome → ad_id: prefere o que gastou no período; senão o mais recente
  const byName = {};
  for (const a of adNames.results.sort((x, y) => x.last_day < y.last_day ? 1 : -1)) {
    const cur = byName[a.ad_name];
    if (!cur || (!rows[cur.ad_id]?.spend && rows[a.ad_id]?.spend)) byName[a.ad_name] = a;
  }
  const target = (name, adId) => (adId && meta[adId]) || byName[name] || { ad_id: 'utm:' + (name || adId), ad_name: name || ('anúncio ' + adId), adset_id: 'utm-sem-anuncio', adset_name: '(nome não bate com anúncio sincronizado)', campaign_id: 'utm-sem-anuncio', campaign_name: '(nome não bate com anúncio sincronizado)' };
  for (const s of adPaid.results) { const x = row(target(s.name, s.ad_id)); x.paid += s.paid; x.gross += s.gross; x.fee += s.fee; }
  for (const s of adOrders.results) row(target(s.name, s.ad_id)).orders += s.orders;
  res.ads = Object.values(rows);

  res.live = {};
  if (o.ad_account_id && env.META_TOKEN) {
    try { res.live = await liveStatus(env, o.ad_account_id); } catch (e) { res.live_error = e.message; }
  }
  return res;
}
