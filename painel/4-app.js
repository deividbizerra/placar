/* ================= PAINEL ================= */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DASH = '–';
const qs = new URLSearchParams(location.search);
const KEY = qs.get('key');
const LIVE = typeof Live !== 'undefined' && Live && (Live.worker || !KEY);
const SNAP = !LIVE && typeof Snapshot !== 'undefined' && Snapshot && !KEY;
const DEMO = !LIVE && !SNAP && (!KEY || qs.get('demo') === '1');
const store = { get(k, d) { try { const v = localStorage.getItem('placar.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('placar.' + k, JSON.stringify(v)); } catch {} } };

/* ---------- formatação: sem dado → "–" ---------- */
const ok = (v) => v != null && Number.isFinite(v);
let CUR = 'BRL';
const F = {
  brl: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  brlC: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }),
  i: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
  d2: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};
function setCurrency(c) { if (!c || c === CUR) return; CUR = c; F.brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c }); F.brlC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }); }
const brl = (c) => ok(c) ? F.brl.format(c / 100) : DASH;
const brlC = (c) => ok(c) ? (Math.abs(c) >= 1e6 ? F.brlC.format(c / 100) : F.brl.format(Math.round(c / 100)).replace(/,00(?=\s|$)/, '')) : DASH;
const signed = (c) => ok(c) ? (c > 0 ? '+' : c < 0 ? '−' : '') + F.brl.format(Math.abs(c) / 100) : DASH;
const int = (n) => ok(n) ? F.i.format(n) : DASH;
const pct = (v, d = 1) => ok(v) ? (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : DASH;
const xr = (v) => ok(v) ? F.d2.format(v) + '×' : DASH;
const div = (a, b) => ok(a) && ok(b) && b > 0 ? a / b : null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dm = (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : DASH;
const when = (iso) => { if (!iso) return DASH; const d = new Date(iso); return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', ''); };
// “[MABEL] - [VENDAS] - [ WEBSITE] - [CP 05 ] - [HORARIOS]” → “MABEL · VENDAS · WEBSITE · CP 05 · HORARIOS”
const nice = (n) => { const t = String(n ?? ''); const parts = t.match(/\[[^\]]*\]/g); if (!parts || parts.length < 2) return t; const rest = t.replace(/\[[^\]]*\]/g, ' ').replace(/[-–—|]+/g, ' ').trim(); return [...parts.map(x => x.slice(1, -1).trim().replace(/\s+/g, ' ')), ...(rest ? [rest] : [])].filter(Boolean).join(' · '); };
const tone = (v) => !ok(v) ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '';

/* ---------- regras (as mesmas do README) ----------
   Receita líquida = bruto − taxa · Investido = gasto × (1 + imposto)
   ROAS líquido = receita líquida / investido · CPA = gasto / vendas pagas · Ticket = receita líquida / vendas
   ROAS e resultado só usam receita de ofertas que têm gasto sincronizado (gross_m/fee_m).            */
function derive(t, tax) {
  const hasSpend = ok(t.spend);
  const hasSales = ok(t.gross);
  const net = hasSales ? t.gross - (t.fee || 0) : null, netM = hasSales ? (t.gross_m ?? t.gross) - (t.fee_m ?? t.fee ?? 0) : null;
  const invest = hasSpend ? t.spend * (1 + tax) : null;
  return {
    net, invest, taxCents: hasSpend ? t.spend * tax : null,
    roas: div(netM, invest), result: hasSpend && hasSales ? netM - invest : null,
    cpa: hasSpend && ok(t.paid) ? div(t.spend, t.paid) : null, ticket: div(net, t.paid),
    ctr: div(t.link_clicks, t.impressions), cpc: div(t.spend, t.link_clicks),
    ckConv: div(t.paid, t.orders), pix: div(t.paid_pix, t.paid), bump: div(t.bumps, t.paid),
  };
}

/* ---------- estado ---------- */
const S = {
  offer: store.get('offer', 'all'), preset: store.get('preset', '7'), from: null, to: null,
  data: null, minimized: store.get('min', {}), perfLevel: store.get('perfLevel', 'campaign'),
  perfOnlyActive: store.get('perfOnlyActive', false), perfOnlyRed: store.get('perfOnlyRed', false),
  perfSort: store.get('perfSort', { k: 'spend', dir: -1 }), perfAllCols: store.get('perfAllCols', false), editing: null,
};
const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function applyPreset(p) {
  const t = todaySP();
  if (p === 'today') { S.from = S.to = t; }
  else if (p === 'yesterday') { S.from = S.to = addDays(t, -1); }
  else if (p === 'custom') { return; }
  else { S.from = addDays(t, -(+p - 1)); S.to = t; }
  S.preset = p; store.set('preset', p);
}
function clampLive() { if (LIVE && S.from && S.to && addDays(S.from, 59) < S.to) { S.from = addDays(S.to, -59); toast('No painel ao vivo o período vai até 60 dias'); } }

/* ---------- API ---------- */
async function api(path, opts = {}) {
  if (LIVE) {
    const u = new URL(path, 'https://x'), b = opts.body ? JSON.parse(opts.body) : {};
    if (u.pathname === '/api/painel') return Live.painel(Object.fromEntries(u.searchParams), S.force);
    if (u.pathname === '/api/meta/entity') return Live.entity(b);
    if (u.pathname === '/api/config') return Live.saveSettings(b);
    if (u.pathname === '/api/config/refs') return Live.saveRefs(b);
    if (u.pathname === '/api/sync') { S.force = true; return { ok: true, rows: 0, errors: [] }; }
    if (u.pathname === '/api/accounts') return Live.listAccounts();
    throw new Error('Ação não disponível no painel ao vivo');
  }
  if (SNAP) { const u = new URL(path, 'https://x'); if (u.pathname === '/api/painel') return Snapshot.painel(Object.fromEntries(u.searchParams)); throw new Error('Retrato só de leitura: publique o Worker pra usar essa ação'); }
  if (DEMO) return demoRoute(path, opts);
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-placar-key': KEY, ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Falha ' + r.status);
  return j;
}
function demoRoute(path, opts) {
  const u = new URL(path, 'https://x'); const b = opts.body ? JSON.parse(opts.body) : {};
  return new Promise((res, rej) => setTimeout(() => { try {
    if (u.pathname === '/api/painel') return res(Demo.painel(Object.fromEntries(u.searchParams)));
    if (u.pathname === '/api/cuts/dismiss') return res(Demo.dismissCut(b.id));
    if (u.pathname === '/api/meta/entity') return res(Demo.entity(b));
    if (u.pathname === '/api/config/refs') return res(Demo.saveRefs(b));
    if (u.pathname === '/api/config') return res(Demo.saveConfig(b));
    if (u.pathname === '/api/offers' && opts.method === 'POST') return res(Demo.saveOffer(b));
    if (u.pathname === '/api/offers/delete') return res(Demo.deleteOffer(b.id));
    if (u.pathname === '/api/campaign-map') return res(Demo.mapCampaign(b.campaign_id, b.offer));
    if (u.pathname === '/api/sync') return res(Demo.sync());
    rej(new Error('rota demo inexistente'));
  } catch (e) { rej(e); } }, 120));
}

async function load(silent) {
  if (S.loading) { S.again = true; return; }
  S.loading = true;
  $('#refresh').disabled = true;
  if (!silent && LIVE && !S.data) $('#main').innerHTML = '<div class="card"><div class="body"><div class="empty">Buscando anúncios na Meta e vendas no n8n… a primeira carga leva uns segundos.</div></div></div>';
  try {
    const p = new URLSearchParams({ offer: S.offer, from: S.from, to: S.to });
    const prevIds = S.data?.all_order_ids ? new Set(S.data.all_order_ids) : null;
    const prevKey = S.dataKey;
    const next = await api('/api/painel?' + p);
    S.force = false;
    S.dataKey = p.toString();
    S.newIds = new Set();
    if (LIVE && next.recent_orders) {
      if (!S.seen) { S.seen = new Set(next.recent_orders.map(o => o.id)); S.alertFrom = Date.now() - 30 * 60e3; }
      else {
        const fresh = next.recent_orders.filter(o => !S.seen.has(o.id));
        fresh.forEach(o => S.seen.add(o.id));
        const real = fresh.filter(o => new Date(o.at).getTime() >= S.alertFrom).reverse();
        S.newIds = new Set(real.map(o => o.id));
        if (real.length) Alerts.sales(real, next);
      }
    }
    S.data = next;
    if (S.offer !== 'all' && !S.data.offers.some(o => o.slug === S.offer)) { S.offer = 'all'; store.set('offer', 'all'); return load(); }
    render();
  } catch (e) { toast(e.message); } finally { S.loading = false; $('#refresh').disabled = false; if (S.again) { S.again = false; load(true); } }
}

/* ---------- UI utilitários ---------- */
let toastT;
function toast(msg) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); } el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3200); }
function confirmDlg({ title, body, okLabel = 'Confirmar', danger = false }) {
  const d = $('#dlg'); $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = body;
  const okBtn = $('#dlgOk'); okBtn.textContent = okLabel; okBtn.classList.toggle('danger', danger);
  d.returnValue = ''; d.showModal();
  const first = $('#dlgBody input'); if (first) setTimeout(() => first.focus(), 30);
  return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok' ? d : null), { once: true }));
}
const chevron = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function card(id, title, sub, body) {
  const min = !!S.minimized[id];
  return `<section class="card${min ? ' is-min' : ''}" data-card="${id}" id="card-${id}"><header><h2>${esc(title)}</h2><span class="sub">${sub || ''}</span><button type="button" class="min" aria-expanded="${!min}" aria-label="${min ? 'Expandir' : 'Minimizar'} ${esc(title)}">${chevron}</button></header><div class="body">${body}</div></section>`;
}
const pill = (cls, txt, dot) => `<span class="pill ${cls}">${dot ? '<i class="dot"></i>' : ''}${esc(txt)}</span>`;
const offerName = (slug) => S.data.offers.find(o => o.slug === slug)?.name ?? slug;

