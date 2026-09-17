/* ================= DEMO: gerador fictício que devolve o MESMO contrato de /api/painel ================= */
const Demo = (() => {
  const TZ = 'America/Sao_Paulo';
  const dayOf = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const TODAY = dayOf(new Date());
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const R = rng(20260916);
  const poisson = (l) => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
  const pick = (a) => a[Math.floor(R() * a.length)];

  const offers = [
    { id: 1, slug: 'guia-oracoes', name: 'Guia de Orações', platform: 'ggcheckout', pixel_id: '100000000000001', ad_account_id: 'act_1000000001', campaign_filter: 'ORACOES|GUIA', page_url: 'https://exemplo.com.br/guia', page_url_b: 'https://exemplo.com.br/guia-b', ticket_target_cents: 2200, cpa_target_cents: 1500, cut_spend_cents: 3000, hidden: 0, webhook_token: 'whk_7Qm2rX9aLp4Vt1Ne', capi_set: true, price: 1990, bump: 990, bumpRate: .24 },
    { id: 2, slug: 'tiragem-premium', name: 'Tiragem Premium', platform: 'ggcheckout', pixel_id: '100000000000001', ad_account_id: 'act_1000000001', campaign_filter: '', page_url: 'https://exemplo.com.br/tiragem', page_url_b: '', ticket_target_cents: 5200, cpa_target_cents: 3800, cut_spend_cents: 6000, hidden: 0, webhook_token: 'whk_c3Hd8Kw1Zs6Bq0Ry', capi_set: false, price: 4700, bump: 1700, bumpRate: .18 },
    { id: 3, slug: 'mapa-amor', name: 'Mapa do Amor', platform: 'kiwify', pixel_id: '', ad_account_id: '', campaign_filter: '', page_url: 'https://exemplo.com.br/mapa', page_url_b: '', ticket_target_cents: null, cpa_target_cents: null, cut_spend_cents: null, hidden: 0, webhook_token: 'whk_p5Tn2Gv8Jx3Mc9Lw', capi_set: false, price: 2790, bump: 0, bumpRate: 0 },
  ];
  const manualMap = { '120210000000009': 'guia-oracoes' };

  // campanha → conjunto → anúncio. from/to = dias atrás (inclusive). q = qualidade relativa.
  const tree = [
    { id: '120210000000001', name: '[ORACOES] CBO Frio BR', acc: 'act_1000000001', budget: 15000, adsets: [
      { id: '120211000000011', name: 'Aberto 25-55 F', ads: [
        { id: '120212000000100', name: 'AD00 Carrossel antigo', base: 2600, q: .9, from: 59, to: 25, trickle: true },
        { id: '120212000000101', name: 'AD01 Depoimento Dona Célia', base: 5200, q: 1.3, from: 59, to: 0 },
        { id: '120212000000102', name: 'AD02 Oração dos 7 dias', base: 4300, q: 1.0, from: 45, to: 0 },
      ] },
      { id: '120211000000012', name: 'Interesse espiritualidade', ads: [
        { id: '120212000000103', name: 'AD03 Carrossel salmos', base: 2800, q: .62, from: 40, to: 0 },
        { id: '120212000000105', name: 'AD05 Carta aberta', base: 1100, q: 0, from: 5, to: 3, cutAt: 3 },
      ] },
    ] },
    { id: '120210000000002', name: '[GUIA] ABO Teste criativos', acc: 'act_1000000001', adsets: [
      { id: '120211000000021', name: 'Teste A — aberto', budget: 3000, ads: [
        { id: '120212000000106', name: 'AD06 Reels mãos no terço', base: 1700, q: 1.45, from: 10, to: 0 },
        { id: '120212000000107', name: 'AD07 Estático versículo', base: 1300, q: .45, from: 10, to: 0 },
      ] },
      { id: '120211000000022', name: 'Teste B — semelhante compradores', budget: 2500, ads: [
        { id: '120212000000108', name: 'AD08 Vídeo narrado', base: 2300, q: 1.08, from: 21, to: 0 },
      ] },
    ] },
    { id: '120210000000009', name: 'Advantage+ 09/08', acc: 'act_1000000001', budget: 4000, adsets: [
      { id: '120211000000091', name: 'Advantage+ público', ads: [
        { id: '120212000000191', name: 'AD09 UGC oração da manhã', base: 3500, q: .95, from: 38, to: 0 },
      ] },
    ] },
    { id: '120210000000003', name: '[TIRAGEM] Conversão premium', acc: 'act_1000000001', budget: 20000, adsets: [
      { id: '120211000000031', name: 'Remarketing compradores do guia', ads: [
        { id: '120212000000301', name: 'T01 Tiragem ao vivo', base: 6400, q: 1.12, from: 59, to: 0, rmk: true },
        { id: '120212000000302', name: 'T02 Print de conversa', base: 4100, q: .95, from: 50, to: 0, rmk: true },
      ] },
      { id: '120211000000032', name: 'Aberto 30+', ads: [
        { id: '120212000000303', name: 'T03 Oferta relâmpago', base: 5200, q: .66, from: 30, to: 0 },
        { id: '120212000000304', name: 'T04 Imagem baralho', base: 2300, q: 0, from: 14, to: 12, cutAt: 12 },
      ] },
    ] },
  ];

  function offerForCampaign(c) {
    if (manualMap[c.id]) return offers.find(o => o.slug === manualMap[c.id]);
    const inAcc = offers.filter(o => o.ad_account_id && o.ad_account_id === c.acc);
    const byFilter = inAcc.find(o => o.campaign_filter && o.campaign_filter.split('|').map(s => s.trim()).filter(Boolean).some(s => c.name.toUpperCase().includes(s.toUpperCase())));
    return byFilter || inAcc.find(o => !o.campaign_filter) || null;
  }
  function filterOffer(c) { // sem o mapa manual, pra mostrar na tabela
    const inAcc = offers.filter(o => o.ad_account_id && o.ad_account_id === c.acc);
    const byFilter = inAcc.find(o => o.campaign_filter && o.campaign_filter.split('|').some(s => s.trim() && c.name.toUpperCase().includes(s.trim().toUpperCase())));
    return byFilter || inAcc.find(o => !o.campaign_filter) || null;
  }

  const live = {};
  const ads = [];
  for (const c of tree) {
    live[c.id] = { status: 'ACTIVE', effective: 'ACTIVE', budget_cents: c.budget ?? null, budget_type: c.budget ? 'daily' : null };
    for (const s of c.adsets) {
      live[s.id] = { status: 'ACTIVE', effective: 'ACTIVE', budget_cents: s.budget ?? null, budget_type: s.budget ? 'daily' : null };
      for (const a of s.ads) { ads.push({ ...a, adset: s, campaign: c }); live[a.id] = { status: a.to > 0 ? 'PAUSED' : 'ACTIVE', effective: a.to > 0 ? 'PAUSED' : 'ACTIVE', budget_cents: null, budget_type: null }; }
    }
  }

  const spend = []; const sales = []; const pageDays = {}; const buyers = [];
  let orderSeq = 48210;
  const firstNames = ['ana', 'maria', 'luci', 'rosa', 'celia', 'joana', 'marta', 'vera', 'sonia', 'tereza', 'fatima', 'lu', 'regina', 'neide', 'claudia', 'patricia', 'aline', 'jose', 'paulo', 'rita'];
  const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.br', 'icloud.com'];
  function buyer(rmk) {
    if (buyers.length && R() < (rmk ? .55 : .06)) return pick(buyers);
    const e = pick(firstNames) + '.' + Math.floor(R() * 900 + 100) + '@' + pick(domains); buyers.push(e); return e;
  }
  function makeSale(o, day, ad, gateway) {
    const method = R() < .71 ? 'pix' : 'card';
    const willPay = R() < (method === 'pix' ? .82 : .9);
    let status = willPay ? 'paid' : (R() < .7 ? 'pending' : 'abandoned');
    if (status === 'paid') { const r = R(); if (r < .022) status = 'refunded'; else if (method === 'card' && r < .03) status = 'chargeback'; }
    const hasBump = R() < o.bumpRate;
    const gross = o.price + (hasBump ? o.bump : 0);
    const fee = gateway === 'kiwify' ? Math.round(gross * .0899 + 249) : Math.round(gross * (method === 'pix' ? .0299 : .0499) + (method === 'pix' ? 0 : 100));
    const noUtm = ad && R() < .035;
    const h = String(8 + Math.floor(R() * 15)).padStart(2, '0') + ':' + String(Math.floor(R() * 60)).padStart(2, '0');
    const origin = !ad ? 'other' : (ad.rmk && R() < .28 ? 'thankyou' : 'ad');
    sales.push({ order_id: 'P' + (orderSeq++), offer: o.slug, day, at: day + 'T' + h + ':00-03:00', status, method, gateway, gross, fee, bump: hasBump ? o.bump : 0,
      product: o.name + (hasBump ? ' + bump' : ''), ad_id: noUtm ? null : ad?.id ?? null, ad_name: noUtm ? null : ad?.name ?? null,
      campaign: noUtm ? null : ad?.campaign.name ?? null, email: buyer(ad?.rmk), origin: noUtm ? 'other' : origin, no_utm: !ad || noUtm });
  }

  for (let back = 59; back >= 0; back--) {
    const day = addDays(TODAY, -back);
    for (const ad of ads) {
      const o = offerForCampaign(ad.campaign);
      if (back <= ad.from && back >= ad.to) {
        const partial = back === 0 ? .62 : 1;
        const sp = Math.round(ad.base * (.72 + .56 * R()) * partial);
        const impr = Math.round(sp * 1000 / (1500 + R() * 700));
        const lc = Math.round(impr * .014 * (.8 + .4 * R()) * (.85 + .25 * Math.min(ad.q, 1.4)));
        spend.push({ day, ad_id: ad.id, spend: sp, impressions: impr, link_clicks: lc });
        const pd = (pageDays[o.slug + day] ||= { offer: o.slug, day, sessions: 0, clicked: 0 });
        const sess = Math.round(lc * (.8 + .08 * R())); pd.sessions += sess; pd.clicked += Math.round(sess * (.16 + .1 * Math.min(ad.q, 1.4)));
        const expected = lc * (o.price > 3000 ? .035 : .088) * ad.q;
        const n = poisson(expected);
        const gw = () => o.slug === 'tiragem-premium' && R() < .3 ? 'kiwify' : o.platform;
        for (let i = 0; i < n; i++) makeSale(o, day, ad, gw());
      } else if (ad.trickle && back < ad.to && R() < .45) makeSale(o, day, ad, o.platform);
    }
    const o3 = offers[2]; const n3 = poisson(2.4);
    for (let i = 0; i < n3; i++) makeSale(o3, day, null, 'kiwify');
  }

  const cuts = [
    { id: 11, offer: 'guia-oracoes', ad_id: '120212000000105', ad_name: 'AD05 Carta aberta', spend: 3140, threshold: 3000, at: addDays(TODAY, -3) + 'T14:30:00-03:00', dismissed: false },
    { id: 7, offer: 'tiragem-premium', ad_id: '120212000000304', ad_name: 'T04 Imagem baralho', spend: 6210, threshold: 6000, at: addDays(TODAY, -12) + 'T10:00:00-03:00', dismissed: true },
  ];
  const changes = [
    { offer: 'guia-oracoes', day: addDays(TODAY, -8), kind: 'budget', text: 'Orçamento [ORACOES] CBO Frio BR: R$ 120 → R$ 150/dia' },
    { offer: 'guia-oracoes', day: addDays(TODAY, -10), kind: 'status', text: 'Ativados AD06 e AD07 (Teste A)' },
    { offer: 'guia-oracoes', day: addDays(TODAY, -25), kind: 'status', text: 'Pausado AD00 Carrossel antigo' },
    { offer: 'tiragem-premium', day: addDays(TODAY, -5), kind: 'budget', text: 'Orçamento [TIRAGEM] Conversão premium: R$ 160 → R$ 200/dia' },
  ];

  const mask = (e) => { if (!e) return '–'; const [u, d] = e.split('@'); return u.slice(0, 2) + '***@' + d.slice(0, 2) + '***.' + d.split('.').slice(1).join('.'); };
  const T0 = () => ({ spend: null, impressions: null, link_clicks: null, gross: 0, fee: 0, gross_m: 0, fee_m: 0, paid: 0, paid_pix: 0, bumps: 0, refunds: 0, chargebacks: 0, orders: 0, pending: 0, abandoned: 0, no_utm: 0 });
  const adIndex = Object.fromEntries(ads.map(a => [a.id, a]));

  function build(scope, from, to) {
    const offerOf = (adId) => offerForCampaign(adIndex[adId].campaign).slug;
    const inRange = (d) => d >= from && d <= to;
    const inScope = (slug) => scope === 'all' ? !offers.find(o => o.slug === slug).hidden : slug === scope;
    const sp = spend.filter(r => inRange(r.day) && inScope(offerOf(r.ad_id)));
    const sl = sales.filter(r => inRange(r.day) && inScope(r.offer));
    const hasMeta = (slug) => !!offers.find(o => o.slug === slug).ad_account_id;

    function totals(spRows, slRows, metaOn) {
      const t = T0();
      if (metaOn) { t.spend = 0; t.impressions = 0; t.link_clicks = 0; for (const r of spRows) { t.spend += r.spend; t.impressions += r.impressions; t.link_clicks += r.link_clicks; } }
      for (const s of slRows) {
        if (s.status === 'abandoned') { t.abandoned++; continue; }
        t.orders++;
        if (s.status === 'pending') t.pending++;
        if (s.status === 'refunded') t.refunds++;
        if (s.status === 'chargeback') t.chargebacks++;
        if (s.status === 'paid') {
          t.paid++; t.gross += s.gross; t.fee += s.fee; if (s.method === 'pix') t.paid_pix++; if (s.bump) t.bumps++; if (s.no_utm) t.no_utm++;
          if (hasMeta(s.offer)) { t.gross_m += s.gross; t.fee_m += s.fee; }
        }
      }
      return t;
    }
    function days(spRows, slRows, metaOn) {
      const out = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const t = totals(spRows.filter(r => r.day === d), slRows.filter(r => r.day === d), metaOn);
        out.push({ day: d, spend: t.spend, gross: t.gross, fee: t.fee, gross_m: t.gross_m, fee_m: t.fee_m, paid: t.paid, orders: t.orders });
      }
      return out;
    }
    const metaScope = scope === 'all' ? offers.some(o => !o.hidden && o.ad_account_id) : hasMeta(scope);
    const res = {
      demo: true, generated_at: new Date().toISOString(), base_url: 'https://placar.SEU-SUBDOMINIO.workers.dev',
      tax_rate: cfg.tax_rate, auto_cut: cfg.auto_cut, fx_markup: 0, last_sync: { at: new Date(Date.now() - 12 * 60e3).toISOString(), rows: spend.length, errors: [] }, refs: { ...refs }, verdict: { scale_min_sales: 3, scale_min_roas: 1.3, kill_roas: .8, kill_spend_mult: 2 },
      offers: offers.map(o => ({ ...o, sales_count: sales.filter(s => s.offer === o.slug).length })),
      scope, range: { from, to },
      totals: totals(sp, sl, metaScope), days: days(sp, sl, metaScope),
      marks: [...changes.filter(c => inRange(c.day) && inScope(c.offer)).map(c => ({ day: c.day, kind: c.kind, text: c.text })),
        ...cuts.filter(c => inRange(c.at.slice(0, 10)) && inScope(c.offer)).map(c => ({ day: c.at.slice(0, 10), kind: 'cut', text: 'Corte automático: ' + c.ad_name }))],
      cuts: cuts.filter(c => !c.dismissed && inScope(c.offer)).map(({ dismissed, ...c }) => c),
      campaigns: tree.map(c => ({ campaign_id: c.id, campaign_name: c.name, account_id: c.acc, filter_offer: filterOffer(c)?.slug ?? null, manual_offer: manualMap[c.id] ?? null })),
      sales: sl.filter(s => s.status !== 'abandoned').slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30)
        .map(s => ({ at: s.at, offer: s.offer, status: s.status, product: s.product, gross: s.gross, fee: s.fee, method: s.method, gateway: s.gateway, campaign: s.campaign, ad: s.ad_name, email: mask(s.email) })),
    };
    if (scope === 'all') {
      res.per_offer = offers.filter(o => !o.hidden).map(o => {
        const spo = sp.filter(r => offerOf(r.ad_id) === o.slug), slo = sl.filter(s => s.offer === o.slug), m = hasMeta(o.slug);
        return { slug: o.slug, totals: totals(spo, slo, m), days: days(spo, slo, m) };
      });
      return res;
    }
    const o = offers.find(x => x.slug === scope);
    const t = res.totals;
    // página (beacon). Oferta sem beacon → null
    const pds = Object.values(pageDays).filter(p => p.offer === scope && inRange(p.day));
    const sessions = pds.reduce((a, p) => a + p.sessions, 0), clicked = pds.reduce((a, p) => a + p.clicked, 0);
    const hasPage = sessions > 0;
    const secNames = ['topo', 'promessa', 'historia', 'depoimentos', 'oferta', 'garantia', 'faq'];
    const reachK = [1, .83, .66, .54, .43, .31, .17];
    const reached = secNames.map((s, i) => Math.round(sessions * reachK[i]));
    res.funnel = { clicks: t.link_clicks, visits: hasPage ? sessions : null, button: hasPage ? clicked : null, checkout: t.orders, paid: t.paid };
    res.page = hasPage ? {
      sessions, clicked, orders: t.orders, paid: t.paid, median_time_s: scope === 'guia-oracoes' ? 74 : 96, median_scroll_pct: scope === 'guia-oracoes' ? 58 : 49,
      modal: { shown: Math.round(sessions * .21), accepted: Math.round(sessions * .21 * .31), declined: Math.round(sessions * .21 * .52) },
      sections: secNames.map((s, i) => ({ section: s, reached: reached[i], exited: reached[i] - (reached[i + 1] ?? 0) })),
      buttons: [['comprar', 'oferta', .58], ['comprar', 'topo', .24], ['quero-agora', 'garantia', .12], ['duvidas-whatsapp', 'faq', .06]].map(([b, s, k]) => ({ button: b, section: s, clicks: Math.round(clicked * k) })),
      variants: o.page_url_b ? [{ variant: 'a', sessions: Math.round(sessions * .5), clicked: Math.round(clicked * .46), paid: Math.round(t.paid * .45) }, { variant: 'b', sessions: sessions - Math.round(sessions * .5), clicked: clicked - Math.round(clicked * .46), paid: t.paid - Math.round(t.paid * .45) }] : [],
    } : null;
    const gws = [...new Set(sl.map(s => s.gateway))];
    res.gateways = gws.map(g => {
      const r = sl.filter(s => s.gateway === g && s.status !== 'abandoned'), p = r.filter(s => s.status === 'paid');
      return { gateway: g, initiated: hasPage ? Math.round(clicked * (r.length / Math.max(1, t.orders))) : null, orders: r.length, paid: p.length,
        gross: p.reduce((a, s) => a + s.gross, 0), fee: p.reduce((a, s) => a + s.fee, 0), paid_pix: p.filter(s => s.method === 'pix').length };
    });
    const paidR = sl.filter(s => s.status === 'paid');
    const bset = [...new Set(paidR.map(s => s.email))];
    const allPaid = sales.filter(s => s.status === 'paid');
    const ltvNet = allPaid.filter(s => bset.includes(s.email)).reduce((a, s) => a + s.gross - s.fee, 0);
    const repeat = bset.filter(e => allPaid.filter(s => s.email === e).length >= 2).length;
    const org = (k) => { const r = paidR.filter(s => s.origin === k); return { n: r.length, net: r.reduce((a, s) => a + s.gross - s.fee, 0) }; };
    res.esteira = { buyers: bset.length, repeat_buyers: repeat, ltv_net_cents: bset.length ? Math.round(ltvNet / bset.length) : null, paid: t.paid, bumps: t.bumps, origin: { ad: org('ad'), thankyou: org('thankyou'), other: org('other') } };
    // por anúncio (inclui anúncio com venda e sem gasto no período)
    const adRows = {};
    const row = (a) => (adRows[a.id] ||= { ad_id: a.id, ad_name: a.name, adset_id: a.adset.id, adset_name: a.adset.name, campaign_id: a.campaign.id, campaign_name: a.campaign.name, spend: 0, impressions: 0, link_clicks: 0, orders: 0, paid: 0, gross: 0, fee: 0 });
    for (const r of sp) { const x = row(adIndex[r.ad_id]); x.spend += r.spend; x.impressions += r.impressions; x.link_clicks += r.link_clicks; }
    for (const s of sl) { if (!s.ad_id || s.status === 'abandoned') continue; const x = row(adIndex[s.ad_id]); x.orders++; if (s.status === 'paid') { x.paid++; x.gross += s.gross; x.fee += s.fee; } }
    res.ads = hasMeta(scope) || Object.keys(adRows).length ? Object.values(adRows) : [];
    res.live = live;
    return res;
  }

  const refs = { click_checkout: .15, checkout_paid: .85, bump: .20 };
  const cfg = { tax_rate: .06, auto_cut: true };
  return {
    TODAY, addDays,
    painel: (q) => build(q.offer || 'all', q.from, q.to),
    dismissCut: (id) => { const c = cuts.find(x => x.id === id); if (c) c.dismissed = true; },
    entity: ({ id, action, budget_cents, label }) => {
      const L = live[id]; if (!L) throw new Error('Entidade não encontrada');
      const off = (() => { for (const c of tree) { if (c.id === id) return offerForCampaign(c).slug; for (const s of c.adsets) { if (s.id === id) return offerForCampaign(c).slug; for (const a of s.ads) if (a.id === id) return offerForCampaign(c).slug; } } })();
      if (action === 'pause') { L.status = L.effective = 'PAUSED'; changes.push({ offer: off, day: TODAY, kind: 'status', text: 'Pausado ' + label }); }
      if (action === 'activate') { L.status = L.effective = 'ACTIVE'; changes.push({ offer: off, day: TODAY, kind: 'status', text: 'Ativado ' + label }); }
      if (action === 'budget') { const old = L.budget_cents; L.budget_cents = budget_cents; changes.push({ offer: off, day: TODAY, kind: 'budget', text: `Orçamento ${label}: ${(old / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} → ${(budget_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia` }); }
      return { ok: true };
    },
    saveRefs: (r) => Object.assign(refs, r),
    saveConfig: (b) => Object.assign(cfg, b),
    saveOffer: (patch) => {
      let o = offers.find(x => x.id === patch.id);
      if (!o) { if (offers.some(x => x.slug === patch.slug)) throw new Error('Já existe oferta com esse id'); o = { id: Math.max(...offers.map(x => x.id)) + 1, hidden: 0, webhook_token: 'whk_' + Math.random().toString(36).slice(2, 18), capi_set: false, price: 0, bump: 0, bumpRate: 0 }; offers.push(o); }
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) continue; if (k === 'capi_token') { if (v) o.capi_set = true; continue; } o[k] = v; }
      return { ok: true, offer: o };
    },
    deleteOffer: (id) => { const o = offers.find(x => x.id === id); if (sales.some(s => s.offer === o.slug)) throw new Error('Oferta tem vendas — só dá pra ocultar'); offers.splice(offers.indexOf(o), 1); return { ok: true }; },
    mapCampaign: (id, slug) => { if (slug) manualMap[id] = slug; else delete manualMap[id]; return { ok: true }; },
    sync: () => ({ ok: true, rows: spend.length }),
  };
})();
