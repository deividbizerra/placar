/* ================= AO VIVO: Meta Ads + n8n pelos conectores do Claude (capability mcp) ================= */
const Live = (() => {
  const CFG = typeof window !== 'undefined' ? window.PLACAR_LIVE : null;
  if (!CFG) return null;
  const S_META = CFG.servers?.meta || 'MetaAds', S_N8N = CFG.servers?.n8n || 'N8N';
  const WORKER = CFG.transport === 'worker';
  const WKEY = new URLSearchParams(location.search).get('key');
  async function wfetch(path, body) {
    let r;
    try { r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-placar-key': WKEY || '' }, body: JSON.stringify(body) }); }
    catch { const e = new Error('Sem conexão com o servidor do Placar'); e.code = 'server_unavailable'; throw e; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Servidor respondeu ${r.status}`); e.code = r.status === 401 ? 'needs_reauth' : 'tool_error'; throw e; }
    return j;
  }
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('placar.live.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('placar.live.' + k, JSON.stringify(v)); } catch {} },
  };
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const CONV = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => ABC[b % 62]).join('');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daySP = (iso) => iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : null;
  const norm = (s) => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
  const cents = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return Math.round(v * 100); let s = String(v).replace(/[^\d,.-]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) : null; };
  const isMain = (p) => !/UPSELL|DOWNSELL|ORDER\s*BUMP|BUMP/i.test(p || '');

  const DEFAULTS = { tax: 0, fx_markup: 0, cut_spend_cents: null, ticket_target_cents: null, cpa_target_cents: null };
  const settings = () => ({ ...DEFAULTS, accounts: CFG.accounts, ...LS.get('settings', {}) });

  let mcpP = null;
  const getMcp = () => (mcpP ||= (window.claude?.use ? window.claude.use('mcp') : Promise.resolve(null)));
  function friendly(e, server) {
    switch (e?.code) {
      case 'server_not_connected': return `Conector “${server}” não está conectado. Adicione em Configurações → Conectores do Claude.`;
      case 'needs_reauth': return `Reconecte “${server}” em Configurações → Conectores do Claude.`;
      case 'selection_required': return `Escolha qual conexão “${server}” este painel deve usar.`;
      case 'not_in_manifest': return `Você não liberou “${server}” para este painel.`;
      case 'blocked_by_policy': case 'approval_required': return `Sua organização bloqueou esta ação em “${server}”.`;
      case 'server_unavailable': case 'rate_limited': return `“${server}” não respondeu agora. Tento de novo na próxima atualização.`;
      case 'not_granted': case 'capability_disabled': case 'capability_removed': return 'Esta visualização não tem acesso aos conectores. Abra o painel no Claude.';
      case 'tool_error': return `${server}: ${e.message}`;
      default: return `${server}: ${e?.message || 'erro desconhecido'}`;
    }
  }
  async function call(server, tool, input) {
    if (WORKER) return wfetch('/api/live/tool', { server, tool, input });
    const mcp = await getMcp();
    if (!mcp) { const err = new Error('Esta visualização não tem acesso aos conectores. Abra o painel no Claude.'); err.code = 'no_mcp'; throw err; }
    try { const r = await mcp.callTool(server, tool, input); return r.payload ?? r; }
    catch (e) { const err = new Error(friendly(e, server)); err.code = e?.code; err.retryable = e?.retryable; throw err; }
  }
  const entities = (p) => { const x = p?.ad_entities; return typeof x === 'string' ? JSON.parse(x) : (x || []); };
  const metaInput = (acc, extra, why) => ({ client_conversation_id: CONV, advertiser_request: why, ad_account_id: acc.id, include_additional_context: false, ...extra });

  /* ---------- Meta: linhas por anúncio/dia ---------- */
  const metaCache = new Map();
  async function metaRows(acc, since, until, force) {
    const key = acc.id + '|' + since + '|' + until;
    const c = metaCache.get(key);
    if (c && !force && Date.now() - c.t < 5 * 60e3) return c;
    const out = []; let cursor;
    for (let i = 0; i < 40; i++) {
      const input = metaInput(acc, { level: 'ad', time_range: JSON.stringify({ since, until }), time_increment: '1', limit: 1000,
        fields: ['name', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'amount_spent', 'impressions', 'link_click', 'effective_status', 'status'] }, 'ver gasto, cliques e status dos anúncios no painel Placar');
      if (cursor) input.cursor = cursor;
      const p = await call(S_META, 'ads_get_ad_entities', input);
      const ents = entities(p);
      out.push(...ents);
      cursor = p?.pagination?.next_cursor;
      if (!cursor || !ents.length) break;
    }
    const rows = out.map(r => ({ day: r.date_start, ad_id: String(r.id), ad_name: r.name, adset_id: String(r.adset_id), adset_name: r.adset_name, campaign_id: String(r.campaign_id), campaign_name: r.campaign_name,
      spend_orig: cents(r.amount_spent) ?? 0, impressions: +r.impressions || 0, link_clicks: +r.link_click || 0, effective: r.effective_status, status: r.status, acc: acc.id }));
    // índice persistente anúncio → conta/nomes (atribui venda de anúncio que não gastou no período)
    const idx = LS.get('adIndex', {});
    for (const r of rows) idx[r.ad_id] = [acc.id, r.ad_name, r.adset_id, r.adset_name, r.campaign_id, r.campaign_name];
    const keys = Object.keys(idx); if (keys.length > 6000) for (const k of keys.slice(0, keys.length - 6000)) delete idx[k];
    LS.set('adIndex', idx);
    const res = { rows, t: Date.now() };
    metaCache.set(key, res);
    return res;
  }

  /* ---------- Meta: anúncios ativos (inclui os que ainda não gastaram no período) ---------- */
  const activeCache = new Map();
  async function activeAds(acc, force) {
    const c = activeCache.get(acc.id);
    if (c && !force && Date.now() - c.t < 3 * 60e3) return c.list;
    const out = []; let cursor;
    for (let i = 0; i < 10; i++) {
      const input = metaInput(acc, { level: 'ad', filtering: [{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }], date_preset: 'today', limit: 1000, include_additional_context: false,
        fields: ['name', 'effective_status', 'status', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name'] }, 'ver campanhas ativas no painel Placar');
      if (cursor) input.cursor = cursor;
      const p = await call(S_META, 'ads_get_ad_entities', input);
      const ents = entities(p);
      out.push(...ents);
      cursor = p?.pagination?.next_cursor;
      if (!cursor || !ents.length) break;
    }
    const list = out.filter(e => e && e.id && e.campaign_id).map(e => ({ ad_id: String(e.id), ad_name: e.name, adset_id: String(e.adset_id), adset_name: e.adset_name, campaign_id: String(e.campaign_id), campaign_name: e.campaign_name }));
    const idx = LS.get('adIndex', {});
    for (const a of list) idx[a.ad_id] = [acc.id, a.ad_name, a.adset_id, a.adset_name, a.campaign_id, a.campaign_name];
    LS.set('adIndex', idx);
    activeCache.set(acc.id, { list, t: Date.now() });
    return list;
  }

  /* ---------- Meta: status e orçamento ao vivo ---------- */
  const liveCache = new Map();
  async function liveStatus(acc, rows, force) {
    const key = acc.id;
    const c = liveCache.get(key);
    const ids = (k) => [...new Set(rows.map(r => r[k]).filter(v => v && v !== 'undefined'))];
    const want = { campaign: ids('campaign_id'), adset: ids('adset_id'), ad: ids('ad_id') };
    if (c && !force && Date.now() - c.t < 3 * 60e3 && want.ad.every(id => c.data[id])) return c.data;
    const data = { _currency: acc.currency };
    const lv = async (level, list, fields) => {
      for (let i = 0; i < list.length; i += 900) {
        const p = await call(S_META, 'ads_get_ad_entities', metaInput(acc, { level, object_ids: list.slice(i, i + 900), fields }, 'ver status e orçamento das campanhas no painel Placar'));
        for (const e of entities(p)) data[String(e.id)] = { level, acc: acc.id, name: e.name, status: e.status ?? null, effective: e.effective_status ?? e.status ?? null,
          budget_cents: e.daily_budget ? cents(e.daily_budget) : null, budget_type: e.daily_budget ? 'daily' : e.lifetime_budget ? 'lifetime' : null, lifetime_cents: e.lifetime_budget ? cents(e.lifetime_budget) : null };
      }
    };
    await Promise.all([
      lv('campaign', want.campaign, ['name', 'effective_status', 'status', 'daily_budget', 'lifetime_budget']),
      lv('adset', want.adset, ['name', 'effective_status', 'status', 'daily_budget', 'lifetime_budget']),
      lv('ad', want.ad, ['name', 'effective_status', 'status']),
    ]);
    liveCache.set(key, { data, t: Date.now() });
    return data;
  }

  const freqCache = new Map();
  async function campFreq(acc, ids, since, until, force) {
    if (!ids.length) return {};
    const key = acc.id + '|' + since + '|' + until + '|' + ids.slice().sort().join(',');
    const c = freqCache.get(key);
    if (c && !force && Date.now() - c.t < 10 * 60e3) return c.data;
    const p = await call(S_META, 'ads_get_ad_entities', metaInput(acc, { level: 'campaign', object_ids: ids.slice(0, 900), time_range: JSON.stringify({ since, until }), fields: ['frequency', 'reach'] }, 'ver frequência e alcance das campanhas pra análise no painel Placar'));
    const data = {};
    for (const e of entities(p)) data[String(e.id)] = { frequency: e.frequency != null ? Number(String(e.frequency).replace(',', '.')) : null, reach: e.reach != null ? Number(String(e.reach).replace(/\D/g, '')) : null };
    freqCache.set(key, { data, t: Date.now() });
    return data;
  }

  /* ---------- n8n: vendas, leads e dólar ---------- */
  let salesCache = null, salesInflight = null;
  async function n8nData(since, force) {
    const sinceISO = new Date(since + 'T03:00:00Z').toISOString();
    if (salesCache && !force && salesCache.since <= sinceISO && Date.now() - salesCache.t < 20e3) return salesCache;
    if (salesInflight) return salesInflight;
    salesInflight = (async () => {
      if (WORKER) {
        const json = await wfetch('/api/live/sales', { since: sinceISO });
        if (!json?.ok) throw new Error('n8n respondeu sem os dados de vendas');
        return (salesCache = { ...json, since: sinceISO, t: Date.now() });
      }
      const ex = await call(S_N8N, 'execute_workflow', { workflowId: CFG.n8nWorkflowId, executionMode: 'production', inputs: { type: 'webhook', webhookData: { method: 'POST', body: { since: sinceISO } } } });
      const id = ex?.executionId;
      if (!id) throw new Error('n8n não iniciou a consulta de vendas');
      for (let i = 0; i < 25; i++) {
        await sleep(i < 3 ? 1200 : 2000);
        const g = await call(S_N8N, 'get_execution', { workflowId: CFG.n8nWorkflowId, executionId: String(id), includeData: true, nodeNames: ['Resposta'] });
        const st = g?.execution?.status;
        if (st === 'success') {
          const json = g?.data?.resultData?.runData?.Resposta?.[0]?.data?.main?.[0]?.[0]?.json;
          if (!json?.ok) throw new Error('n8n respondeu sem os dados de vendas');
          return (salesCache = { ...json, since: sinceISO, t: Date.now() });
        }
        if (['error', 'crashed', 'canceled'].includes(st)) throw new Error(`n8n: a consulta de vendas terminou com “${st}” (veja a execução ${id} no n8n)`);
      }
      throw new Error('n8n demorou mais de 50 s pra responder as vendas');
    })().finally(() => { salesInflight = null; });
    return salesInflight;
  }

  /* ---------- monta o mesmo contrato do /api/painel ---------- */
  async function painel(q, force) {
    const st = settings();
    const scope = q.offer || 'all', from = q.from, to = q.to;
    const accs = st.accounts;
    const errors = [];
    const offers = accs.map((a, i) => ({ id: i + 1, slug: 'conta-' + a.id, name: a.name, platform: 'whatsapp', pixel_id: '', ad_account_id: 'act_' + a.id, campaign_filter: '', page_url: '', page_url_b: '',
      ticket_target_cents: st.ticket_target_cents, cpa_target_cents: st.cpa_target_cents, cut_spend_cents: st.cut_spend_cents, hidden: 0, webhook_token: '', capi_set: true, sales_count: null, currency: a.currency }));
    const accBySlug = Object.fromEntries(offers.map((o, i) => [o.slug, accs[i]]));
    const scopeAccs = scope === 'all' ? accs : [accBySlug[scope]].filter(Boolean);

    const [sales, ...metas] = await Promise.all([
      n8nData(addDays(from, 0), force).catch(e => { errors.push({ section: 'vendas', message: e.message }); return null; }),
      ...accs.map(a => metaRows(a, from, to, force).catch(e => { errors.push({ section: 'meta', message: `${a.name}: ${e.message}` }); return null; })),
    ]);
    const metaOk = Object.fromEntries(accs.map((a, i) => [a.id, metas[i]]));

    // câmbio
    const fxDays = sales?.fx_usd ? Object.keys(sales.fx_usd).sort() : [];
    const rate = (acc, day) => {
      if (acc.currency === 'BRL') return 1;
      if (acc.currency !== 'USD' || !fxDays.length) return null;
      let best = null; for (const d of fxDays) { if (d <= day) best = d; else break; }
      return best ? sales.fx_usd[best] * (1 + (st.fx_markup || 0)) : null;
    };
    let fxMissing = false;
    const rowsAll = [];
    for (const a of accs) for (const r of metaOk[a.id]?.rows || []) {
      const k = rate(a, r.day);
      if (k == null) fxMissing = true;
      rowsAll.push({ ...r, spend: k == null ? null : Math.round(r.spend_orig * k) });
    }
    if (fxMissing) errors.push({ section: 'câmbio', message: 'Sem cotação do dólar (vem do n8n) — gasto em dólar fica “–” até ela chegar.' });

    // atribuição: utm_term = id do anúncio; senão campanha + conjunto + nome
    const idx = LS.get('adIndex', {});
    const byName = new Map();
    for (const [adId, [acc, adName, , adsetName, , campName]] of Object.entries(idx)) {
      byName.set(norm(campName) + '|' + norm(adsetName) + '|' + norm(adName), adId);
      if (!byName.has(norm(campName) + '||' + norm(adName))) byName.set(norm(campName) + '||' + norm(adName), adId);
    }
    const adOf = (u) => {
      if (u.utm_term && idx[u.utm_term]) return u.utm_term;
      if (u.utm_content && u.utm_campaign) return byName.get(norm(u.utm_campaign) + '|' + norm(u.utm_medium) + '|' + norm(u.utm_content)) || byName.get(norm(u.utm_campaign) + '||' + norm(u.utm_content)) || null;
      return null;
    };
    const inScopeAd = (adId) => adId && scopeAccs.some(a => idx[adId]?.[0] === a.id);
    const orders = (sales?.orders || []).map(o => ({ ...o, day: daySP(o.at), ad: adOf(o), main: isMain(o.produto) })).filter(o => o.day >= from && o.day <= to);
    const scoped = scope === 'all' ? orders : orders.filter(o => inScopeAd(o.ad));
    const leadAgg = (sales?.leads || []).map(l => ({ ...l, ad: adOf(l) })).filter(l => l.dia >= from && l.dia <= to && (scope === 'all' || inScopeAd(l.ad)));

    const dayList = []; for (let d = from; d <= to; d = addDays(d, 1)) dayList.push(d);
    const salesOn = !!sales;
    function build(accList, ordersList) {
      const accIds = new Set(accList.map(a => a.id));
      const rows = rowsAll.filter(r => accIds.has(r.acc));
      const metaAvail = accList.some(a => metaOk[a.id]);
      const spendKnown = metaAvail && !rows.some(r => r.spend == null);
      const T = { spend: spendKnown ? 0 : null, impressions: metaAvail ? 0 : null, link_clicks: metaAvail ? 0 : null,
        gross: salesOn ? 0 : null, fee: salesOn ? 0 : null, gross_m: salesOn ? 0 : null, fee_m: salesOn ? 0 : null, paid: salesOn ? 0 : null, paid_pix: salesOn ? 0 : null, bumps: salesOn ? 0 : null,
        refunds: 0, chargebacks: 0, orders: salesOn ? 0 : null, pending: null, abandoned: null, no_utm: salesOn ? 0 : null };
      const D = Object.fromEntries(dayList.map(d => [d, { day: d, spend: spendKnown ? 0 : null, gross: salesOn ? 0 : null, fee: salesOn ? 0 : null, gross_m: salesOn ? 0 : null, fee_m: salesOn ? 0 : null, paid: salesOn ? 0 : null, orders: salesOn ? 0 : null }]));
      const curs = new Set(accList.map(a => a.currency));
      T.spend_orig = curs.size === 1 && metaAvail ? 0 : null; T.orig_currency = curs.size === 1 ? [...curs][0] : null;
      for (const r of rows) { if (T.spend_orig != null) T.spend_orig += r.spend_orig; if (spendKnown) { T.spend += r.spend; if (D[r.day]) D[r.day].spend += r.spend; } T.impressions += r.impressions; T.link_clicks += r.link_clicks; }
      if (salesOn) for (const o of ordersList) {
        const c = Math.round(o.valor * 100);
        T.gross += c; T.gross_m += c; T.orders++;
        if (o.main) { T.paid++; if (/pix/i.test(o.metodo || 'pix')) T.paid_pix++; if (!o.ad) T.no_utm++; } else T.bumps++;
        if (D[o.day]) { D[o.day].gross += c; D[o.day].gross_m += c; D[o.day].orders++; if (o.main) D[o.day].paid++; }
      }
      return { totals: T, days: Object.values(D) };
    }
    const main = build(scopeAccs, scoped);
    const res = {
      demo: false, live_mode: true, readonly: false, sales_source: salesOn, currency: 'BRL', generated_at: new Date().toISOString(), base_url: '',
      tax_rate: st.tax || 0, fx_markup: st.fx_markup || 0, auto_cut: false, settings: st,
      last_sync: { at: new Date(Math.min(...accs.map(a => metaOk[a.id]?.t || Date.now()))).toISOString(), rows: rowsAll.length, errors: [] },
      sales_at: salesCache?.gerado_em || null, errors,
      refs: { click_checkout: .15, checkout_paid: .85, bump: .20, ...LS.get('refs', {}) }, verdict: { scale_min_sales: 3, scale_min_roas: 1.3, kill_roas: .8, kill_spend_mult: 2 },
      offers, scope, range: { from, to }, totals: main.totals, days: main.days,
      marks: LS.get('marks', []).filter(m => m.day >= from && m.day <= to && (scope === 'all' || scopeAccs.some(a => a.id === m.acc))),
      cuts: [], campaigns: [],
      sales: salesOn ? scoped.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30).map(o => ({
        id: o.id, at: o.at, offer: o.ad ? 'conta-' + idx[o.ad][0] : 'sem anúncio', status: 'paid', product: o.produto, gross: Math.round(o.valor * 100), fee: 0, method: /pix/i.test(o.metodo || '') ? 'pix' : (o.metodo || '').toLowerCase(),
        gateway: 'WhatsApp', campaign: o.utm_campaign, ad: o.ad ? idx[o.ad][1] : o.utm_content, email: o.tel_fim ? 'final ' + o.tel_fim : '–' })) : [],
      all_order_ids: salesOn ? (sales.orders || []).map(o => o.id) : null,
      recent_orders: salesOn ? (sales.orders || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 150).map(o => { const ad = adOf(o); const accId = ad ? idx[ad][0] : null; return { id: o.id, at: o.at, gross: Math.round(o.valor * 100), product: o.produto, main: isMain(o.produto), ad: ad ? idx[ad][1] : o.utm_content, campaign: o.utm_campaign, account: accId ? (accs.find(a => a.id === accId)?.name || null) : null }; }) : null,
    };
    if (scope === 'all') {
      res.per_offer = offers.map((o, i) => ({ slug: o.slug, ...build([accs[i]], orders.filter(x => x.ad && idx[x.ad][0] === accs[i].id)) }));
      res.unattributed = salesOn ? orders.filter(o => !o.ad).length : null;
      return res;
    }
    const T = main.totals;
    res.funnel = { clicks: T.link_clicks, visits: salesOn ? leadAgg.reduce((s, l) => s + l.visitas, 0) : null, button: null, leads: salesOn && (sales.leads || []).some(l => l.whatsapp > 0) ? leadAgg.reduce((s, l) => s + l.whatsapp, 0) : null, checkout: null, paid: T.paid };
    res.funnel_labels = { visits: 'Página', leads: 'WhatsApp' };
    res.gateways = null; res.page = null;
    const prods = {};
    for (const o of scoped) { const p = (prods[o.produto || '(sem nome)'] ||= { produto: o.produto || '(sem nome)', n: 0, gross: 0, main: o.main }); p.n++; p.gross += Math.round(o.valor * 100); }
    res.esteira = salesOn ? { products: Object.values(prods).sort((a, b) => (b.main - a.main) || b.gross - a.gross), mains: T.paid, upsells: T.bumps, gross: T.gross,
      origin: { ad: { n: scoped.filter(o => o.ad).length, net: scoped.filter(o => o.ad).reduce((s, o) => s + Math.round(o.valor * 100), 0) }, thankyou: { n: 0, net: 0 }, other: { n: scoped.filter(o => !o.ad).length, net: scoped.filter(o => !o.ad).reduce((s, o) => s + Math.round(o.valor * 100), 0) } } } : null;
    // por anúncio
    const acc = scopeAccs[0];
    const rows = rowsAll.filter(r => r.acc === acc.id);
    const g = {};
    const row = (adId) => { const m = idx[adId]; return (g[adId] ||= { ad_id: adId, ad_name: m?.[1] ?? adId, adset_id: m?.[2], adset_name: m?.[3], campaign_id: m?.[4], campaign_name: m?.[5], spend: 0, impressions: 0, link_clicks: 0, orders: salesOn ? 0 : null, paid: salesOn ? 0 : null, gross: salesOn ? 0 : null, fee: salesOn ? 0 : null, _spendNull: false }); };
    // campanha ativa sem gasto no período (acabou de subir, ainda não entregou) também aparece, com gasto zero
    let actives = [];
    if (metaOk[acc.id]) { try { actives = await activeAds(acc, force); } catch (e) { res.active_error = e.message; } }
    for (const a of actives) { if (!idx[a.ad_id]) idx[a.ad_id] = [acc.id, a.ad_name, a.adset_id, a.adset_name, a.campaign_id, a.campaign_name]; row(a.ad_id); }
    for (const r of rows) { const x = row(r.ad_id); if (r.spend == null) x._spendNull = true; else x.spend += r.spend; x.impressions += r.impressions; x.link_clicks += r.link_clicks; }
    if (salesOn) for (const o of scoped) if (o.ad) { const x = row(o.ad); x.orders++; if (o.main) x.paid++; x.gross += Math.round(o.valor * 100); }
    res.ads = Object.values(g).map(({ _spendNull, ...x }) => ({ ...x, spend: _spendNull ? null : x.spend }));
    // dados pra análise por campanha: dia a dia, tendência dos anúncios (últimos 3 dias × antes), visitas e frequência
    const recentFrom = addDays(to, -2) >= from ? addDays(to, -2) : from;
    const blank = (day) => ({ day, spend: 0, impressions: 0, link_clicks: 0, orders: 0, paid: 0, gross: 0 });
    const cd = {};
    for (const r of rows) { const x = ((cd[r.campaign_id] ||= {})[r.day] ||= blank(r.day)); x.spend += r.spend ?? 0; x.impressions += r.impressions; x.link_clicks += r.link_clicks; }
    if (salesOn) for (const o of scoped) if (o.ad && idx[o.ad]?.[4]) { const x = ((cd[idx[o.ad][4]] ||= {})[o.day] ||= blank(o.day)); x.orders++; if (o.main) x.paid++; x.gross += Math.round(o.valor * 100); }
    res.camp_days = Object.fromEntries(Object.entries(cd).map(([k, v]) => [k, Object.values(v).sort((a, b) => a.day < b.day ? -1 : 1)]));
    const at = {};
    const tb = () => ({ spend: 0, impressions: 0, link_clicks: 0, paid: 0, gross: 0 });
    for (const r of rows) { const x = (at[r.ad_id] ||= { recent: tb(), prev: tb() }); const b = r.day >= recentFrom ? x.recent : x.prev; b.spend += r.spend ?? 0; b.impressions += r.impressions; b.link_clicks += r.link_clicks; }
    if (salesOn) for (const o of scoped) if (o.ad) { const x = (at[o.ad] ||= { recent: tb(), prev: tb() }); const b = o.day >= recentFrom ? x.recent : x.prev; if (o.main) b.paid++; b.gross += Math.round(o.valor * 100); }
    res.ad_trend = at; res.recent_from = recentFrom;
    if (salesOn) { const vc = {}, wc = {}; for (const l of leadAgg) { const cid = l.ad ? idx[l.ad]?.[4] : null; if (cid) { vc[cid] = (vc[cid] || 0) + l.visitas; wc[cid] = (wc[cid] || 0) + l.whatsapp; } } res.camp_visits = vc; res.camp_contacts = wc; } else { res.camp_visits = null; res.camp_contacts = null; }
    try { res.camp_freq = await campFreq(acc, [...new Set(rows.filter(r => r.spend_orig > 0).map(r => r.campaign_id))], from, to, force); } catch { res.camp_freq = null; }
    try { res.live = metaOk[acc.id] ? await liveStatus(acc, res.ads, force) : {}; }
    catch (e) { res.live = {}; res.live_error = e.message; }
    return res;
  }

  /* ---------- ações ---------- */
  async function entity({ id, action, budget_cents, label }) {
    let info = null;
    for (const c of liveCache.values()) if (c.data[id]) { info = c.data[id]; break; }
    const st = settings();
    const acc = st.accounts.find(a => a.id === info?.acc);
    if (!info || !acc) throw new Error('Não achei esse item nas contas carregadas — atualize e tente de novo');
    const type = info.level === 'adset' ? 'ad_set' : info.level;
    const name = info.name || label || id;
    const why = (t) => `${t} “${name}” pelo painel Placar`;
    let text;
    if (action === 'pause') {
      await call(S_META, 'ads_update_entity', { client_conversation_id: CONV, advertiser_request: why('pausar'), ad_account_id: acc.id, entity_id: id, entity_type: type, fields: JSON.stringify({ status: 'PAUSED' }) });
      text = 'Pausado ' + name;
    } else if (action === 'activate') {
      await call(S_META, 'ads_activate_entity', { client_conversation_id: CONV, advertiser_request: why('ativar'), ad_account_id: acc.id, entity_id: id, entity_type: type });
      text = 'Ativado ' + name;
    } else if (action === 'budget') {
      const v = Number(budget_cents);
      if (!Number.isInteger(v) || v <= 0) throw new Error('Orçamento inválido');
      const btype = info.budget_type;
      if (btype !== 'daily' && btype !== 'lifetime') throw new Error('Esse item não tem orçamento próprio (o orçamento fica no outro nível)');
      const wasActive = info.status === 'ACTIVE';
      const r = await call(S_META, 'ads_update_entity', { client_conversation_id: CONV, advertiser_request: why(`mudar o orçamento diário de`), ad_account_id: acc.id, entity_id: id, entity_type: type, fields: JSON.stringify(btype === 'daily' ? { daily_budget: v } : { lifetime_budget: v }) });
      const f = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: acc.currency });
      const old = btype === 'daily' ? info.budget_cents : info.lifetime_cents;
      text = `Orçamento ${name}: ${f(old)} → ${f(v)}${btype === 'daily' ? '/dia' : ' total'}`;
      // a Meta pausa item ativo quando o orçamento é editado por essa integração; religa em seguida
      if (wasActive && (r?.status_forced_to_paused || JSON.stringify(r || '').includes('forced_to_paused'))) {
        try { await call(S_META, 'ads_activate_entity', { client_conversation_id: CONV, advertiser_request: why('reativar depois de mudar o orçamento de'), ad_account_id: acc.id, entity_id: id, entity_type: type }); text += ' (reativado)'; }
        catch (e) { text += ' — ATENÇÃO: ficou pausado, ative de novo'; }
      }
    } else throw new Error('Ação inválida');
    const marks = LS.get('marks', []); marks.push({ day: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), kind: action === 'budget' ? 'budget' : 'status', text, acc: acc.id }); LS.set('marks', marks.slice(-300));
    liveCache.delete(acc.id);
    return { ok: true, text };
  }

  async function listAccounts() {
    const out = []; let cursor;
    for (let i = 0; i < 10; i++) {
      const p = await call(S_META, 'ads_get_ad_accounts', { client_conversation_id: CONV, advertiser_request: 'escolher as contas de anúncio do painel Placar', limit: 50, ...(cursor ? { cursor } : {}) });
      out.push(...(p?.ad_accounts || [])); cursor = p?.next_cursor; if (!cursor) break;
    }
    return out.filter(a => a.is_ads_mcp_enabled && a.is_queryable).map(a => ({ id: String(a.ad_account_id), name: String(a.ad_account_name || '').replace(/\s*\(Read-Only\)\s*$/i, '').trim(), currency: a.currency, status: a.account_status }));
  }

  return {
    painel, entity, listAccounts, settings,
    saveSettings: (s) => { LS.set('settings', { ...LS.get('settings', {}), ...s }); metaCache.clear(); liveCache.clear(); },
    saveRefs: (r) => LS.set('refs', r),
    available: async () => WORKER || !!(await getMcp()),
    worker: WORKER,
  };
})();