/* ---------- header ---------- */
function renderHeader() {
  const sel = $('#offer'); const offs = S.data.offers.filter(o => !o.hidden);
  sel.innerHTML = `<option value="all">Todas as ofertas</option>` + offs.map(o => `<option value="${esc(o.slug)}">${esc(o.name)}</option>`).join('');
  sel.value = S.offer;
  $$('#presets button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === S.preset)));
  $('#from').value = S.from; $('#to').value = S.to;
  $('#demoFlag').hidden = !S.data.demo;
  const lf = $('#liveFlag'); if (lf) { lf.hidden = !S.data.live_mode; if (S.data.live_mode) lf.querySelector('span').textContent = `Meta e vendas do n8n pelos seus conectores. Vendas atualizam a cada 1 min, anúncios a cada 5 min.${S.data.sales_at ? ' Última leitura de vendas: ' + when(S.data.sales_at) + '.' : ''} Gasto em dólar convertido pela cotação do dia.`; }
  if (S.data.live_mode) { $('#sync').textContent = 'Recarregar Meta'; $('#goConfig').textContent = 'Configurações'; if (!$('#alertBtn')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'alertBtn'; b.addEventListener('click', () => Alerts.on() ? Alerts.disable() : Alerts.enable()); $('#sync').before(b); const t = document.createElement('button'); t.type = 'button'; t.className = 'btn'; t.id = 'alertTest'; t.textContent = 'Testar alerta'; t.addEventListener('click', () => Alerts.test()); $('#sync').before(t); } renderAlertBtn(); }
  const sf = $('#snapFlag'); if (sf) { sf.hidden = !S.data.snapshot; if (S.data.snapshot) sf.querySelector('span').textContent = `Dados reais da Meta (${S.data.snapshot.source}), de ${dm(S.data.snapshot.since)} a ${dm(S.data.snapshot.until)}, puxados em ${when(S.data.snapshot.at)}. Moeda da conta: ${S.data.currency}. É um retrato só de leitura: pra atualizar sozinho a cada 30 min, pausar e mudar orçamento, publique o Worker (README).`; }
  $('#sync').disabled = !!S.data.readonly; $('#goConfig').hidden = !!S.data.readonly;
}

/* ---------- cortes ---------- */
function renderCuts(d) {
  return d.cuts.map(c => `<div class="cut" role="alert"><b>Corte automático</b><span><strong>${esc(c.ad_name)}</strong> foi pausado: gastou ${brl(c.spend)} sem venda paga (limite ${brl(c.threshold)}) · ${esc(offerName(c.offer))} · ${when(c.at)}</span><span class="spacer"></span><button type="button" class="btn sm" data-dismiss-cut="${c.id}">Dispensar</button></div>`).join('');
}

/* ---------- ROAS + KPIs ---------- */
function roasCard(d) {
  const t = d.totals, m = derive(t, d.tax_rate), noSales = d.sales_source === false;
  const scopeOffer = d.scope === 'all' ? null : d.offers.find(o => o.slug === d.scope);
  const max = Math.max(2, ok(m.roas) ? Math.ceil(m.roas * 1.2 * 2) / 2 : 2);
  const at = (v) => Math.min(100, (v / max) * 100);
  let phrase;
  if (noSales) phrase = ok(t.spend) ? `Investido <strong>${brl(m.invest)}</strong> no período. <strong>Receita, vendas e ROAS ficam “–”</strong> até o webhook do checkout estar ligado — o painel não usa compra do pixel.` : 'Sem dados no período.';
  else if (!ok(t.spend)) phrase = `Sem gasto sincronizado ${d.scope === 'all' ? 'nas ofertas' : 'nesta oferta'} no período — não dá pra calcular ROAS. ${t.paid ? `Entraram <strong>${int(t.paid)} vendas</strong> pagas (${brl(m.net)} líquido).` : ''}`;
  else if (t.spend > 0 && t.paid === 0) phrase = `Gastou <strong>${brl(m.invest)}</strong> (com imposto) e <strong>ainda não teve venda paga</strong> no período.`;
  else if (!ok(m.roas)) phrase = `Sem gasto no período. ${int(t.paid)} vendas pagas.`;
  else phrase = `Cada <strong>${F.brl.format(1)}</strong> investido (já com imposto) voltou <strong>${F.brl.format(m.roas)}</strong> líquido. ${m.result >= 0 ? `Sobrou <strong class="pos">${brl(m.result)}</strong>.` : `Faltou <strong class="neg">${brl(-m.result)}</strong> pra empatar.`}`;
  const excluded = d.scope === 'all' ? d.offers.filter(o => !o.hidden && !o.ad_account_id).map(o => o.name) : [];
  const ticks = []; for (let v = 0; v <= max + 1e-9; v += max > 3 ? 1 : .5) if (Math.abs(v - 1) > 1e-9) ticks.push(v);
  const gauge = noSales ? '' : `<div class="gauge" role="img" aria-label="ROAS ${xr(m.roas)}; empate em 1,00">
    <div class="track"></div>${ok(m.roas) ? `<div class="fill" style="width:${at(m.roas)}%;background:${m.roas >= 1 ? 'var(--good)' : 'var(--bad)'}"></div>` : ''}
    ${ticks.map(v => `<span class="tk" style="left:${at(v)}%">${F.d2.format(v).replace(',00', '')}</span>`).join('')}
    <div class="be" style="left:${at(1)}%"><span>empate 1,0</span></div></div>`;

  const cpaT = scopeOffer?.cpa_target_cents, ticketT = scopeOffer?.ticket_target_cents;
  const cpaPill = ok(m.cpa) && ok(cpaT) ? (m.cpa <= cpaT ? pill('good', 'no alvo') : pill('bad', 'acima')) : '';
  const k = (l, v, s, cls = '') => `<div class="kpi"><div class="l">${l}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div>`;
  const kpis = `<div class="kpis">
    ${k('Resultado', signed(m.result), ok(m.result) ? 'receita líquida − investido' : noSales ? 'precisa das vendas do webhook' : 'sem gasto sincronizado', tone(m.result))}
    ${k('Investido', brl(m.invest), ok(m.invest) ? (d.live_mode && ok(t.spend_orig) && t.orig_currency && t.orig_currency !== 'BRL' ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: t.orig_currency }).format(t.spend_orig / 100)} na Meta × câmbio ${F.d2.format(div(t.spend, t.spend_orig) || 0)}${d.tax_rate ? ' + imposto ' + pct(d.tax_rate, 0) : ''}` : `${brl(t.spend)} + imposto ${pct(d.tax_rate, 0)}`) : DASH)}
    ${k('Receita líquida', brl(m.net), noSales ? 'webhook não ligado' : `bruto ${brl(t.gross)} − taxa ${brl(t.fee)}`)}
    ${k(d.live_mode ? 'Vendas (compra principal)' : 'Vendas pagas', int(t.paid), noSales ? 'webhook não ligado' : `pix ${pct(m.pix, 0)} · bump ${pct(m.bump, 0)} · ${int(t.refunds + t.chargebacks)} reemb./chargeback`)}
    ${k('CPA', brl(m.cpa), `alvo ${brl(cpaT)} ${cpaPill}`)}
    ${k('Ticket', brl(m.ticket), ticketT ? `alvo ${brl(ticketT)}` : (ok(m.cpa) && ok(m.ticket) ? (m.cpa <= m.ticket ? pill('good', 'CPA ≤ ticket') : pill('bad', 'CPA > ticket')) : 'líquido por venda'))}
    ${k('CTR (link)', pct(m.ctr, 2), `${int(t.link_clicks)} cliques · ${int(t.impressions)} impr.`)}
    ${k('CPC (link)', brl(m.cpc), 'gasto / clique no link')}
    ${d.live_mode ? k('Compras (como a Meta conta)', int(t.orders), `${int(t.paid)} principais + ${int(t.bumps)} upsells · custo ${brl(div(t.spend, t.orders))}`) : k('Checkouts', int(t.orders), noSales ? 'webhook não ligado' : `${pct(m.ckConv, 0)} viraram venda · ${int(t.pending)} pendentes`)}
  </div>`;
  const noUtm = t.no_utm ? `<p class="note">${int(t.no_utm)} venda(s) paga(s) chegaram sem UTM — contam no total, não em anúncio.</p>` : '';
  const exNote = excluded.length && ok(t.spend) ? `<p class="note">Fora do ROAS e do resultado (sem conta de anúncios): ${esc(excluded.join(', '))}. A receita delas entra em “Receita líquida”.</p>` : '';
  const body = `<div class="hero"><div><div class="roas-l">ROAS líquido</div><div class="roas-n">${ok(m.roas) ? F.d2.format(m.roas) + '<small>×</small>' : DASH}</div>${gauge}<p class="phrase">${phrase}</p>${exNote}${noUtm}</div>${kpis}</div>`;
  return card('roas', 'Resultado', `${dm(d.range.from)} a ${dm(d.range.to)} · ${d.scope === 'all' ? 'todas as ofertas' : esc(offerName(d.scope))}`, body);
}

/* ---------- Todas as ofertas ---------- */
function offersGrid(d) {
  const cards = d.per_offer.map(p => {
    const o = d.offers.find(x => x.slug === p.slug), t = p.totals, m = derive(t, d.tax_rate);
    return `<button type="button" class="oc" data-open-offer="${esc(p.slug)}" aria-label="Abrir ${esc(o.name)}">
      <div class="t"><b>${esc(o.name)}</b>${ok(m.roas) ? (m.roas >= 1 ? pill('good', 'no azul') : pill('bad', 'no vermelho')) : pill('', !ok(t.gross) ? 'sem vendas ligadas' : 'sem gasto')}</div>
      <div class="t"><span class="r ${ok(m.roas) ? (m.roas >= 1 ? 'pos' : 'neg') : ''}">${xr(m.roas)}</span><span class="num ${tone(m.result)}">${signed(m.result)}</span></div>
      ${miniBars(p.days, d.tax_rate)}
      <dl><dt>Investido</dt><dd>${brl(m.invest)}</dd><dt>Receita líquida</dt><dd>${brl(m.net)}</dd><dt>Vendas</dt><dd>${int(t.paid)}</dd><dt>CPA</dt><dd>${brl(m.cpa)}</dd><dt>Ticket</dt><dd>${brl(m.ticket)}</dd><dt>${d.live_mode ? 'Compras (Meta)' : 'Checkouts'}</dt><dd>${int(t.orders)}${!d.live_mode && ok(m.ckConv) ? ' · ' + pct(m.ckConv, 0) : ''}</dd><dt>CPC (link)</dt><dd>${brl(m.cpc)}</dd></dl>
    </button>`;
  }).join('');
  return card('offers', 'Por oferta', 'clique numa oferta pra abrir o detalhe', `<div class="offers">${cards || '<div class="empty">Nenhuma oferta visível.</div>'}</div>`);
}
function miniBars(days, tax) {
  const W = 260, H = 44, n = days.length, gap = n > 20 ? 1 : 2, bw = Math.max(2, (W - gap * (n - 1)) / n);
  const hasSales = days.some(x => ok(x.gross));
  const hasSpend = days.some(x => ok(x.spend));
  const mode = hasSales && hasSpend ? 'result' : hasSales ? 'rev' : 'spend';
  const vals = days.map(x => mode === 'result' ? (x.gross_m - x.fee_m) - (x.spend ?? 0) * (1 + tax) : mode === 'rev' ? x.gross - x.fee : (x.spend ?? 0) * (1 + tax));
  const mx = Math.max(1, ...vals.map(Math.abs)); const zero = mode === 'result' ? H / 2 : H;
  const scale = mode === 'result' ? (H / 2 - 1) / mx : (H - 1) / mx;
  const bars = vals.map((v, i) => { const h = Math.max(v === 0 ? 0 : 1.5, Math.abs(v) * scale); const y = v >= 0 ? zero - h : zero; return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${mode === 'result' ? (v >= 0 ? 'var(--good)' : 'var(--bad)') : mode === 'rev' ? 'var(--rev)' : 'var(--spend)'}"><title>${dm(days[i].day)}: ${mode === 'result' ? signed(v) : brl(v)}</title></rect>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px" role="img" aria-label="${{ result: 'Resultado por dia', rev: 'Receita líquida por dia', spend: 'Investido por dia' }[mode]}"><line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="var(--line-2)"/>${bars}</svg><div class="muted" style="font-size:11px;margin-top:-4px">${{ result: 'resultado por dia', rev: 'receita líquida por dia', spend: 'investido por dia' }[mode]}</div>`;
}

/* ---------- Funil ---------- */
function funnelCard(d) {
  const f = d.funnel, t = d.totals, m = derive(t, d.tax_rate), refs = d.refs;
  const o = d.offers.find(x => x.slug === d.scope);
  const FL = d.funnel_labels || {};
  const steps = d.live_mode
    ? [['Cliques', f.clicks], [FL.visits || 'Visitas', f.visits], [FL.leads || 'Conversa', f.leads], ['Pago', f.paid]]
    : [['Cliques', f.clicks], ['Visitas', f.visits], ['Botão', f.button], ...(f.leads != null ? [['Conversa', f.leads]] : []), ['Checkout', f.checkout], ['Pago', f.paid]];
  const top = steps.find(s => ok(s[1]))?.[1];
  if (ok(f.lpv)) steps.splice(1, 0, ['Página (Meta)', f.lpv]);
  const bars = steps.map(([nm, v], i) => {
    const w = ok(v) && top ? Math.max(1.5, (v / top) * 100) : 100;
    const prev = i ? steps.slice(0, i).reverse().find(s => ok(s[1])) : null;
    const stepTxt = i && ok(v) && prev ? `<div class="fstep">${pct(div(v, prev[1]))} de ${prev[0].toLowerCase()}</div>` : (i ? `<div class="fstep">sem dado</div>` : '');
    const inside = ok(v) && w > 38;
    return `${stepTxt}<div class="fs"><div class="nm">${nm}</div><div class="bar">${ok(v) ? `<i style="width:${w}%"></i>` : '<i class="ghost" style="width:100%"></i>'}<span class="${inside ? 'in' : 'out'}" ${inside ? '' : `style="left:calc(${ok(v) ? w : 0}% + 8px)"`}>${int(v)}${ok(v) && top ? ` · ${pct(v / top, v / top < .1 ? 1 : 0)}` : ''}</span></div></div>`;
  }).join('');
  const ticketT = o?.ticket_target_cents;
  const chk = (label, val, pass, refTxt) => `<li class="${pass == null ? 'na' : pass ? 'ok' : 'no'}"><span class="ic" aria-hidden="true">${pass == null ? '·' : pass ? '✓' : '✕'}</span><span>${label} <b class="num">${val}</b></span><span class="muted num">${refTxt}</span></li>`;
  const cc = div(f.checkout, f.clicks), cp = div(f.paid, f.checkout);
  const checks = `<ul class="checks">
    ${d.live_mode ? `${chk('Clique → página', pct(div(f.visits, f.clicks)), null, 'sem régua')}${chk('Página → WhatsApp', pct(div(f.leads, f.visits)), null, 'entrou em contato')}${chk('WhatsApp → compra', pct(div(f.paid, f.leads)), null, 'conversão do atendimento')}` : `${chk('Clique → checkout', pct(cc), ok(cc) ? cc >= refs.click_checkout : null, '≥ ' + pct(refs.click_checkout, 0))}
    ${chk('Checkout → pago', pct(cp), ok(cp) ? cp >= refs.checkout_paid : null, '≥ ' + pct(refs.checkout_paid, 0))}`}
    ${chk(d.live_mode ? 'Take de upsell' : 'Take de bump', pct(m.bump), ok(m.bump) ? m.bump >= refs.bump : null, '≥ ' + pct(refs.bump, 0))}
    ${chk('Ticket', brl(m.ticket), ok(m.ticket) && ok(ticketT) ? m.ticket >= ticketT : null, ok(ticketT) ? '≥ ' + brl(ticketT) : 'sem alvo')}
    ${chk('CPA', brl(m.cpa), ok(m.cpa) && ok(m.ticket) ? m.cpa <= m.ticket : null, '≤ ticket')}
  </ul>
  <div class="refs"><span>Régua:</span>
    <label for="ref_cc">clique→checkout ≥ <input id="ref_cc" inputmode="decimal" value="${F.d2.format(refs.click_checkout * 100).replace(',00', '')}">%</label>
    <label for="ref_cp">checkout→pago ≥ <input id="ref_cp" inputmode="decimal" value="${F.d2.format(refs.checkout_paid * 100).replace(',00', '')}">%</label>
    <label for="ref_bump">bump ≥ <input id="ref_bump" inputmode="decimal" value="${F.d2.format(refs.bump * 100).replace(',00', '')}">%</label>
    <button type="button" class="btn sm" id="saveRefs">Salvar régua</button><span>ticket alvo fica na oferta</span></div>`;
  const gw = d.gateways === null ? '' : d.sales_source === false ? '<div class="empty">Webhook do checkout não ligado.</div>' : d.gateways.length ? `<div class="tw"><table><thead><tr><th>Gateway</th><th class="n">Iniciados</th><th class="n">Pedidos</th><th class="n">Pagos</th><th class="n">Conversão</th><th class="n">Bruto</th><th class="n">Taxa</th><th class="n">Líquido</th><th class="n">% pix</th></tr></thead><tbody>
    ${d.gateways.map(g => `<tr><td>${esc(g.gateway)}</td><td class="n">${int(g.initiated)}</td><td class="n">${int(g.orders)}</td><td class="n">${int(g.paid)}</td><td class="n">${pct(div(g.paid, g.orders))}</td><td class="n">${brl(g.gross)}</td><td class="n">${brl(g.fee)}</td><td class="n">${brl(g.gross - g.fee)}</td><td class="n">${pct(div(g.paid_pix, g.paid), 0)}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty">Nenhum pedido no período.</div>';
  if (d.live_mode) return card('funnel', 'Funil', 'cliques → página → WhatsApp → pago', `<div class="split"><div><div class="fun" role="img" aria-label="Funil de cliques até venda paga">${bars}</div><p class="note">% ao lado da contagem = fatia do topo; linha acima de cada barra = passo a passo. Cliques = cliques no link (Meta) · Página = leads salvos pela landing (n8n) · WhatsApp = lead que mandou mensagem (fluxo “WhatsApp - Atualizar Lead”) · Pago = compra principal confirmada. Conta pelo dia da visita.</p></div><div>${checks}</div></div>`);
  const body = `<div class="split"><div><div class="fun" role="img" aria-label="Funil de cliques até venda paga">${bars}</div><p class="note">% ao lado da contagem = fatia do topo. Linha acima de cada barra = passo a passo. Cliques = cliques no link (Meta)${ok(f.lpv) ? '; página (Meta) = visualizações da página de destino reportadas pela Meta' : ''}; visitas e botão = beacon${f.leads != null ? '; conversa = lead que chegou no WhatsApp (n8n)' : ''}; checkout = pedidos gerados.</p></div><div>${checks}</div></div><h3 class="sec">Por gateway</h3>${gw}`;
  return card('funnel', 'Funil', 'cliques → visitas → botão → checkout → pago', body);
}

