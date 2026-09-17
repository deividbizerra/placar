// Graph API falsa pra teste local (não fala com a Meta de verdade)
import http from 'node:http';
const state = {
  '111': { status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '15000' },          // campanha CBO
  '211': { status: 'ACTIVE', effective_status: 'ACTIVE' }, '212': { status: 'ACTIVE', effective_status: 'ACTIVE' },
  '311': { status: 'ACTIVE', effective_status: 'ACTIVE' }, '312': { status: 'ACTIVE', effective_status: 'ACTIVE' }, '313': { status: 'ACTIVE', effective_status: 'ACTIVE' },
  '133': { status: 'ACTIVE', effective_status: 'ACTIVE', lifetime_budget: '80000' }, '231': { status: 'ACTIVE', effective_status: 'ACTIVE' }, '331': { status: 'ACTIVE', effective_status: 'ACTIVE' },
  '122': { status: 'ACTIVE', effective_status: 'ACTIVE' }, '222': { status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '5000' }, '321': { status: 'ACTIVE', effective_status: 'ACTIVE' },
};
const ads = [
  { ad_id: '311', ad_name: 'AD01 Depoimento', adset_id: '211', adset_name: 'Aberto', campaign_id: '111', campaign_name: '[ORACOES] CBO Frio' },
  { ad_id: '312', ad_name: 'AD02 Oração 7 dias', adset_id: '211', adset_name: 'Aberto', campaign_id: '111', campaign_name: '[ORACOES] CBO Frio' },
  { ad_id: '313', ad_name: 'AD05 Carta aberta', adset_id: '212', adset_name: 'Interesse', campaign_id: '111', campaign_name: '[ORACOES] CBO Frio' },
  { ad_id: '321', ad_name: 'T01 Tiragem ao vivo', adset_id: '222', adset_name: 'Remarketing', campaign_id: '122', campaign_name: '[TIRAGEM] Premium' },
];
const log = [];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let body = '';
  req.on('data', c => body += c); req.on('end', () => {
    const send = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/ptax') { // Banco Central falso: só dias úteis; abertura 5,00 e fechamento 5 + dia/100
      const md = (q) => { const [m, d, y] = q.replace(/'/g, '').split('-'); return `${y}-${m}-${d}`; };
      const out = []; for (let d = md(u.searchParams.get('@dataInicial')); d <= md(u.searchParams.get('@dataFinalCotacao')); d = new Date(new Date(d + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10)) {
        const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue;
        out.push({ cotacaoCompra: 4.9, cotacaoVenda: 5.0, dataHoraCotacao: d + ' 10:04:11.000', tipoBoletim: 'Abertura' });
        out.push({ cotacaoCompra: 4.9, cotacaoVenda: 5 + (+d.slice(8, 10)) / 100, dataHoraCotacao: d + ' 13:05:22.000', tipoBoletim: 'Fechamento PTAX' });
      }
      return send({ value: out });
    }
    if (u.pathname === '/n8n') { // fluxo "PLACAR - DADOS DO PAINEL" falso
      const now = new Date(); const iso = (h) => new Date(now.getTime() - h * 3600e3).toISOString();
      const day = new Date(now.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
      return send({ ok: true, gerado_em: now.toISOString(), since: JSON.parse(body || '{}').since, total_pedidos: 3,
        orders: [
          { id: 'v1', at: iso(1), valor: 47, qtd: 1, produto: 'Guia de Orações', metodo: 'pix', meta_enviado: true, atribuido_por: 'lead', utm_campaign: '[ORACOES] CBO Frio', utm_medium: 'Aberto', utm_content: 'AD01 Depoimento', utm_term: '311', tel_fim: '1234' },
          { id: 'v2', at: iso(2), valor: 27, qtd: 1, produto: 'Upsell Terço', metodo: 'pix', meta_enviado: true, atribuido_por: 'telefone', utm_campaign: '[ORACOES] CBO Frio', utm_medium: 'Aberto', utm_content: 'AD01 Depoimento', utm_term: '311', tel_fim: '1234' },
          { id: 'v3', at: iso(3), valor: 97, qtd: 1, produto: 'Tiragem Premium', metodo: 'pix', meta_enviado: false, atribuido_por: null, tel_fim: '9876' },
        ],
        leads: [{ dia: day, utm_campaign: '[ORACOES] CBO Frio', utm_medium: 'Aberto', utm_content: 'AD01 Depoimento', utm_term: '311', visitas: 40, whatsapp: 12 }],
        fx_usd: Object.fromEntries(Array.from({ length: 45 }, (_, i) => [new Date(now.getTime() - i * 864e5).toISOString().slice(0, 10), 5.2])) });
    }
    if (req.headers.authorization !== 'Bearer token-teste') return send({ error: { message: 'Invalid OAuth access token', code: 190 } }, 400);
    const path = u.pathname.replace(/^\/v\d+\.\d+/, '');
    log.push(req.method + ' ' + path + (body ? ' ' + body : ''));
    if (path === '/__log') return send(log);
    let m;
    if (path === '/' && u.searchParams.get('ids')) { const o = {}; for (const id of u.searchParams.get('ids').split(',')) if (state[id]) o[id] = { id, name: (ads.find(a => a.ad_id === id) || {}).ad_name || 'Entidade ' + id, ...state[id] }; return send(o); }
    if (path === '/me/adaccounts') return send({ data: [{ account_id: '1000000001', name: 'Conta teste', currency: 'USD', account_status: 1 }] });
    if ((m = path.match(/^\/(act_\d+)$/))) return send({ id: m[1], currency: 'USD', timezone_name: 'America/Sao_Paulo', name: 'Conta teste' });
    if ((m = path.match(/^\/(act_\d+)\/insights$/))) {
      const tr = JSON.parse(u.searchParams.get('time_range'));
      if (u.searchParams.get('level') === 'campaign') { const f = JSON.parse(u.searchParams.get('filtering') || '[]'); const want = f[0]?.value || ['111', '122']; return send({ data: want.map(id => ({ campaign_id: id, frequency: '1.8', reach: '9000' })) }); }
      const out = []; for (let d = tr.since; d <= tr.until; d = new Date(new Date(d + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10))
        for (const a of ads) out.push({ ...a, date_start: d, spend: a.ad_id === '313' ? '20.00' : '50.55', impressions: '4000', clicks: '90', inline_link_clicks: '60' });
      // paginação: 5 por página
      const after = +(u.searchParams.get('after') || 0), page = out.slice(after, after + 5);
      return send({ data: page, paging: after + 5 < out.length ? { cursors: { after: String(after + 5) }, next: 'x' } : { cursors: {} } });
    }
    if (/^\/act_\d+\/ads$/.test(path) && u.searchParams.get('effective_status')) return send({ data: [...ads.filter(a => state[a.ad_id].effective_status === 'ACTIVE').map(a => ({ id: a.ad_id, name: a.ad_name, status: 'ACTIVE', effective_status: 'ACTIVE', adset_id: a.adset_id, campaign_id: a.campaign_id, adset: { name: a.adset_name }, campaign: { name: a.campaign_name } })),
      { id: '331', name: 'CTV NOVO', status: 'ACTIVE', effective_status: 'ACTIVE', adset_id: '231', campaign_id: '133', adset: { name: 'CJ 01' }, campaign: { name: '[MABEL] - [AQUECIMENTO]- [HORARIOS]' } }] });
    if ((m = path.match(/^\/act_\d+\/(campaigns|adsets|ads)$/))) {
      const ids = { campaigns: ['111', '122'], adsets: ['211', '212', '222'], ads: ['311', '312', '313', '321'] }[m[1]];
      return send({ data: ids.map(id => ({ id, ...state[id] })) });
    }
    if ((m = path.match(/^\/(\d+)$/))) {
      if (req.method === 'GET') return send({ id: m[1], ...state[m[1]] });
      const p = new URLSearchParams(body);
      if (p.get('status')) { state[m[1]].status = state[m[1]].effective_status = p.get('status'); }
      if (p.get('daily_budget')) state[m[1]].daily_budget = p.get('daily_budget');
      if (p.get('lifetime_budget')) state[m[1]].lifetime_budget = p.get('lifetime_budget');
      return send({ success: true });
    }
    send({ error: { message: 'rota mock inexistente ' + path } }, 404);
  });
}).listen(8799, () => console.log('mock meta :8799'));
