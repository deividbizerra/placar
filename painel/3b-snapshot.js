/* ================= SNAPSHOT: dados REAIS da Meta embutidos (window.PLACAR_SNAPSHOT), só leitura ================= */
const Snapshot = (() => {
  const S = typeof window !== 'undefined' ? window.PLACAR_SNAPSHOT : null;
  if (!S) return null;
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const offers = S.accounts.map((a, i) => ({ id: i + 1, slug: 'conta-' + a.id, name: a.name, platform: '–', pixel_id: '', ad_account_id: 'act_' + a.id, campaign_filter: '', page_url: '', page_url_b: '', ticket_target_cents: null, cpa_target_cents: null, cut_spend_cents: null, hidden: 0, webhook_token: '', capi_set: false, sales_count: null }));
  const rowsOf = (a) => a.rows.map(([day, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, impressions, link_clicks, lpv]) => ({ day, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, impressions, link_clicks, lpv }));
  const data = S.accounts.map((a, i) => ({ offer: offers[i], rows: rowsOf(a), live: a.live }));
  const NULLS = { gross: null, fee: null, gross_m: null, fee_m: null, paid: null, paid_pix: null, bumps: null, refunds: null, chargebacks: null, orders: null, pending: null, abandoned: null, no_utm: null };
  function totals(rows) { const t = { spend: 0, impressions: 0, link_clicks: 0, ...NULLS }; for (const r of rows) { t.spend += r.spend; t.impressions += r.impressions; t.link_clicks += r.link_clicks; } return t; }
  function days(rows, from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) { const t = totals(rows.filter(r => r.day === d)); out.push({ day: d, spend: t.spend, gross: null, fee: null, gross_m: null, fee_m: null, paid: null, orders: null }); } return out; }
  return {
    range: { since: S.since, until: S.until },
    painel(q) {
      const scope = q.offer || 'all', from = q.from, to = q.to;
      const inR = (r) => r.day >= from && r.day <= to;
      const sel = scope === 'all' ? data : data.filter(x => x.offer.slug === scope);
      const rows = sel.flatMap(x => x.rows.filter(inR));
      const res = {
        demo: false, snapshot: { at: S.at, since: S.since, until: S.until, source: S.source }, readonly: true, sales_source: false,
        currency: S.accounts[0].currency, generated_at: S.at, base_url: '', tax_rate: 0, auto_cut: false, last_sync: null,
        refs: { click_checkout: .15, checkout_paid: .85, bump: .20 }, verdict: { scale_min_sales: 3, scale_min_roas: 1.3, kill_roas: .8, kill_spend_mult: 2 },
        offers, scope, range: { from, to }, totals: totals(rows), days: days(rows, from, to), marks: [], cuts: [], sales: [],
        campaigns: data.flatMap(x => [...new Map(x.rows.map(r => [r.campaign_id, r])).values()].map(r => ({ campaign_id: r.campaign_id, campaign_name: r.campaign_name, account_id: x.offer.ad_account_id, filter_offer: x.offer.slug, manual_offer: null }))),
      };
      if (scope === 'all') { res.per_offer = data.map(x => { const r = x.rows.filter(inR); return { slug: x.offer.slug, totals: totals(r), days: days(r, from, to) }; }); return res; }
      const x = sel[0];
      res.funnel = { clicks: res.totals.link_clicks, visits: null, button: null, checkout: null, paid: null, lpv: rows.reduce((s, r) => s + (r.lpv || 0), 0) };
      res.gateways = []; res.esteira = null; res.page = null;
      const g = {};
      for (const r of rows) { const a = (g[r.ad_id] ||= { ad_id: r.ad_id, ad_name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, spend: 0, impressions: 0, link_clicks: 0, orders: null, paid: null, gross: null, fee: null }); a.spend += r.spend; a.impressions += r.impressions; a.link_clicks += r.link_clicks; }
      res.ads = Object.values(g); res.live = x.live;
      return res;
    },
  };
})();