/* ---------- Esteira ---------- */
function esteiraCard(d) {
  if (d.esteira?.products) {
    const e = d.esteira;
    const ups = e.products.filter(p => !p.main).reduce((s, p) => s + p.gross, 0);
    const tot = e.origin.ad.n + e.origin.other.n;
    const body = `<div class="stats">
      <div class="st"><div class="l">Ticket por comprador</div><div class="v">${brl(div(e.gross, e.mains))}</div><div class="s">principal + upsells ÷ compras principais</div></div>
      <div class="st"><div class="l">Take de upsell</div><div class="v">${pct(div(e.upsells, e.mains), 0)}</div><div class="s">${int(e.upsells)} upsells em ${int(e.mains)} compras</div></div>
      <div class="st"><div class="l">Receita de upsell</div><div class="v">${pct(div(ups, e.gross), 0)}</div><div class="s">${brl(ups)}</div></div>
      <div class="st"><div class="l">LTV / recompra</div><div class="v">${DASH}</div><div class="s">precisa de id do cliente nos pedidos</div></div>
    </div>
    <h3 class="sec">Por produto</h3><div class="tw"><table><thead><tr><th>Produto</th><th class="n">Pedidos</th><th class="n">Receita</th><th class="n">% da receita</th></tr></thead><tbody>${e.products.map(p => `<tr><td>${esc(p.produto)} ${p.main ? pill('', 'principal') : ''}</td><td class="n">${int(p.n)}</td><td class="n">${brl(p.gross)}</td><td class="n">${pct(div(p.gross, e.gross), 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem venda no período.</td></tr>'}</tbody></table></div>
    <h3 class="sec">Origem da venda</h3>${tot ? `<div class="stack" role="img" aria-label="Origem das vendas">${e.origin.ad.n ? `<i style="width:${(e.origin.ad.n / tot) * 100}%;background:var(--rev)"></i>` : ''}${e.origin.other.n ? `<i style="width:${(e.origin.other.n / tot) * 100}%;background:var(--neutral-seg)"></i>` : ''}</div>` : ''}
    <div class="legend"><span><i style="background:var(--rev)"></i>Anúncio identificado <b class="num">${int(e.origin.ad.n)}</b> <span class="muted num">${brl(e.origin.ad.net)}</span></span><span><i style="background:var(--neutral-seg)"></i>Sem anúncio (sem lead/UTM) <b class="num">${int(e.origin.other.n)}</b> <span class="muted num">${brl(e.origin.other.net)}</span></span></div>`;
    return card('esteira', 'Esteira', 'principal, upsells e origem', body);
  }
  if (!d.esteira) return card('esteira', 'Esteira', 'o que cada comprador vale', '<div class="empty">Precisa das vendas do webhook do checkout.</div>');
  const e = d.esteira, t = d.totals, m = derive(t, d.tax_rate);
  const tot = e.origin.ad.n + e.origin.thankyou.n + e.origin.other.n;
  const seg = [['Anúncio', e.origin.ad, 'var(--rev)'], ['Página de obrigado', e.origin.thankyou, 'var(--aqua)'], ['Outro / sem sck', e.origin.other, 'var(--neutral-seg)']];
  const stack = tot ? `<div class="stack" role="img" aria-label="Origem das vendas">${seg.filter(s => s[1].n).map(([n, v, c]) => `<i style="width:${(v.n / tot) * 100}%;background:${c}" title="${n}: ${v.n}"></i>`).join('')}</div>` : '<div class="empty">Sem venda paga no período.</div>';
  const body = `<div class="stats">
    <div class="st"><div class="l">Ticket</div><div class="v">${brl(m.ticket)}</div><div class="s">líquido por venda</div></div>
    <div class="st"><div class="l">Take de bump</div><div class="v">${pct(m.bump, 0)}</div><div class="s">${int(e.bumps)} de ${int(e.paid)} vendas</div></div>
    <div class="st"><div class="l">LTV por comprador</div><div class="v">${brl(e.ltv_net_cents)}</div><div class="s">${int(e.buyers)} compradores · líquido, todo o histórico</div></div>
    <div class="st"><div class="l">Recompra</div><div class="v">${pct(div(e.repeat_buyers, e.buyers), 0)}</div><div class="s">${int(e.repeat_buyers)} com 2+ compras pagas</div></div>
  </div><h3 class="sec">Origem da venda (sck)</h3>${stack}
  <div class="legend">${seg.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} <b class="num">${int(v.n)}</b> <span class="muted num">${pct(div(v.n, tot), 0)} · ${brl(v.net)}</span></span>`).join('')}</div>`;
  return card('esteira', 'Esteira', 'o que cada comprador vale', body);
}

/* ---------- Página ---------- */
function pageCard(d) {
  const p = d.page;
  if (!p && d.live_mode) return '';
  if (!p) return card('page', 'Página', 'beacon /api/pulso', `<div class="empty">Sem sessões do beacon nesta oferta no período. Ligue o script na landing (README → “Ligar o beacon”).</div>`);
  const mx = Math.max(1, ...p.sections.map(s => s.reached));
  const bmx = Math.max(1, ...p.buttons.map(b => b.clicks));
  const body = `<div class="stats">
    <div class="st"><div class="l">Sessões</div><div class="v">${int(p.sessions)}</div></div>
    <div class="st"><div class="l">Clicou em botão</div><div class="v">${pct(div(p.clicked, p.sessions))}</div><div class="s">${int(p.clicked)} sessões</div></div>
    <div class="st"><div class="l">Checkouts</div><div class="v">${int(p.orders)}</div></div>
    <div class="st"><div class="l">Pagos</div><div class="v">${int(p.paid)}</div><div class="s">${pct(div(p.paid, p.sessions), 2)} das sessões</div></div>
    <div class="st"><div class="l">Tempo mediano</div><div class="v">${ok(p.median_time_s) ? Math.floor(p.median_time_s / 60) + 'm' + String(p.median_time_s % 60).padStart(2, '0') + 's' : DASH}</div></div>
    <div class="st"><div class="l">Rolagem mediana</div><div class="v">${ok(p.median_scroll_pct) ? p.median_scroll_pct + '%' : DASH}</div></div>
    <div class="st"><div class="l">Modal</div><div class="v">${int(p.modal.shown)}</div><div class="s">${pct(div(p.modal.accepted, p.modal.shown), 0)} aceitou · ${pct(div(p.modal.declined, p.modal.shown), 0)} recusou</div></div>
  </div>
  <div class="split" style="margin-top:6px"><div><h3 class="sec">Por seção</h3><div class="tw"><table><thead><tr><th>Seção</th><th class="n">Chegou</th><th></th><th class="n">Saiu aqui</th></tr></thead><tbody>
    ${p.sections.map(s => `<tr><td>${esc(s.section)}</td><td class="n">${int(s.reached)} <span class="muted">${pct(div(s.reached, p.sessions), 0)}</span></td><td style="width:40%"><span class="minibar" style="width:${(s.reached / mx) * 100}%;margin:0"></span></td><td class="n">${int(s.exited)}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div><h3 class="sec">Cliques por botão@seção</h3><div class="tw"><table><thead><tr><th>Botão@seção</th><th class="n">Cliques</th><th></th></tr></thead><tbody>
    ${p.buttons.map(b => `<tr><td class="num">${esc(b.button)}@${esc(b.section)}</td><td class="n">${int(b.clicks)}</td><td style="width:40%"><span class="minibar" style="width:${(b.clicks / bmx) * 100}%;margin:0"></span></td></tr>`).join('')}
  </tbody></table></div>
  ${p.variants.length ? `<h3 class="sec">Variantes (?lp=)</h3><div class="tw"><table><thead><tr><th>Variante</th><th class="n">Sessões</th><th class="n">% clicou</th><th class="n">Pagos</th><th class="n">Pago / sessão</th></tr></thead><tbody>${p.variants.map(v => `<tr><td>${esc(v.variant.toUpperCase())}</td><td class="n">${int(v.sessions)}</td><td class="n">${pct(div(v.clicked, v.sessions))}</td><td class="n">${int(v.paid)}</td><td class="n">${pct(div(v.paid, v.sessions), 2)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </div></div>`;
  return card('page', 'Página', 'sessões do /go/ + beacon', body);
}

/* ---------- Por dia ---------- */
function dailyCard(d) {
  const has = d.days.some(x => ok(x.spend)), hasRev = d.days.some(x => ok(x.gross));
  const body = `<div class="chart" id="dailyChart"></div><div class="legend">${has ? '<span><i style="background:var(--spend)"></i>Investido (c/ imposto)</span>' : ''}${hasRev ? '<span><i style="background:var(--rev)"></i>Receita líquida</span>' : '<span class="muted">Receita: webhook não ligado</span>'}<span><i class="mk"></i>Mudança (corte, orçamento, status)</span></div>${has ? '' : '<p class="note">Sem gasto sincronizado: só a receita aparece.</p>'}`;
  return card('daily', 'Por dia', 'investido × receita na mesma escala', body);
}
function drawDaily(d) {
  const el = $('#dailyChart'); if (!el) return;
  const w = Math.max(320, el.clientWidth), h = 230, padL = 52, padR = 8, padT = 22, padB = 26;
  const days = d.days, n = days.length, tax = d.tax_rate;
  const inv = days.map(x => ok(x.spend) ? x.spend * (1 + tax) : null), rev = days.map(x => ok(x.gross) ? x.gross - x.fee : null);
  const hasRev = rev.some(ok);
  const hasSpend = inv.some(ok);
  const raw = Math.max(1, ...inv.filter(ok), ...rev.filter(ok));
  const step = niceStep(raw / 4), max = Math.ceil(raw / step) * step;
  const y = (v) => padT + (h - padT - padB) * (1 - v / max);
  const gw = (w - padL - padR) / n, inner = Math.max(2, gw * (n > 20 ? .8 : .7)), bw = hasSpend && hasRev ? Math.max(1, (inner - 2) / 2) : inner;
  let s = '';
  for (let v = 0; v <= max + 1; v += step) s += `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 6}" y="${y(v) + 3.5}" text-anchor="end">${brlC(v)}</text>`;
  const every = Math.ceil(n / Math.floor((w - padL) / 44));
  const marksBy = {}; d.marks.forEach(mk => (marksBy[mk.day] ||= []).push(mk));
  days.forEach((x, i) => {
    const gx = padL + i * gw + (gw - inner) / 2;
    const bar = (v, xx, fill) => { if (!ok(v) || v <= 0) return ''; const top = y(v), hh = y(0) - top; const r = Math.min(3, bw / 2, hh); return `<path d="M${xx},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}Z" fill="${fill}"/>`; };
    if (hasSpend && hasRev) { s += bar(inv[i], gx, 'var(--spend)'); s += bar(rev[i], gx + bw + 2, 'var(--rev)'); }
    else if (hasSpend) s += bar(inv[i], gx, 'var(--spend)');
    else s += bar(rev[i], gx, 'var(--rev)');
    if (marksBy[x.day]) { const cx = padL + i * gw + gw / 2; s += `<path d="M${cx},${padT - 16} l5,5 -5,5 -5,-5z" fill="var(--ink)"/>`; }
    if (i % every === 0) s += `<text class="ax" x="${padL + i * gw + gw / 2}" y="${h - 8}" text-anchor="middle">${dm(x.day)}</text>`;
  });
  s += `<line class="base" x1="${padL}" x2="${w - padR}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += days.map((x, i) => `<rect data-i="${i}" x="${padL + i * gw}" y="0" width="${gw}" height="${h - padB}" fill="transparent"/>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Investido e receita líquida por dia">${s}</svg><div class="tip" hidden></div>`;
  const tip = $('.tip', el), svg = $('svg', el);
  const show = (i, px) => {
    const x = days[i], res = ok(inv[i]) && ok(rev[i]) ? (x.gross_m - x.fee_m) - inv[i] : null;
    tip.innerHTML = `<b>${dm(x.day)}</b>${hasSpend ? `<div class="row"><span><i style="background:var(--spend)"></i>Investido</span><span>${brl(inv[i])}</span></div>` : ''}<div class="row"><span><i style="background:var(--rev)"></i>Receita líq.</span><span>${brl(rev[i])}</span></div>${hasSpend && hasRev ? `<div class="row"><span>Resultado</span><span>${signed(res)}</span></div>` : ''}<div class="row"><span>Vendas</span><span>${int(x.paid)}</span></div>${(marksBy[x.day] || []).map(mk => `<div class="mk">◆ ${esc(mk.text)}</div>`).join('')}`;
    tip.hidden = false;
    const tw = tip.offsetWidth; let left = px + 12; if (left + tw > el.clientWidth) left = px - tw - 12; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
  };
  svg.addEventListener('pointermove', (e) => { const r = e.target.closest('rect[data-i]'); if (!r) return; const box = el.getBoundingClientRect(); show(+r.dataset.i, e.clientX - box.left); });
  svg.addEventListener('pointerleave', () => tip.hidden = true);
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

/* ---------- Ranking de criativos ---------- */
function rankingCard(d) {
  if (d.sales_source === false) return card('ranking', 'Ranking de criativos', 'por receita líquida (utm_content = nome do anúncio)', '<div class="empty">O ranking é por venda paga — aparece quando o webhook do checkout estiver ligado. Enquanto isso, veja gasto e cliques em Desempenho.</div>');
  const rows = d.ads.filter(a => a.paid > 0).map(a => ({ ...a, net: a.gross - a.fee })).sort((a, b) => b.net - a.net);
  const mx = Math.max(1, ...rows.map(r => r.net));
  const noSpend = rows.filter(r => !r.spend);
  const body = rows.length ? `${noSpend.length ? `<div class="cut" style="background:var(--warn-bg);border-color:transparent;margin-bottom:10px"><b style="color:var(--warn)">Atenção</b><span>${noSpend.length === 1 ? 'Um anúncio' : noSpend.length + ' anúncios'} com venda e <strong>sem gasto no período</strong>: ${esc(noSpend.map(r => r.ad_name).join(', '))}. Venda atrasada de clique antigo ou UTM repetida — não use pra decidir escala.</span></div>` : ''}
  <div class="tw"><table><thead><tr><th class="n">#</th><th>Anúncio</th><th class="n">Receita líquida</th><th></th><th class="n">${d.live_mode ? 'Principais' : 'Vendas'}</th>${d.live_mode ? '<th class="n">Compras (Meta)</th>' : ''}<th class="n">Gasto</th><th class="n">ROAS</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr><td class="n muted">${i + 1}</td><td>${esc(r.ad_name)} ${!r.spend ? pill('warn', 'sem gasto') : ''}<div class="muted" style="font-size:11.5px" title="${esc(r.campaign_name)}">${esc(nice(r.campaign_name))}</div></td><td class="n">${brl(r.net)}</td><td style="width:22%"><span class="minibar" style="width:${(r.net / mx) * 100}%;margin:0"></span></td><td class="n">${int(r.paid)}</td>${d.live_mode ? `<td class="n">${int(r.orders)}</td>` : ''}<td class="n">${r.spend ? brl(r.spend) : DASH}</td><td class="n">${xr(div(r.net, r.spend * (1 + d.tax_rate)))}</td></tr>`).join('')}
  </tbody></table></div>${d.totals.no_utm ? `<p class="note">${int(d.totals.no_utm)} venda(s) sem UTM ficaram fora do ranking.</p>` : ''}` : '<div class="empty">Nenhuma venda paga atribuída a anúncio no período.</div>';
  return card('ranking', 'Ranking de criativos', 'por receita líquida (utm_content = nome do anúncio)', body);
}

/* ---------- Desempenho ---------- */
function verdictOf(r, d, o) {
  const v = d.verdict, X = o?.cut_spend_cents;
  if (!(r.spend > 0)) return 'sem gasto';
  const roas = div(r.net, r.spend * (1 + d.tax_rate));
  if (!ok(X)) return r.paid >= v.scale_min_sales && roas >= v.scale_min_roas ? 'escalar' : 'segurar';
  if (r.spend < X) return 'diluído';
  if (r.paid === 0) return 'matar';
  if (ok(roas) && roas < v.kill_roas && r.spend >= X * v.kill_spend_mult) return 'matar';
  if (r.paid >= v.scale_min_sales && ok(roas) && roas >= v.scale_min_roas) return 'escalar';
  return 'segurar';
}
const EFF = { ACTIVE: ['good', 'Ativo'], PAUSED: ['', 'Pausado'], CAMPAIGN_PAUSED: ['', 'Campanha pausada'], ADSET_PAUSED: ['', 'Conjunto pausado'], ARCHIVED: ['', 'Arquivado'], DELETED: ['', 'Excluído'], IN_PROCESS: ['warn', 'Processando'], WITH_ISSUES: ['bad', 'Com problema'], DISAPPROVED: ['bad', 'Reprovado'], PENDING_REVIEW: ['warn', 'Em análise'], PENDING_BILLING_INFO: ['bad', 'Pagamento pendente'] };
const effPill = (e) => e ? pill(EFF[e]?.[0] ?? '', EFF[e]?.[1] ?? e, true) : pill('', DASH);
const VERD = { escalar: 'good', segurar: '', matar: 'bad', 'diluído': 'warn', 'sem vendas': '', 'sem gasto': '' };
function perfRows(d) {
  const lvl = S.perfLevel, key = lvl === 'ad' ? 'ad_id' : lvl === 'adset' ? 'adset_id' : 'campaign_id', name = lvl === 'ad' ? 'ad_name' : lvl === 'adset' ? 'adset_name' : 'campaign_name';
  const g = {};
  for (const a of d.ads) {
    const x = (g[a[key]] ||= { id: a[key], name: a[name], parent: lvl === 'ad' ? a.adset_name : lvl === 'adset' ? a.campaign_name : '', spend: 0, impressions: 0, link_clicks: 0, orders: 0, paid: 0, gross: 0, fee: 0, n: 0 });
    for (const k of ['spend', 'impressions', 'link_clicks', 'orders', 'paid', 'gross', 'fee']) x[k] = a[k] == null ? null : (x[k] ?? 0) + a[k];
    x.n++;
  }
  const o = d.offers.find(x => x.slug === d.scope);
  return Object.values(g).map(r => {
    const L = d.live[r.id] || {};
    const net = ok(r.gross) ? r.gross - r.fee : null;
    const row = { ...r, net, status: L.status ?? null, effective: L.effective ?? L.status ?? null, budgetType: L.budget_type ?? null, lifetime: L.lifetime_cents ?? null, budget: L.budget_cents ?? null, ctr: div(r.link_clicks, r.impressions), cpc: div(r.spend, r.link_clicks), conv: div(r.paid, r.link_clicks), cpa: div(r.spend, r.paid), roas: div(net, r.spend * (1 + d.tax_rate)) };
    row.verdict = d.sales_source === false ? 'sem vendas' : verdictOf(row, d, o);
    return row;
  });
}
function perfCard(d) {
  const accCur = d.live?._currency || CUR;
  const accFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: accCur, maximumFractionDigits: 2 });
  const accBrl = (c) => ok(c) ? accFmt.format(c / 100).replace(/,00(?=\s|$)/, '') : DASH;
  const o = d.offers.find(x => x.slug === d.scope);
  let rows = perfRows(d);
  if (S.perfOnlyActive) rows = rows.filter(r => r.effective === 'ACTIVE');
  if (S.perfOnlyRed && d.sales_source !== false) rows = rows.filter(r => r.spend > 0 && (!ok(r.roas) || r.roas < 1));
  const { k, dir } = S.perfSort;
  rows.sort((a, b) => { const av = a[k], bv = b[k]; if (typeof av === 'string' || typeof bv === 'string') return String(av ?? '').localeCompare(String(bv ?? '')) * dir; return ((ok(av) ? av : -Infinity) - (ok(bv) ? bv : -Infinity)) * dir; });
  const all = !!S.perfAllCols;
  const lvlLabel = { ad: 'anúncio', adset: 'conjunto', campaign: 'campanha' }[S.perfLevel];
  const Lvl = { ad: 'Anúncio', adset: 'Conjunto', campaign: 'Campanha' }[S.perfLevel];
  const cols = [
    ['spend', 'Gasto'], ['net', 'Receita'], ['roas', 'ROAS'], ['cpa', 'CPA'],
    ['orders', d.live_mode ? 'Compras' : 'Checkouts', d.live_mode ? 'principal + upsell, como a Meta conta' : ''], ['paid', d.live_mode ? 'Principais' : 'Vendas'],
    ['ctr', 'CTR'], ['cpc', 'CPC'],
    ...(all ? [['impressions', 'Impressões'], ['link_clicks', 'Cliques'], ['conv', 'Conv.']] : []),
  ];
  const sortAttr = (c) => k === c ? `aria-sort="${dir < 0 ? 'descending' : 'ascending'}"` : '';
  const th = `<th class="sticky sortable" data-sort="name" ${sortAttr('name')} tabindex="0">${Lvl}</th><th class="n sortable" data-sort="budget" ${sortAttr('budget')} tabindex="0">Orçamento</th>`
    + cols.map(([c, l, t]) => `<th class="n sortable" data-sort="${c}" ${sortAttr(c)} tabindex="0" ${t ? `title="${esc(t)}"` : ''}>${l}</th>`).join('')
    + (d.readonly ? '' : '<th class="c">Veiculação</th>');
  const tr = rows.map(r => {
    const bVal = ok(r.budget) ? r.budget : ok(r.lifetime) ? r.lifetime : null;
    const bType = ok(r.budget) ? 'daily' : ok(r.lifetime) ? 'lifetime' : null;
    const budgetCell = bType ? `<div class="bud"><div class="bud-v num">${accBrl(bVal)}<span>${bType === 'daily' ? '/dia' : ' total'}</span></div>${d.readonly ? '' : `<div class="bud-q">
        <button type="button" class="qb" data-ent="${esc(r.id)}" data-act="budget" data-budget="${bVal}" data-btype="${bType}" data-cur="${accCur}" data-label="${esc(r.name)}" data-step="-0.2" aria-label="Diminuir 20%">−20%</button>
        <button type="button" class="qb up" data-ent="${esc(r.id)}" data-act="budget" data-budget="${bVal}" data-btype="${bType}" data-cur="${accCur}" data-label="${esc(r.name)}" data-step="0.2" aria-label="Aumentar 20%">+20%</button>
        <button type="button" class="qb" data-ent="${esc(r.id)}" data-act="budget" data-budget="${bVal}" data-btype="${bType}" data-cur="${accCur}" data-label="${esc(r.name)}" aria-label="Editar orçamento"><svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button></div>`}</div>`
      : `<span class="muted" title="${S.perfLevel === 'ad' ? 'Anúncio não tem orçamento' : 'Orçamento fica no outro nível (campanha ou conjunto)'}">${DASH}</span>`;
    const roasCls = ok(r.roas) ? (r.roas >= 1 ? 'good' : 'bad') : '';
    const cells = cols.map(([c]) => {
      const v = r[c];
      if (c === 'roas') return `<td class="n">${ok(v) ? `<span class="roas ${roasCls}">${xr(v)}</span>` : DASH}</td>`;
      if (['spend', 'net', 'cpa', 'cpc'].includes(c)) return `<td class="n">${brl(v)}</td>`;
      if (['ctr', 'conv'].includes(c)) return `<td class="n">${pct(v, c === 'ctr' ? 2 : 1)}</td>`;
      return `<td class="n">${int(v)}</td>`;
    }).join('');
    const on = r.status === 'ACTIVE';
    const sw = d.readonly || !r.status ? '' : `<td class="c"><button type="button" class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${on ? 'Pausar' : 'Ativar'} ${esc(r.name)}" data-ent="${esc(r.id)}" data-act="${on ? 'pause' : 'activate'}" data-label="${esc(r.name)}"><i></i></button></td>`;
    return `<tr><td class="sticky"><div class="nm" title="${esc(r.name)}">${esc(nice(r.name))}</div><div class="meta">${effPill(r.effective)}${r.verdict && r.verdict !== 'sem vendas' ? pill(VERD[r.verdict], r.verdict) : ''}${r.parent ? `<span class="par" title="${esc(r.parent)}">${esc(nice(r.parent))}</span>` : ''}</div></td><td class="n">${budgetCell}</td>${cells}${sw}</tr>`;
  }).join('');
  const X = o?.cut_spend_cents;
  const chip = (id, on, label) => `<button type="button" class="chip" id="${id}" aria-pressed="${on}">${label}</button>`;
  const body = `<div class="perf-tools">
    <div class="seg" role="group" aria-label="Nível">${[['campaign', 'Campanhas'], ['adset', 'Conjuntos'], ['ad', 'Anúncios']].map(([v, l]) => `<button type="button" data-level="${v}" aria-pressed="${S.perfLevel === v}">${l}</button>`).join('')}</div>
    <div class="chips">${chip('chipActive', S.perfOnlyActive, 'Só ativos')}${chip('chipRed', S.perfOnlyRed, 'No vermelho')}${chip('chipCols', all, 'Mais colunas')}</div>
    <details class="vhelp"><summary>Como o veredito é calculado</summary><p>${ok(X) ? `<b>diluído</b>: gastou menos de ${brl(X)}, pouco pra julgar. ` : 'Defina o <b>limite pra “matar”</b> em Configurações pra ver diluído e matar. '}<b>matar</b>: passou do limite sem venda, ou ROAS abaixo de ${F.d2.format(d.verdict.kill_roas)} com ${d.verdict.kill_spend_mult}× o limite gasto. <b>escalar</b>: ${d.verdict.scale_min_sales}+ vendas e ROAS de ${F.d2.format(d.verdict.scale_min_roas)} ou mais. <b>segurar</b>: o resto.</p></details>
  </div>
  ${rows.length ? `<div class="tw perf-wrap"><table id="perfTable" class="perf"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>` : `<div class="empty">Nenhum ${lvlLabel} com esses filtros.</div>`}
  ${d.live_error ? `<p class="note neg">Não deu pra ler status ao vivo da Meta: ${esc(d.live_error)}</p>` : ''}
  <p class="note">${d.live_mode ? `Status e orçamento ao vivo da Meta, orçamento em ${accCur} (moeda da conta) · gasto e receita em R$ · <b>Compras</b> = principal + upsells (igual a Resultados na Meta) · toda mudança pede confirmação.` : 'Status e orçamento lidos ao vivo da Meta. Toda mudança pede confirmação.'}</p>`;
  return card('perf', 'Desempenho', `${rows.length} ${rows.length === 1 ? lvlLabel : lvlLabel + (lvlLabel.endsWith('o') ? 's' : 's')}`, body);
}

/* ---------- análise por campanha ---------- */
function campMetrics(d, cid) {
  const tax = d.tax_rate || 0, rf = d.recent_from;
  const days = d.camp_days?.[cid] || [];
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const mk = (arr) => { const spend = sum(arr, 'spend'), impr = sum(arr, 'impressions'), clicks = sum(arr, 'link_clicks'), orders = sum(arr, 'orders'), paid = sum(arr, 'paid'), gross = sum(arr, 'gross'); return { spend, impr, clicks, orders, paid, gross, roas: div(gross, spend * (1 + tax)), cpa: div(spend, paid), ctr: div(clicks, impr), cpc: div(spend, clicks), cpm: div(spend * 1000, impr), conv: div(paid, clicks), ticket: div(gross, paid), n: arr.filter(x => x.spend > 0).length }; };
  const ads = d.ads.filter(a => a.campaign_id === cid).map(a => ({ ...a, roas: div(a.gross, a.spend * (1 + tax)), ctr: div(a.link_clicks, a.impressions), trend: d.ad_trend?.[a.ad_id], live: d.live?.[a.ad_id] || {}, adsetLive: d.live?.[a.adset_id] || {} }));
  return { all: mk(days), recent: mk(days.filter(x => x.day >= rf)), prev: mk(days.filter(x => x.day < rf)), days, ads, visits: d.camp_visits?.[cid] ?? null, contacts: d.camp_contacts?.[cid] ?? null, freq: d.camp_freq?.[cid]?.frequency ?? null, live: d.live?.[cid] || {} };
}
function analyzeCampaign(d, cid, name) {
  const m = campMetrics(d, cid), A = m.all, R = m.recent, P = m.prev, V = d.verdict, st = d.settings || {};
  const accCur = d.live?._currency || CUR, rate = div(d.totals.spend, d.totals.spend_orig) || 1;
  const af = (c) => ok(c) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: accCur }).format(c / 100) : DASH;
  const ticket = st.ticket_target_cents || A.ticket || div(d.totals.gross, d.totals.paid);
  const minSpend = st.cut_spend_cents || (ok(ticket) ? ticket * 2 : null);
  const L = m.live, bType = L.budget_type, bVal = bType === 'daily' ? L.budget_cents : L.lifetime_cents;
  const roasDrop = ok(R.roas) && ok(P.roas) && P.paid >= 3 && R.spend > 0 && R.roas < P.roas * 0.7;
  const ctrDrop = ok(R.ctr) && ok(P.ctr) && R.clicks >= 80 && P.clicks >= 80 && R.ctr < P.ctr * 0.75;
  const lowCtr = ok(A.ctr) && A.impr >= 2000 && A.ctr < 0.01;
  const highFreq = ok(m.freq) && m.freq >= 2.5;
  const tired = ctrDrop || lowCtr || highFreq;
  const postClick = ok(A.ctr) && A.ctr >= 0.015 && A.clicks >= 300 && ok(A.conv) && A.conv < 0.01;
  const activeAds = m.ads.filter(a => a.live.effective === 'ACTIVE' || a.live.status === 'ACTIVE');
  const losers = m.ads.filter(a => (a.live.status === 'ACTIVE') && ok(ticket) && a.spend >= ticket * 1.5 && (a.paid || 0) === 0).sort((a, b) => b.spend - a.spend);
  const weak = m.ads.filter(a => a.live.status === 'ACTIVE' && a.impressions >= 1000 && ok(a.ctr) && a.ctr < 0.008 && !losers.includes(a));
  const winners = m.ads.filter(a => (a.paid || 0) >= 2 && ok(a.roas) && a.roas >= (V.scale_min_roas || 1.3)).sort((a, b) => b.gross - a.gross);
  const top = winners[0] || m.ads.filter(a => a.paid > 0).sort((a, b) => b.gross - a.gross)[0];
  const spendShare = top && A.spend ? top.spend / A.spend : null;
  const avgDayOrig = R.n ? Math.round(R.spend / R.n / rate) : null;

  const ev = [
    ['ROAS', xr(A.roas), ok(R.roas) && ok(P.roas) && P.spend > 0 ? `últimos 3 dias ${xr(R.roas)}` : '', ok(A.roas) ? (A.roas >= (V.scale_min_roas || 1.3) ? 'good' : A.roas >= 1 ? 'warn' : 'bad') : ''],
    ['Compras', int(A.paid), A.orders > A.paid ? `+${int(A.orders - A.paid)} upsells` : '', ''],
    ['CPA', brl(A.cpa), ok(ticket) ? `ticket ${brl(ticket)}` : '', ok(A.cpa) && ok(ticket) ? (A.cpa <= ticket ? 'good' : 'bad') : ''],
    ['CTR', pct(A.ctr, 2), ctrDrop ? `caiu p/ ${pct(R.ctr, 2)}` : ok(R.ctr) && P.clicks ? `recente ${pct(R.ctr, 2)}` : '', ctrDrop || lowCtr ? 'bad' : ''],
    ['CPC', brl(A.cpc), ok(A.cpm) ? `CPM ${brl(A.cpm)}` : '', ''],
    ['Frequência', ok(m.freq) ? F.d2.format(m.freq) : DASH, '', highFreq ? 'bad' : ''],
    ['Clique → compra', pct(A.conv, 1), ok(m.visits) && A.clicks ? `página ${pct(div(m.visits, A.clicks), 0)} dos cliques` : '', postClick ? 'bad' : ''],
    ['WhatsApp', int(m.contacts), ok(m.contacts) && m.visits ? `${pct(div(m.contacts, m.visits), 0)} da página · ${pct(div(A.paid, m.contacts), 0)} compram` : '', ok(m.contacts) && m.contacts >= 30 && div(A.paid, m.contacts) < 0.05 ? 'bad' : ''],
    ['Gasto', brl(A.spend), `${A.n} dia(s)`, ''],
  ];

  const acts = [];
  const budgetBtn = (step, label) => bType && ok(bVal) ? `<button type="button" class="btn sm ${step > 0 ? 'good-btn' : ''}" data-ent="${esc(cid)}" data-act="budget" data-budget="${bVal}" data-btype="${bType}" data-cur="${accCur}" data-label="${esc(name)}" data-step="${step}">${label}</button>` : '';
  const pauseBtn = (a) => `<button type="button" class="btn sm danger" data-ent="${esc(a.ad_id)}" data-act="pause" data-label="${esc(a.ad_name)}">Pausar “${esc(a.ad_name)}”</button>`;
  const adList = (arr, f) => arr.slice(0, 4).map(f).join(' ');
  const nextBudget = (p) => ok(bVal) ? af(Math.round(bVal * (1 + p))) : DASH;
  let key, label, toneC, summary;

  if (d.sales_source === false) { key = 'dados'; label = 'Sem vendas ligadas'; toneC = ''; summary = 'Sem as vendas do n8n dá pra ler só criativo (CTR, CPC, frequência).'; }
  else if (A.spend === 0) { key = 'sem-gasto'; label = 'Sem gasto no período'; toneC = ''; summary = 'A campanha está ativa, mas não gastou nos dias escolhidos.'; acts.push(['Confira a veiculação', 'Veja se o conjunto ou os anúncios estão em análise, com problema de pagamento ou com data de início futura.', '']); }
  else if (A.paid < (V.scale_min_sales || 3) && ok(minSpend) && A.spend < minSpend * 0.5) {
    key = 'aguardar'; label = 'Aguardar dados'; toneC = ''; summary = `Gastou ${brl(A.spend)} com ${int(A.paid)} compra(s) — ainda é pouco pra decidir.`;
    acts.push(['Não mexa por 24–48h', `Deixe chegar pelo menos a ${brl(minSpend)} de gasto ou ${V.scale_min_sales} compras antes de escalar ou cortar. Editar agora reinicia o aprendizado.`, '']);
    if (tired) acts.push(['Fique de olho no criativo', lowCtr ? `CTR de ${pct(A.ctr, 2)} está abaixo de 1%: se não subir, troque o criativo.` : `Frequência ${F.d2.format(m.freq)} já alta pro volume de gasto.`, '']);
  }
  else if (A.paid === 0 && ok(minSpend) && A.spend >= minSpend) {
    key = 'pausar'; label = 'Pausar ou refazer'; toneC = 'bad'; summary = `Gastou ${brl(A.spend)} sem nenhuma compra (limite ${brl(minSpend)}).`;
    acts.push(['Pause a campanha', 'Não tem sinal de venda; mais gasto aqui é aposta.', `<button type="button" class="btn sm danger" data-ent="${esc(cid)}" data-act="pause" data-label="${esc(name)}">Pausar campanha</button>`]);
    acts.push(['Recomece com criativos novos', postClick ? `O anúncio até atrai (CTR ${pct(A.ctr, 2)}), então o problema está depois do clique: revise página, oferta e atendimento antes de voltar.` : `CTR de ${pct(A.ctr, 2)}: teste 3–4 criativos com ganchos diferentes numa campanha nova.`, '']);
  }
  else if (ok(A.roas) && A.roas < (V.kill_roas || 0.8)) {
    key = 'reduzir'; label = 'Reduzir e cortar'; toneC = 'bad'; summary = `ROAS ${xr(A.roas)}: cada R$ 1 investido volta ${F.brl.format(A.roas)}. CPA ${brl(A.cpa)} contra ticket ${brl(ticket)}.`;
    acts.push(['Reduza o orçamento 20–30% hoje', `${bType ? `De ${af(bVal)} para ${nextBudget(-0.2)}–${nextBudget(-0.3)}${bType === 'daily' ? '/dia' : ' total'}.` : ''} Se em 48h o ROAS não passar de 1,0, pause.`, budgetBtn(-0.2, 'Reduzir 20%')]);
    if (losers.length) acts.push(['Pause os anúncios que só gastam', losers.map(a => `“${esc(a.ad_name)}” gastou ${brl(a.spend)} sem venda`).join('; ') + '.', adList(losers, pauseBtn)]);
    if (top) acts.push(['Concentre no que ainda vende', `“${esc(top.ad_name)}” trouxe ${int(top.paid)} compra(s) e ${brl(top.gross)}. Deixe ele e corte o resto.`, '']);
  }
  else if (ok(A.roas) && A.roas >= (V.scale_min_roas || 1.3) && A.paid >= (V.scale_min_sales || 3) && !roasDrop) {
    const strong = A.roas >= 2 && !highFreq && !ctrDrop;
    if (tired) {
      key = 'escalar-lado'; label = 'Escalar pra fora'; toneC = 'good';
      summary = `Dá lucro (ROAS ${xr(A.roas)}, CPA ${brl(A.cpa)}), mas ${highFreq ? `a frequência já está em ${F.d2.format(m.freq)}` : `o CTR caiu de ${pct(P.ctr, 2)} para ${pct(R.ctr, 2)}`}: o público está saturando.`;
      acts.push(['Escale na horizontal primeiro', `Duplique o conjunto que mais vende para um público novo (aberto ou semelhante de compradores), com orçamento parecido. Não mexa no original.`, '']);
      acts.push(['Suba criativos novos', top ? `Faça 2–3 variações de “${esc(top.ad_name)}” (mesma promessa, novos 3 primeiros segundos e nova capa).` : 'Suba 2–3 criativos novos no conjunto que mais vende.', '']);
      acts.push(['No orçamento, só +10%', `Enquanto a frequência/CTR não melhorar, aumente pouco: ${bType ? `${af(bVal)} → ${nextBudget(0.1)}` : '+10%'}.`, budgetBtn(0.1, 'Aumentar 10%')]);
    } else {
      const p = strong ? 0.3 : 0.2;
      key = 'escalar'; label = 'Escalar'; toneC = 'good';
      summary = `Dá lucro com volume: ROAS ${xr(A.roas)}${ok(R.roas) && P.spend ? ` (últimos 3 dias ${xr(R.roas)})` : ''}, ${int(A.paid)} compras, CPA ${brl(A.cpa)} abaixo do ticket ${brl(ticket)}.`;
      if (bType === 'daily') acts.push([`Aumente ${Math.round(p * 100)}% no orçamento agora`, `${af(bVal)} → ${nextBudget(p)}/dia. Repita a cada 48–72h enquanto o ROAS ficar acima de ${F.d2.format(V.scale_min_roas)}. Pular mais que isso de uma vez costuma reiniciar o aprendizado.`, budgetBtn(p, `Aumentar ${Math.round(p * 100)}%`)]);
      else if (bType === 'lifetime') acts.push([`Aumente o orçamento total em ${Math.round(p * 100)}%`, `${af(bVal)} → ${nextBudget(p)}. Orçamento total é distribuído até a data de fim; pra escalar com mais controle, duplique a campanha com orçamento diário de ${ok(avgDayOrig) ? af(Math.round(avgDayOrig * (1 + p))) : 'gasto médio +20%'} (gasto médio dos últimos dias ${ok(avgDayOrig) ? af(avgDayOrig) : DASH}/dia +${Math.round(p * 100)}%).`, budgetBtn(p, `Aumentar ${Math.round(p * 100)}%`)]);
      else acts.push(['Aumente o orçamento no nível do conjunto', 'O orçamento dessa campanha fica nos conjuntos: suba 20% nos conjuntos com mais vendas (aba Conjuntos).', '']);
      acts.push(['Abra um público novo', 'Duplique o conjunto vencedor para aberto/semelhante de compradores. Isso escala sem saturar o público atual.', '']);
      if (top) acts.push(['Multiplique o criativo vencedor', `“${esc(top.ad_name)}” responde por ${pct(spendShare, 0)} do gasto e ${int(top.paid)} compras. Crie 2–3 variações dele${spendShare > 0.7 ? ' — hoje a campanha depende quase só dele' : ''}.`, '']);
      if (losers.length) acts.push(['Tire o peso morto', losers.map(a => `“${esc(a.ad_name)}” (${brl(a.spend)} sem venda)`).join(', ') + '.', adList(losers, pauseBtn)]);
    }
  }
  else if (roasDrop || tired) {
    key = 'criativo'; label = 'Trocar criativo'; toneC = 'warn';
    summary = roasDrop ? `O resultado caiu: ROAS foi de ${xr(P.roas)} para ${xr(R.roas)} nos últimos 3 dias.` : ctrDrop ? `CTR caiu de ${pct(P.ctr, 2)} para ${pct(R.ctr, 2)} — sinal de criativo cansado.` : highFreq ? `Frequência ${F.d2.format(m.freq)}: o mesmo público está vendo o anúncio vezes demais.` : `CTR de ${pct(A.ctr, 2)} está abaixo de 1%.`;
    acts.push(['Suba 3–4 criativos novos', top ? `Use “${esc(top.ad_name)}” como base: mesma oferta, ganchos novos nos 3 primeiros segundos, formatos diferentes (vídeo curto, depoimento, texto na tela).` : 'Teste ganchos diferentes nos 3 primeiros segundos e formatos novos.', '']);
    if (weak.length || losers.length) acts.push(['Pause os que puxam pra baixo', [...losers.map(a => `“${esc(a.ad_name)}” gastou ${brl(a.spend)} sem venda`), ...weak.map(a => `“${esc(a.ad_name)}” CTR ${pct(a.ctr, 2)}`)].slice(0, 4).join('; ') + '.', adList([...losers, ...weak], pauseBtn)]);
    acts.push(['Segure o orçamento', 'Não aumente até os criativos novos rodarem 48h e o CTR voltar.', '']);
  }
  else if (postClick) {
    key = 'pos-clique'; label = 'Arrumar página/atendimento'; toneC = 'warn';
    summary = `O anúncio atrai (CTR ${pct(A.ctr, 2)}), mas só ${pct(A.conv, 1)} dos cliques viram compra.`;
    if (ok(m.contacts) && m.visits && m.contacts >= 20) acts.push(div(A.paid, m.contacts) < 0.08 ? ['O gargalo é o atendimento', `${int(m.contacts)} pessoas chamaram no WhatsApp (${pct(div(m.contacts, m.visits), 0)} de quem viu a página) e só ${pct(div(A.paid, m.contacts), 0)} compraram: revise tempo de resposta, script e fechamento.`, ''] : ['O gargalo é a página', `Só ${pct(div(m.contacts, m.visits), 0)} de quem abre a página chama no WhatsApp; quem chama compra bem (${pct(div(A.paid, m.contacts), 0)}). Teste headline, prova e o botão.`, '']);
    if (ok(m.visits) && A.clicks) acts.push([div(m.visits, A.clicks) < 0.6 ? 'Página perde gente no carregamento' : 'Gente chega na página e não compra', div(m.visits, A.clicks) < 0.6 ? `Só ${pct(div(m.visits, A.clicks), 0)} dos cliques viraram visita registrada: confira velocidade da página e se o link está certo.` : `${pct(div(m.visits, A.clicks), 0)} dos cliques chegam na página, mas poucos compram: teste headline, prova social e a chamada pro WhatsApp.`, '']);
    acts.push(['Alinhe promessa do anúncio com a página', 'Se o criativo promete algo que a página não mostra logo no topo, o clique não vira conversa.', '']);
    acts.push(['Revise o atendimento', 'Veja tempo de resposta e script no WhatsApp: é onde a venda fecha.', '']);
  }
  else {
    key = 'otimizar'; label = 'Otimizar antes de escalar'; toneC = 'warn';
    summary = `Perto do empate: ROAS ${xr(A.roas)}, CPA ${brl(A.cpa)} contra ticket ${brl(ticket)}. Ainda não vale colocar mais dinheiro.`;
    acts.push(['Segure o orçamento', 'Mantenha como está por 48h enquanto ajusta os anúncios.', '']);
    if (losers.length) acts.push(['Corte os anúncios sem venda', losers.map(a => `“${esc(a.ad_name)}” (${brl(a.spend)})`).join(', ') + '.', adList(losers, pauseBtn)]);
    if (top) acts.push(['Teste variações do melhor anúncio', `“${esc(top.ad_name)}” tem ${int(top.paid)} compra(s): faça 2 variações dele.`, '']);
    const take = d.esteira ? div(d.esteira.upsells, d.esteira.mains) : null;
    acts.push(['Aumente o valor por venda', ok(take) ? `Take de upsell da conta: ${pct(take, 0)}. Cada ponto a mais de upsell melhora o ROAS sem mexer no anúncio.` : 'Oferta de upsell melhor sobe o ROAS sem mexer no anúncio.', '']);
  }
  if (highFreq && !['escalar-lado', 'criativo'].includes(key)) acts.push(['Frequência alta', `Frequência ${F.d2.format(m.freq)} no período: planeje criativos novos antes de saturar.`, '']);
  return { cid, name, key, label, toneC, summary, ev, acts, m, ticket };
}
function analysisCard(d) {
  if (!d.camp_days) return '';
  const camps = [...new Map(d.ads.map(a => [a.campaign_id, a.campaign_name])).entries()];
  const isActive = (cid) => d.live?.[cid]?.effective === 'ACTIVE' || d.live?.[cid]?.status === 'ACTIVE';
  let list = camps.filter(([cid]) => isActive(cid));
  const showPaused = S.anShowPaused || !list.length;
  if (showPaused) list = camps.filter(([cid]) => isActive(cid) || (d.camp_days[cid] || []).some(x => x.spend > 0));
  const an = list.map(([cid, name]) => analyzeCampaign(d, cid, name)).sort((a, b) => b.m.all.spend - a.m.all.spend);
  S.analyses = Object.fromEntries(an.map(a => [a.cid, a]));
  const nActive = camps.filter(([cid]) => isActive(cid)).length;
  const blocks = an.map(a => {
    const L = d.live?.[a.cid] || {};
    const ai = S.aiText?.[a.cid];
    return `<article class="an ${a.toneC}">
      <header class="an-h"><div class="an-t"><div class="an-name" title="${esc(a.name)}">${esc(nice(a.name))}</div><div class="an-sub">${effPill(L.effective)}<span class="muted">${esc(dm(d.range.from))} a ${esc(dm(d.range.to))}</span></div></div><span class="an-badge ${a.toneC}">${esc(a.label)}</span></header>
      <p class="an-sum">${a.summary}</p>
      <div class="an-ev">${a.ev.map(([l, v, s, t]) => `<div class="evc ${t}"><span>${l}</span><b class="num">${v}</b>${s ? `<em>${s}</em>` : ''}</div>`).join('')}</div>
      ${a.acts.length ? `<ol class="an-acts">${a.acts.map(([t, x, btn]) => `<li><div><b>${t}</b><p>${x}</p></div>${btn ? `<div class="an-btns">${btn}</div>` : ''}</li>`).join('')}</ol>` : ''}
      <div class="an-ai">${Analyst.available() ? `<button type="button" class="btn sm" data-ai="${esc(a.cid)}" ${ai?.busy ? 'disabled' : ''}>${ai?.busy ? 'Analisando…' : ai?.text ? 'Refazer análise detalhada' : 'Análise detalhada com Claude'}</button>${ai?.busy ? `<button type="button" class="btn sm" data-ai-stop="${esc(a.cid)}">Parar</button>` : ''}` : ''}${ai?.text || ai?.error ? `<div class="ai-out">${ai.error ? `<p class="neg">${esc(ai.error)}</p>` : mdLite(ai.text)}</div>` : ''}</div>
    </article>`;
  }).join('');
  const sub = nActive ? `${nActive} campanha(s) ativa(s)` : 'nenhuma campanha ativa agora';
  const body = `<div class="an-tools"><span class="muted">${nActive ? '' : 'Nenhuma campanha ativa: mostrando as que gastaram no período. '}Regras usam o período escolhido e comparam os últimos 3 dias com os anteriores.</span>${nActive ? `<button type="button" class="chip" id="anPaused" aria-pressed="${!!S.anShowPaused}">Incluir pausadas com gasto</button>` : ''}</div>
    ${an.length ? `<div class="an-list">${blocks}</div>` : '<div class="empty">Nenhuma campanha com gasto no período.</div>'}
    <p class="note">Escalar = ROAS ≥ ${F.d2.format(d.verdict.scale_min_roas)} e ${d.verdict.scale_min_sales}+ compras sem queda recente · Reduzir = ROAS &lt; ${F.d2.format(d.verdict.kill_roas)} · Trocar criativo = CTR abaixo de 1%, CTR caindo 25%+ ou frequência ≥ 2,5 · Página/atendimento = CTR ≥ 1,5% e menos de 1% dos cliques comprando. Ticket e limite vêm de Configurações (sem eles, usa o ticket real da campanha).</p>`;
  return card('analysis', 'Análise e ações', sub, body);
}
function mdLite(t) {
  return esc(t).replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^# (.*)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-•] (.*)$/gm, '<li>$1</li>').replace(/^\s*(\d+)\. (.*)$/gm, '<li value="$1">$2</li>')
    .replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}
const Analyst = (() => {
  let sampleFn = null, tried = false;
  const ctl = {};
  if (LIVE && !Live.worker && window.claude?.use) window.claude.use('sample').then(fn => { sampleFn = fn; tried = true; if (S.data && fn) render(); }).catch(() => { tried = true; });
  const copy = { not_granted: 'Você não liberou o Claude pra este painel.', rate_limited: 'Muitas análises seguidas — espere um pouco.', cancelled: '' };
  return {
    available: () => !!sampleFn,
    stop: (cid) => ctl[cid]?.abort(),
    async run(cid) {
      const d = S.data, a = S.analyses?.[cid];
      if (!sampleFn || !a) return;
      const m = a.m, accCur = d.live?._currency || CUR, L = d.live?.[cid] || {};
      const payload = {
        campanha: nice(a.name), periodo: `${d.range.from} a ${d.range.to}`, ultimos_3_dias_desde: d.recent_from, moeda_gasto: 'BRL (convertido pela cotação do dia)', moeda_orcamento: accCur,
        orcamento: { tipo: L.budget_type === 'daily' ? 'diário' : L.budget_type === 'lifetime' ? 'total' : 'no conjunto', valor: L.budget_type === 'daily' ? L.budget_cents / 100 : L.lifetime_cents ? L.lifetime_cents / 100 : null },
        metas: { roas_escalar: d.verdict.scale_min_roas, roas_minimo: d.verdict.kill_roas, ticket_referencia: ok(a.ticket) ? a.ticket / 100 : null, imposto: d.tax_rate },
        total: { gasto: m.all.spend / 100, receita: m.all.gross / 100, roas: m.all.roas, compras_principais: m.all.paid, compras_total_com_upsell: m.all.orders, cpa: ok(m.all.cpa) ? m.all.cpa / 100 : null, ctr: m.all.ctr, cpc: ok(m.all.cpc) ? m.all.cpc / 100 : null, cpm: ok(m.all.cpm) ? m.all.cpm / 100 : null, frequencia: m.freq, visitas_pagina: m.visits, cliques: m.all.clicks, impressoes: m.all.impr },
        ultimos_3_dias: { gasto: m.recent.spend / 100, roas: m.recent.roas, compras: m.recent.paid, ctr: m.recent.ctr }, antes: { gasto: m.prev.spend / 100, roas: m.prev.roas, compras: m.prev.paid, ctr: m.prev.ctr },
        por_dia: m.days.map(x => ({ dia: x.day, gasto: x.spend / 100, receita: x.gross / 100, compras: x.paid, cliques: x.link_clicks, impressoes: x.impressions })),
        anuncios: m.ads.map(x => ({ nome: x.ad_name, conjunto: x.adset_name, status: x.live.effective, gasto: x.spend / 100, receita: ok(x.gross) ? x.gross / 100 : null, compras: x.paid, roas: x.roas, ctr: x.ctr, ctr_ultimos_3_dias: div(x.trend?.recent.link_clicks, x.trend?.recent.impressions), ctr_antes: div(x.trend?.prev.link_clicks, x.trend?.prev.impressions) })),
        leitura_das_regras: { acao: a.label, resumo: a.summary.replace(/<[^>]+>/g, '') },
      };
      const prompt = `Você é gestor de tráfego sênior de ofertas digitais low ticket vendidas pelo WhatsApp (Pix), com anúncios na Meta.\nAnalise a campanha abaixo usando SÓ os números fornecidos (não invente dado; se faltar, diga o que falta).\n\nResponda em português do Brasil, direto, neste formato:\n**Diagnóstico** — 2 ou 3 frases com o que os números mostram.\n**Ações em ordem de prioridade** — 3 a 5 itens numerados; cada um diz o que fazer, quanto (valores ou %) e quando reavaliar.\n**Como escalar (se fizer sentido)** — vertical (orçamento) e/ou horizontal (públicos, duplicação), considerando o tipo de orçamento.\n**Criativos** — quais anúncios manter, pausar e que variações testar.\n**O que não fazer agora** — 1 ou 2 itens.\n\nDados (JSON):\n${JSON.stringify(payload)}`;
      S.aiText ||= {};
      S.aiText[cid] = { busy: true, text: '' };
      render();
      ctl[cid] = new AbortController();
      let last = 0;
      try {
        const r = await sampleFn(prompt, { signal: ctl[cid].signal, modelTier: 'default', onText: ({ text }) => { S.aiText[cid].text = text; if (Date.now() - last > 400) { last = Date.now(); const el = document.querySelector(`[data-ai="${CSS.escape(cid)}"]`)?.closest('.an-ai'); if (el) { let out = el.querySelector('.ai-out'); if (!out) { out = document.createElement('div'); out.className = 'ai-out'; el.append(out); } out.innerHTML = mdLite(text); } } } });
        S.aiText[cid] = { busy: false, text: r.text };
      } catch (e) {
        S.aiText[cid] = { busy: false, text: e.text || '', error: e.code in copy ? copy[e.code] : `Não deu pra analisar agora (${e.code || 'erro'}).` };
        if (!S.aiText[cid].error) delete S.aiText[cid].error;
      }
      render();
    },
  };
})();

/* ---------- Últimas vendas ---------- */
const STATUS = { paid: ['good', 'Pago'], pending: ['warn', 'Pendente'], refunded: ['bad', 'Reembolso'], chargeback: ['bad', 'Chargeback'], abandoned: ['', 'Abandono'] };
function salesCard(d) {
  const body = d.sales_source === false ? '<div class="empty">Webhook do checkout não ligado — nenhuma venda recebida.</div>' : d.sales.length ? `<div class="tw"><table><thead><tr><th>Quando</th><th>Oferta</th><th>Status</th><th>Produto</th><th class="n">Valor</th><th>Método</th><th>Gateway</th><th>Campanha</th><th>Anúncio</th><th>${d.live_mode ? 'Telefone' : 'E-mail'}</th></tr></thead><tbody>
  ${d.sales.map(s => `<tr class="${S.newIds?.has(s.id) ? 'is-new' : ''}"><td class="num">${when(s.at)}</td><td>${esc(offerName(s.offer))}</td><td>${pill(...STATUS[s.status])}</td><td>${esc(s.product)}</td><td class="n">${brl(s.gross)}</td><td>${s.method === 'pix' ? 'Pix' : s.method === 'card' ? 'Cartão' : esc(s.method || DASH)}</td><td>${esc(s.gateway)}</td><td class="wrap" title="${esc(s.campaign || '')}">${s.campaign ? esc(nice(s.campaign)) : pill('warn', 'sem UTM')}</td><td>${esc(s.ad ?? DASH)}</td><td class="num muted">${esc(s.email)}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty">Nenhuma venda no período.</div>';
  return card('sales', 'Últimas vendas', d.live_mode ? `${d.sales.length} mais recentes · atualiza a cada 1 min${d.sales_at ? ' · lido ' + when(d.sales_at) : ''}` : `${d.sales.length} mais recentes · e-mail mascarado`, body);
}

/* ---------- Config de ofertas ---------- */
function configCard(d) {
  const e = S.editing;
  const rows = d.offers.map(o => `<tr class="${o.hidden ? 'is-hidden' : ''}"><td class="wrap"><b style="font-weight:600">${esc(o.name)}</b><div class="muted num" style="font-size:11.5px">${esc(o.slug)}</div></td><td>${esc(o.platform)}</td><td class="num">${esc(o.ad_account_id || DASH)}</td><td class="num">${esc(o.campaign_filter || (o.ad_account_id ? '(resto da conta)' : DASH))}</td><td class="n">${int(o.sales_count)}</td><td>${o.capi_set ? pill('good', 'CAPI ok') : pill('', 'sem CAPI')}</td>
    <td><div class="row-actions"><button type="button" class="btn sm" data-edit="${o.id}">Editar</button><button type="button" class="btn sm" data-hide="${o.id}">${o.hidden ? 'Mostrar' : 'Ocultar'}</button><button type="button" class="btn sm danger" data-del="${o.id}" ${o.sales_count ? `disabled title="Tem pedidos: só dá pra ocultar"` : ''}>Excluir</button></div></td></tr>`).join('');
  let editor = '';
  if (e) {
    const o = e === 'new' ? { platform: 'n8n' } : d.offers.find(x => x.id === e) || {};
    const fld = (id, label, val, hint = '', type = 'text', attrs = '') => `<div class="field"><label for="of_${id}">${label}</label><input class="inp" id="of_${id}" type="${type}" value="${esc(val ?? '')}" ${attrs}>${hint ? `<small>${hint}</small>` : ''}</div>`;
    const money = (v) => ok(v) ? F.d2.format(v / 100) : '';
    const wh = o.slug ? `${d.base_url}/wh/${o.platform}/${o.slug}` : '';
    editor = `<div class="editor"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${e === 'new' ? 'Nova oferta' : 'Editar ' + esc(o.name)}</b><button type="button" class="btn sm" id="ofCancel">Fechar</button></div>
    <div class="form">
      ${fld('name', 'Nome', o.name)}
      ${fld('slug', 'Id (slug)', o.slug, 'vai na URL do webhook e do /go/', 'text', e === 'new' ? 'pattern="[a-z0-9-]+" autocapitalize="off"' : 'readonly')}
      <div class="field"><label for="of_platform">Plataforma do checkout</label><select class="sel inp" id="of_platform">${['n8n', 'ggcheckout', 'kiwify', 'hotmart', 'eduzz', 'perfectpay'].map(p => `<option ${o.platform === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      ${fld('pixel_id', 'Pixel (dataset) id', o.pixel_id)}
      ${fld('ad_account_id', 'Conta de anúncios', o.ad_account_id, 'act_…')}
      ${fld('campaign_filter', 'Filtro de campanha', o.campaign_filter, 'substrings separadas por | · vazio = resto da conta')}
      ${fld('page_url', 'URL da página (A)', o.page_url, '', 'url')}
      ${fld('page_url_b', 'URL variante B (?lp=b)', o.page_url_b, 'opcional', 'url')}
      ${fld('ticket_target', 'Ticket alvo (R$)', money(o.ticket_target_cents), '', 'text', 'inputmode="decimal"')}
      ${fld('cpa_target', 'CPA alvo (R$)', money(o.cpa_target_cents), '', 'text', 'inputmode="decimal"')}
      ${fld('cut_spend', 'Corte: gasto sem venda acima de (R$)', money(o.cut_spend_cents), 'vazio = corte desligado', 'text', 'inputmode="decimal"')}
      ${fld('capi_token', 'Token CAPI (opcional)', '', o.capi_set ? 'já definido — vazio mantém o atual' : 'ou use o secret CAPI_TOKEN_<SLUG> no Worker', 'password', 'autocomplete="off"')}
    </div>
    ${wh ? `<div class="form"><div class="field"><label>Webhook (POST do ${o.platform === 'n8n' ? 'n8n' : 'checkout'})</label><div class="code"><span id="whUrl">${esc(wh)}</span><button type="button" class="btn sm" data-copy="#whUrl">Copiar</button></div></div><div class="field"><label>Token (header Authorization: Bearer …)</label><div class="code"><span id="whTok">${esc(o.webhook_token)}</span><button type="button" class="btn sm" data-copy="#whTok">Copiar</button></div></div><div class="field"><label>Link do anúncio (/go/)</label><div class="code"><span id="goUrl">${esc(d.base_url + '/go/' + o.slug)}?utm_source=meta&amp;utm_medium=paid&amp;…</span><button type="button" class="btn sm" data-copy="#goUrl">Copiar</button></div></div></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end"><button type="button" class="btn pri" id="ofSave">Salvar oferta</button></div></div>`;
  }
  const opts = (sel) => `<option value="">— usar filtro —</option>` + d.offers.map(o => `<option value="${esc(o.slug)}" ${sel === o.slug ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  const camp = d.campaigns.length ? `<div class="tw"><table><thead><tr><th>Campanha</th><th>Conta</th><th>Pelo filtro</th><th>Mapa manual (vale mais)</th></tr></thead><tbody>${d.campaigns.map(c => `<tr><td class="wrap">${esc(c.campaign_name)}<div class="muted num" style="font-size:11.5px">${esc(c.campaign_id)}</div></td><td class="num">${esc(c.account_id)}</td><td>${c.filter_offer ? esc(offerName(c.filter_offer)) : pill('warn', 'nenhuma')}</td><td><select class="sel" data-map="${esc(c.campaign_id)}" data-name="${esc(c.campaign_name)}" aria-label="Oferta da campanha ${esc(c.campaign_name)}">${opts(c.manual_offer)}</select></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma campanha sincronizada ainda.</div>';
  const ls = d.last_sync;
  const general = `<div class="bar-tools" style="border-bottom:1px solid var(--line);padding-bottom:12px">
    <label class="chk" for="cfgTax">Imposto sobre gasto <input class="inp" id="cfgTax" inputmode="decimal" style="width:70px;height:28px;text-align:right" value="${F.d2.format((d.tax_rate || 0) * 100).replace(',00', '')}">%</label>
    <label class="chk" for="cfgFx">Acréscimo no câmbio <input class="inp" id="cfgFx" inputmode="decimal" style="width:70px;height:28px;text-align:right" value="${F.d2.format((d.fx_markup || 0) * 100).replace(',00', '')}">%</label>
    <label class="chk" for="cfgCut"><input type="checkbox" id="cfgCut" ${d.auto_cut ? 'checked' : ''}>corte automático ligado</label>
    <button type="button" class="btn sm" id="cfgSave">Salvar</button>
    <span class="muted" style="font-size:12.5px">${ls ? `Última sync Meta: ${when(ls.at)} · ${int(ls.rows)} linhas${ls.errors?.length ? ' · <span class="neg">' + esc(ls.errors.map(e => e.account + ': ' + e.error).join(' · ')) + '</span>' : ''}` : 'Meta ainda não sincronizada'}</span>
  </div><p class="note" style="margin:0 0 10px">O corte só age em oferta com limite definido <b>e</b> que já recebe pedidos pelo webhook — sem isso, todo anúncio pareceria “sem venda”.</p>`;
  const body = general + `<div class="bar-tools"><button type="button" class="btn pri sm" id="ofNew">Nova oferta</button><span class="muted" style="font-size:12.5px">Editar não apaga campo deixado em branco nos tokens. Excluir só funciona em oferta sem venda.</span></div>
  <div class="tw"><table><thead><tr><th>Oferta</th><th>Checkout</th><th>Conta</th><th>Filtro</th><th class="n">Pedidos</th><th>CAPI</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>${editor}
  <h3 class="sec">Campanha → oferta</h3>${camp}<p class="note">Trocar o mapa manual recarimba todo o histórico de gasto daquela campanha.</p>`;
  return card('config', 'Ofertas', `${d.offers.length} cadastrada(s)`, body);
}

/* ---------- alertas de venda (estilo notificação) ---------- */
const Alerts = (() => {
  let audio = null;
  const on = () => store.get('alerts', false);
  function chime() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      [[1318.5, 0], [1760, 0.09], [2349.3, 0.18]].forEach(([f, dt]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.25, t + dt + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.35);
        o.connect(g).connect(audio.destination); o.start(t + dt); o.stop(t + dt + 0.4);
      });
    } catch {}
  }
  function stack() { let el = $('#saleStack'); if (!el) { el = document.createElement('div'); el.id = 'saleStack'; el.setAttribute('aria-live', 'assertive'); document.body.append(el); } return el; }
  function popup(o, total) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'sale-pop';
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(o.at));
    el.innerHTML = `<span class="sp-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="sp-tx"><b>${o.main ? 'Venda aprovada!' : 'Upsell aprovado!'}</b><span class="sp-v">${brl(o.gross)}</span><span class="sp-d">${esc(o.product || '')}${o.ad ? ' · ' + esc(o.ad) : ''}${o.account ? ' · ' + esc(o.account) : ''}</span><span class="sp-d">${hora}${total ? ' · hoje ' + total : ''}</span></span>`;
    el.addEventListener('click', () => el.remove());
    const st = stack(); st.prepend(el);
    while (st.children.length > 4) st.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
  }
  function system(o) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(o.main ? 'Venda aprovada! 💰' : 'Upsell aprovado! 💰', { body: `Valor: ${brl(o.gross)}\n${o.product || ''}${o.ad ? ' · ' + o.ad : ''}`, tag: 'placar-' + o.id }); } catch {}
  }
  return {
    on,
    async enable() {
      store.set('alerts', true);
      chime();
      let msg = 'Alertas ligados: som e aviso no painel.';
      try {
        if ('Notification' in window) {
          const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
          msg = p === 'granted' ? 'Alertas ligados: notificação do navegador + som.' : p === 'denied' ? 'O navegador bloqueou notificações aqui. Os alertas vêm com som e aviso no painel.' : msg;
        }
      } catch { msg = 'O navegador não libera notificações dentro do Claude. Os alertas vêm com som e aviso no painel.'; }
      toast(msg); renderAlertBtn();
    },
    disable() { store.set('alerts', false); toast('Alertas desligados'); renderAlertBtn(); },
    sales(list, d) {
      const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      const todayCount = (d.recent_orders || []).filter(o => o.main && new Date(new Date(o.at).getTime() - 3 * 3600e3).toISOString().slice(0, 10) === today).length;
      if (on()) chime();
      list.slice(-4).forEach(o => { popup(o, o.main ? `${todayCount} ${todayCount === 1 ? 'venda' : 'vendas'}` : ''); if (on()) system(o); });
      if (list.length > 4) toast(`+${list.length - 4} vendas novas`);
    },
    test() { const o = { id: 'teste-' + Date.now(), at: new Date().toISOString(), gross: 5000, product: 'PRODUTO PRINCIPAL', main: true, ad: 'teste de alerta', account: null }; chime(); popup(o, ''); system(o); },
  };
})();
function renderAlertBtn() {
  const b = $('#alertBtn'); if (!b) return;
  const on = Alerts.on();
  b.setAttribute('aria-pressed', String(on));
  b.innerHTML = `<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.5 13.5h13L15 10.7V7.5a5 5 0 0 0-5-5Zm-2 12.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>${on ? 'Alertas ligados' : 'Ligar alertas'}`;
}

/* ---------- config ao vivo ---------- */
function liveConfigCard(d) {
  const st = d.settings, money = (v) => ok(v) ? F.d2.format(v / 100) : '';
  const accs = st.accounts.map(a => `<tr><td>${esc(a.name)}<div class="muted num" style="font-size:11.5px">act_${esc(a.id)}</div></td><td>${esc(a.currency)}</td><td><button type="button" class="btn sm danger" data-acc-rm="${esc(a.id)}" ${st.accounts.length < 2 ? 'disabled title="Precisa de ao menos uma conta"' : ''}>Remover</button></td></tr>`).join('');
  const body = `<div class="form">
    <div class="field"><label for="lv_tax">Imposto sobre gasto (%)</label><input class="inp" id="lv_tax" inputmode="decimal" value="${F.d2.format((st.tax || 0) * 100).replace(',00', '')}"></div>
    <div class="field"><label for="lv_fx">Acréscimo no câmbio (%)</label><input class="inp" id="lv_fx" inputmode="decimal" value="${F.d2.format((st.fx_markup || 0) * 100).replace(',00', '')}"><small>IOF/spread do cartão, se quiser</small></div>
    <div class="field"><label for="lv_cpa">CPA alvo (R$)</label><input class="inp" id="lv_cpa" inputmode="decimal" value="${money(st.cpa_target_cents)}"></div>
    <div class="field"><label for="lv_ticket">Ticket alvo (R$)</label><input class="inp" id="lv_ticket" inputmode="decimal" value="${money(st.ticket_target_cents)}"></div>
    <div class="field"><label for="lv_cut">Limite pra “matar” (gasto sem venda, R$)</label><input class="inp" id="lv_cut" inputmode="decimal" value="${money(st.cut_spend_cents)}"><small>usado no veredito; a pausa continua manual</small></div>
  </div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="btn pri sm" id="lvSave">Salvar</button></div>
  <h3 class="sec">Contas de anúncio</h3>
  <div class="tw"><table><thead><tr><th>Conta</th><th>Moeda</th><th></th></tr></thead><tbody>${accs}</tbody></table></div>
  <div id="accPicker" style="margin-top:10px"><button type="button" class="btn sm" id="accLoad">Adicionar conta…</button></div>
  <h3 class="sec">Alertas de venda</h3><div class="bar-tools"><button type="button" class="btn sm" id="cfgTestAlert">Testar alerta</button><span class="muted" style="font-size:12.5px">Liga e desliga no botão do sino, no topo.</span></div>
  <p class="note">Configurações ficam salvas neste navegador. Vendas vêm do fluxo “PLACAR - DADOS DO PAINEL” no seu n8n (tabelas orders e leads do Supabase).</p>`;
  return card('config', 'Configurações', 'imposto, câmbio, metas e contas', body);
}

/* ---------- render ---------- */
function render() {
  const d = S.data;
  setCurrency(d.currency);
  renderHeader();
  let html = (d.errors?.length ? d.errors.map(e => `<div class="cut" style="background:var(--warn-bg);border-color:transparent"><b style="color:var(--warn)">${esc(e.section)}</b><span>${esc(e.message)}</span></div>`).join('') : '') + renderCuts(d) + roasCard(d);
  if (d.scope === 'all') html += offersGrid(d);
  else html += (d.live_mode ? analysisCard(d) : '') + funnelCard(d) + esteiraCard(d) + pageCard(d) + dailyCard(d) + rankingCard(d) + perfCard(d);
  html += salesCard(d) + (d.live_mode ? liveConfigCard(d) : d.readonly ? '' : configCard(d));
  $('#main').innerHTML = html;
  drawDaily(d);
}

/* ---------- eventos ---------- */
const parseMoney = (s) => { s = String(s || '').trim(); if (!s) return null; const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
$('#offer').addEventListener('change', (e) => { S.offer = e.target.value; store.set('offer', S.offer); load(); });
$('#presets').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; applyPreset(b.dataset.p); load(); });
['from', 'to'].forEach(id => $('#' + id).addEventListener('change', () => { const f = $('#from').value, t = $('#to').value; if (!f || !t) return; S.from = f <= t ? f : t; S.to = f <= t ? t : f; S.preset = 'custom'; store.set('preset', 'custom'); clampLive(); load(); }));
$('#refresh').addEventListener('click', load);
$('#sync').addEventListener('click', async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Sincronizando…'; try { const days = Math.min(90, Math.max(7, Math.round((new Date(S.to) - new Date(S.from)) / 864e5) + 1 + Math.max(0, Math.round((new Date(todaySP()) - new Date(S.to)) / 864e5)))); const r = await api('/api/sync', { method: 'POST', body: JSON.stringify({ days }) }); if (LIVE) { await load(); return; } toast(r.errors?.length ? 'Meta: ' + r.errors.map(e => e.error).join(' · ') : `Meta sincronizada · ${int(r.rows)} linhas`); await load(); } catch (err) { toast(err.message); } finally { b.disabled = false; b.textContent = LIVE ? 'Recarregar Meta' : 'Sincronizar Meta'; } });
$('#goConfig').addEventListener('click', () => {
  if (LIVE && !$('#card-config')) return; const c = $('#card-config'); if (!c) return; if (c.classList.contains('is-min')) toggleMin(c); c.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
function toggleMin(c) { const id = c.dataset.card, min = !c.classList.contains('is-min'); c.classList.toggle('is-min', min); const b = $('.min', c); b.setAttribute('aria-expanded', String(!min)); S.minimized[id] = min; if (!min) delete S.minimized[id]; store.set('min', S.minimized); if (!min && id === 'daily') drawDaily(S.data); }

$('#main').addEventListener('click', async (e) => {
  const t = e.target.closest('button, th.sortable'); if (!t) return;
  if (t.classList.contains('min')) return toggleMin(t.closest('.card'));
  if (t.dataset.openOffer) { S.offer = t.dataset.openOffer; store.set('offer', S.offer); window.scrollTo({ top: 0 }); return load(); }
  if (t.dataset.dismissCut) { await api('/api/cuts/dismiss', { method: 'POST', body: JSON.stringify({ id: +t.dataset.dismissCut }) }); return load(); }
  if (t.dataset.level) { S.perfLevel = t.dataset.level; store.set('perfLevel', S.perfLevel); return render(); }
  if (t.dataset.sort) { const k = t.dataset.sort; S.perfSort = { k, dir: S.perfSort.k === k ? -S.perfSort.dir : -1 }; store.set('perfSort', S.perfSort); return render(); }
  if (t.dataset.ent) return entityAction(t.dataset);
  if (t.id === 'saveRefs') {
    const g = (id) => Number(String($('#' + id).value).replace(',', '.')) / 100;
    const r = { click_checkout: g('ref_cc'), checkout_paid: g('ref_cp'), bump: g('ref_bump') };
    if (Object.values(r).some(v => !Number.isFinite(v) || v < 0 || v > 1)) return toast('Use porcentagens entre 0 e 100');
    await api('/api/config/refs', { method: 'POST', body: JSON.stringify(r) }); toast('Régua salva'); return load();
  }
  if (t.id === 'ofNew') { S.editing = 'new'; render(); return $('#of_name')?.focus(); }
  if (t.dataset.edit) { S.editing = +t.dataset.edit; render(); return $('#card-config .editor')?.scrollIntoView({ block: 'nearest' }); }
  if (t.id === 'ofCancel') { S.editing = null; return render(); }
  if (t.dataset.copy) { const txt = $(t.dataset.copy).textContent; try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('Não deu pra copiar — selecione o texto'); } return; }
  if (t.dataset.hide) { const o = S.data.offers.find(x => x.id === +t.dataset.hide); await api('/api/offers', { method: 'POST', body: JSON.stringify({ id: o.id, hidden: o.hidden ? 0 : 1 }) }); toast(o.hidden ? 'Oferta visível' : 'Oferta oculta'); return load(); }
  if (t.dataset.del) {
    const o = S.data.offers.find(x => x.id === +t.dataset.del);
    const ok2 = await confirmDlg({ title: 'Excluir ' + o.name + '?', body: '<p>A oferta some do painel e o webhook dela para de aceitar pedidos. Não dá pra desfazer.</p>', okLabel: 'Excluir', danger: true });
    if (!ok2) return; try { await api('/api/offers/delete', { method: 'POST', body: JSON.stringify({ id: o.id }) }); toast('Oferta excluída'); load(); } catch (err) { toast(err.message); } return;
  }
  if (t.id === 'ofSave') return saveOffer();
  if (t.id === 'cfgTestAlert') return Alerts.test();
  if (t.dataset.ai) return Analyst.run(t.dataset.ai);
  if (t.dataset.aiStop) return Analyst.stop(t.dataset.aiStop);
  if (t.id === 'anPaused') { S.anShowPaused = !S.anShowPaused; return render(); }
  if (t.id === 'chipActive') { S.perfOnlyActive = !S.perfOnlyActive; store.set('perfOnlyActive', S.perfOnlyActive); return render(); }
  if (t.id === 'chipRed') { S.perfOnlyRed = !S.perfOnlyRed; store.set('perfOnlyRed', S.perfOnlyRed); return render(); }
  if (t.id === 'chipCols') { S.perfAllCols = !S.perfAllCols; store.set('perfAllCols', S.perfAllCols); return render(); }
  if (t.id === 'lvSave') {
    const pctv = (id) => { const v = Number(String($('#' + id).value || '0').replace(',', '.')) / 100; return v >= 0 && v < 1 ? v : NaN; };
    const tax = pctv('lv_tax'), fxm = pctv('lv_fx');
    if (Number.isNaN(tax) || Number.isNaN(fxm)) return toast('Percentuais entre 0 e 99');
    const m = { cpa_target_cents: parseMoney($('#lv_cpa').value), ticket_target_cents: parseMoney($('#lv_ticket').value), cut_spend_cents: parseMoney($('#lv_cut').value) };
    if (Object.values(m).some(Number.isNaN)) return toast('Valor em reais inválido');
    await api('/api/config', { method: 'POST', body: JSON.stringify({ tax, fx_markup: fxm, ...m }) }); toast('Configurações salvas'); return load();
  }
  if (t.dataset.accRm) { const st = S.data.settings; await api('/api/config', { method: 'POST', body: JSON.stringify({ accounts: st.accounts.filter(a => a.id !== t.dataset.accRm) }) }); if (S.offer === 'conta-' + t.dataset.accRm) { S.offer = 'all'; store.set('offer', 'all'); } toast('Conta removida'); return load(); }
  if (t.id === 'accLoad') {
    t.disabled = true; t.textContent = 'Buscando contas…';
    try {
      const list = await api('/api/accounts'); const have = new Set(S.data.settings.accounts.map(a => a.id));
      const opts = list.filter(a => !have.has(a.id));
      $('#accPicker').innerHTML = opts.length ? `<div class="bar-tools"><select class="sel" id="accSel" aria-label="Conta para adicionar">${opts.map(a => `<option value="${esc(a.id)}" data-name="${esc(a.name)}" data-cur="${esc(a.currency)}">${esc(a.name)} · ${esc(a.currency)}${a.status !== 'ACTIVE' ? ' · ' + esc(a.status) : ''}</option>`).join('')}</select><button type="button" class="btn sm pri" id="accAdd">Adicionar</button></div>` : '<p class="note">Nenhuma outra conta disponível.</p>';
    } catch (err) { toast(err.message); t.disabled = false; t.textContent = 'Adicionar conta…'; }
    return;
  }
  if (t.id === 'accAdd') { const o = $('#accSel').selectedOptions[0]; const st = S.data.settings; await api('/api/config', { method: 'POST', body: JSON.stringify({ accounts: [...st.accounts, { id: o.value, name: o.dataset.name, currency: o.dataset.cur }] }) }); toast('Conta adicionada'); return load(); }
  if (t.id === 'cfgSave') {
    const tax = Number(String($('#cfgTax').value).replace(',', '.')) / 100;
    if (!(tax >= 0 && tax < 1)) return toast('Imposto entre 0 e 99%');
    const fxm = Number(String($('#cfgFx')?.value ?? '0').replace(',', '.')) / 100;
    if (!(fxm >= 0 && fxm < 1)) return toast('Acréscimo no câmbio entre 0 e 99%');
    const cut = $('#cfgCut').checked;
    if (cut && !S.data.auto_cut) { const c = await confirmDlg({ title: 'Ligar corte automático?', body: '<p>A cada 30 min, anúncio ativo que passar do limite da oferta sem venda paga será <b>pausado sozinho</b>. Orçamento nunca muda sem você.</p>', okLabel: 'Ligar corte' }); if (!c) return; }
    await api('/api/config', { method: 'POST', body: JSON.stringify({ tax_rate: tax, fx_markup: fxm, auto_cut: cut }) }); toast('Configuração salva'); return load();
  }
});
$('#main').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th.sortable')) { e.preventDefault(); e.target.click(); } });
$('#main').addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'onlyActive') { S.perfOnlyActive = t.checked; store.set('perfOnlyActive', t.checked); return render(); }
  if (t.id === 'onlyRed') { S.perfOnlyRed = t.checked; store.set('perfOnlyRed', t.checked); return render(); }
  if (t.dataset.map) {
    const target = t.value ? offerName(t.value) : 'o filtro';
    const c = await confirmDlg({ title: 'Recarimbar campanha?', body: `<p><b>${esc(t.dataset.name)}</b> passa a contar para <b>${esc(target)}</b>, inclusive todo o gasto histórico dela.</p>`, okLabel: 'Recarimbar' });
    if (!c) { return render(); }
    await api('/api/campaign-map', { method: 'POST', body: JSON.stringify({ campaign_id: t.dataset.map, offer: t.value || null }) }); toast('Campanha recarimbada'); load();
  }
});
async function entityAction(ds) {
  const { ent, act, label } = ds;
  if (act === 'budget') {
    const cur = +ds.budget, btype = ds.btype || 'daily', accCur = ds.cur || CUR;
    const af = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: accCur }), ab = (c) => af.format(c / 100);
    const start = ds.step ? Math.max(100, Math.round(cur * (1 + Number(ds.step)))) : cur;
    const kind = btype === 'daily' ? 'diário' : 'total (vitalício)';
    const dlg = confirmDlg({ title: 'Mudar orçamento', okLabel: 'Aplicar na Meta', body: `
      <p class="dlg-name">${esc(nice(label))}</p>
      <div class="bud-now"><span>Hoje</span><b class="num">${ab(cur)}</b><em>${btype === 'daily' ? 'por dia' : 'total'}</em></div>
      <div class="bud-steps" role="group" aria-label="Ajuste rápido">${[-30, -20, -10, 10, 20, 30].map(p => `<button type="button" class="qb ${p > 0 ? 'up' : ''}" data-pct="${p}">${p > 0 ? '+' : '−'}${Math.abs(p)}%</button>`).join('')}</div>
      <div class="field"><label for="newBudget">Novo orçamento ${kind} (${accCur})</label><input class="inp num" id="newBudget" inputmode="decimal" value="${F.d2.format(start / 100)}" autocomplete="off"></div>
      <p class="bud-prev" id="budPrev"></p>
      <p class="note">${btype === 'lifetime' ? 'Orçamento total precisa ficar acima do que a campanha já gastou desde o início. ' : ''}A mudança vai direto pra Meta e fica marcada no gráfico por dia.${LIVE && !Live.worker ? ' Pela conexão do Claude a Meta pausa o item ao editar; se ele estava ativo, o painel reativa logo em seguida.' : ''}</p>` });
    const input = $('#newBudget'), prev = $('#budPrev');
    const upd = () => { const v = parseMoney(input.value); if (!ok(v) || v <= 0) { prev.textContent = 'Digite um valor, ex.: 150,00'; prev.className = 'bud-prev neg'; return; } const ch = (v - cur) / cur; prev.innerHTML = `${ab(cur)} → <b>${ab(v)}</b> <span class="${ch >= 0 ? 'pos' : 'neg'}">${ch >= 0 ? '+' : '−'}${pct(Math.abs(ch), 0)}</span>${Math.abs(ch) > .3 ? ' · acima de 30% costuma reiniciar o aprendizado' : ''}`; prev.className = 'bud-prev'; };
    input.addEventListener('input', upd);
    $$('#dlgBody [data-pct]').forEach(b => b.addEventListener('click', () => { input.value = F.d2.format(Math.max(1, Math.round(cur * (1 + b.dataset.pct / 100))) / 100); upd(); input.focus(); }));
    upd(); setTimeout(() => { input.focus(); input.select(); }, 40);
    if (!(await dlg)) return;
    const v = parseMoney(input.value);
    if (!ok(v) || v <= 0) return toast('Digite um valor, ex.: 150,00');
    if (v === cur) return toast('Orçamento igual ao atual');
    if (Math.abs(v - cur) / cur > .3) { const c2 = await confirmDlg({ title: 'Mudança acima de 30%', body: `<p>${ab(cur)} → <b>${ab(v)}</b>. Saltos grandes costumam reiniciar o aprendizado. Confirmar mesmo assim?</p>`, okLabel: 'Sim, aplicar' }); if (!c2) return; }
    toast('Enviando pra Meta…');
    try { const r = await api('/api/meta/entity', { method: 'POST', body: JSON.stringify({ id: ent, action: 'budget', budget_cents: v, budget_type: btype, label }) }); toast(r?.text || 'Orçamento atualizado'); S.force = true; load(); } catch (err) { toast(err.message); }
    return;
  }
  const verb = act === 'pause' ? 'Pausar' : 'Ativar';
  const c = await confirmDlg({ title: `${verb}?`, body: `<p class="dlg-name">${esc(label)}</p><p>${act === 'pause' ? 'Para de gastar agora.' : 'Volta a gastar no orçamento atual.'} A mudança vai direto pra Meta.</p>`, okLabel: verb, danger: act === 'pause' });
  if (!c) return;
  toast('Enviando pra Meta…');
  try { await api('/api/meta/entity', { method: 'POST', body: JSON.stringify({ id: ent, action: act, label }) }); toast(act === 'pause' ? 'Pausado' : 'Ativado'); S.force = true; load(); } catch (err) { toast(err.message); }
}
async function saveOffer() {
  const v = (id) => $('#of_' + id)?.value.trim();
  const isNew = S.editing === 'new';
  const patch = { id: isNew ? undefined : S.editing, name: v('name'), platform: v('platform'), pixel_id: v('pixel_id'), ad_account_id: v('ad_account_id'), campaign_filter: v('campaign_filter'), page_url: v('page_url'), page_url_b: v('page_url_b') };
  if (isNew) patch.slug = v('slug');
  for (const [k, id] of [['ticket_target_cents', 'ticket_target'], ['cpa_target_cents', 'cpa_target'], ['cut_spend_cents', 'cut_spend']]) { const m = parseMoney(v(id)); if (Number.isNaN(m)) return toast('Valor inválido em ' + id.replace('_', ' ')); patch[k] = m; }
  const tok = v('capi_token'); if (tok) patch.capi_token = tok; // vazio = não mexe
  if (!patch.name) return toast('Dê um nome à oferta');
  if (isNew && !/^[a-z0-9-]{2,40}$/.test(patch.slug || '')) return toast('Id: só letras minúsculas, números e hífen');
  if (patch.ad_account_id && !/^act_\d+$/.test(patch.ad_account_id)) return toast('Conta de anúncios no formato act_123…');
  try { await api('/api/offers', { method: 'POST', body: JSON.stringify(patch) }); toast('Oferta salva'); if (isNew) S.editing = null; load(); } catch (err) { toast(err.message); }
}
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => S.data && drawDaily(S.data), 120); });

/* ---------- boot ---------- */
if (S.preset === 'custom') S.preset = '7';
if (LIVE && !['today', 'yesterday', '7', '14', '30'].includes(S.preset)) S.preset = '7';
applyPreset(S.preset);
if (SNAP && !store.get('snapRange', false)) { S.from = Snapshot.range.since; S.to = Snapshot.range.until; S.preset = 'custom'; store.set('snapRange', true); }
load();
if (LIVE) {
  // com alertas ligados continua checando mesmo com a aba em segundo plano
  setInterval(() => { if (document.visibilityState === 'visible' || Alerts.on()) load(true); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.data && Date.now() - new Date(S.data.generated_at).getTime() > 60e3) load(true); });
}
})();
