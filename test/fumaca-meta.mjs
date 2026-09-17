// Teste de fumaça local: node test/fumaca-meta.mjs  (com mock-meta e wrangler dev rodando, banco local zerado)
const B = process.env.BASE || 'http://127.0.0.1:8787', K = process.env.KEY || 'chave-de-teste-local-123456';
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) fails++; };
const call = async (path, body, key = K, headers = {}) => {
  const r = await fetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-placar-key': key, ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const back = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// mesma regra do mock: fechamento = 5 + dia/100; fim de semana usa o último dia útil
const rate = (day) => { let d = new Date(day + 'T12:00:00Z'); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1); return 5 + d.getUTCDate() / 100; };
const brlOf = (usdCents, day) => Math.round(usdCents * rate(day));
const sumDays = (from, to, perDay) => { let s = 0; for (let i = 0; ; i++) { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); const ds = d.toISOString().slice(0, 10); if (ds > to) break; s += perDay(ds); } return s; };

ok((await call('/api/painel', null, 'errada')).status === 401, 'API recusa chave errada');
ok((await fetch(B + '/?key=errada')).status === 401, 'painel recusa chave errada');
const page = await fetch(B + '/?key=' + K); const html = await page.text();
ok(page.status === 200 && html.startsWith('<!doctype html>') && html.includes('<title>Placar</title>'), 'painel HTML servido com chave');

let r = await call('/api/offers', { slug: 'guia-oracoes', name: 'Guia de Orações', platform: 'n8n', ad_account_id: 'act_1000000001', campaign_filter: 'ORACOES', cut_spend_cents: 5000 });
ok(r.status === 200 && r.j.id, 'cria oferta n8n com filtro');
const guiaId = r.j.id;
r = await call('/api/offers', { slug: 'tiragem', name: 'Tiragem', ad_account_id: 'act_1000000001' });
ok(r.status === 200, 'cria oferta sem filtro (resto da conta)');
ok((await call('/api/offers', { slug: 'guia-oracoes', name: 'x' })).status === 400, 'recusa slug duplicado');
ok((await call('/api/offers', { slug: 'x1', name: 'x', ad_account_id: '123' })).status === 400, 'recusa conta fora do formato act_');

r = await call('/api/sync', { days: 10 });
ok(r.status === 200 && r.j.rows === 40 && !r.j.errors.length && r.j.accounts[0].currency === 'USD', `sync 10 dias com paginação e moeda da conta: ${r.j?.rows} linhas ${JSON.stringify(r.j?.errors)}`);

const from7 = back(6);
r = await call(`/api/painel?offer=all&from=${from7}&to=${today}`);
const all = r.j;
const pg = all.per_offer.find(p => p.slug === 'guia-oracoes'), pt = all.per_offer.find(p => p.slug === 'tiragem');
const expG = sumDays(from7, today, d => 2 * brlOf(5055, d) + brlOf(2000, d)), expT = sumDays(from7, today, d => brlOf(5055, d));
ok(pg.totals.spend === expG, `gasto em US$ convertido pela cotação do dia (fim de semana = sexta): ${pg.totals.spend} = ${expG}`);
ok(pt.totals.spend === expT, `resto da conta vai pra oferta sem filtro: ${pt.totals.spend}`);
ok(all.totals.paid === 0 && all.sales.length === 0, 'sem venda ainda: zero, nada inventado');

// edição não apaga campo omitido
await call('/api/offers', { id: guiaId, name: 'Guia de Orações v2' });
r = await call('/api/offers');
const g2 = r.j.find(o => o.id === guiaId);
ok(g2.name === 'Guia de Orações v2' && g2.campaign_filter === 'ORACOES' && g2.cut_spend_cents === 5000 && g2.platform === 'n8n', 'editar só o nome mantém o resto');
const TOK = g2.webhook_token;
ok(!('capi_token' in g2), 'token CAPI nunca sai na API');

// mapa manual recarimba histórico
await call('/api/campaign-map', { campaign_id: '122', offer: 'guia-oracoes' });
r = await call(`/api/painel?offer=all&from=${back(9)}&to=${today}`);
ok(r.j.per_offer.find(p => p.slug === 'tiragem').totals.spend === 0, 'mapa manual recarimba todo o histórico');
await call('/api/campaign-map', { campaign_id: '122', offer: null });

/* ---------- vendas do n8n ---------- */
const wh = (body, tok = TOK, slug = 'guia-oracoes') => call(`/wh/n8n/${slug}`, body, '', { authorization: 'Bearer ' + tok });
ok((await wh({ event: 'paid', order_id: 'X', amount: 10 }, 'errado')).status === 401, 'webhook recusa token errado');
ok((await wh({ event: 'paid', order_id: 'X', amount: 10 }, TOK, 'nao-existe')).status === 401, 'webhook não revela oferta inexistente');
ok((await wh({ event: 'paid', amount: 10 })).status === 400, 'webhook exige order_id');
r = await wh({ event: 'lead', lead_id: 'L1', utm_source: 'meta', utm_medium: 'paid', utm_campaign: '[ORACOES] CBO Frio', utm_content: 'AD01 Depoimento', fbc: 'fb.1.x' });
ok(r.status === 200 && r.j.duplicate === false, 'lead do WhatsApp registrado');
ok((await wh({ event: 'lead', lead_id: 'L1' })).j.duplicate === true, 'lead repetido não duplica');
r = await wh({ event: 'paid', order_id: 'W100', lead_id: 'L1', amount: 'R$ 19,90', method: 'pix', product: 'Guia de Orações', customer: { name: 'Maria Teste', email: 'Maria.Teste@Gmail.com', phone: '5585999990000' } });
ok(r.status === 200 && r.j.status === 'paid', 'venda paga pelo n8n (valor em texto “R$ 19,90”)');
ok((await wh({ event: 'paid', order_id: 'W100', lead_id: 'L1', amount: 19.9 })).j.duplicate === true, 'mesmo pedido de novo = dedupe');
r = await wh({ event: 'paid', order_id: 'W101', ad_id: '312', amount_cents: 2980, bump_amount: 9.9, method: 'pix' });
ok(r.status === 200, 'venda com ad_id (sem utm) aceita');
await wh({ event: 'paid', order_id: 'W102', amount: 19.9, method: 'card' }); // sem UTM
await wh({ event: 'pending', order_id: 'W103', amount: 19.9, utm_content: 'AD01 Depoimento' });

r = await call(`/api/painel?offer=guia-oracoes&from=${from7}&to=${today}`);
let d = r.j;
ok(d.totals.paid === 3 && d.totals.gross === 1990 + 2980 + 1990 && d.totals.bumps === 1 && d.totals.no_utm === 1, `totais: ${d.totals.paid} pagas, bruto ${d.totals.gross}, 1 bump, 1 sem UTM`);
ok(d.totals.orders === 4 && d.totals.pending === 1, 'checkout conta pendente, pago conta só pago');
ok(d.funnel.leads === 1, 'funil mostra a conversa (lead) do WhatsApp');
const ad1 = d.ads.find(a => a.ad_name === 'AD01 Depoimento'), ad2 = d.ads.find(a => a.ad_id === '312');
ok(ad1?.paid === 1 && ad1.orders === 2, 'venda sem UTM herdou o anúncio do lead (AD01)');
ok(ad2?.paid === 1 && ad2.gross === 2980, 'venda com ad_id caiu no anúncio certo (AD02)');
ok(d.sales.length === 4 && d.sales.every(s => !/Maria|Teste|gmail/i.test(JSON.stringify(s)) || s.email.includes('***')) && d.sales.some(s => s.email === 'ma***@gm***.com'), 'últimas vendas com e-mail mascarado e sem nome');
ok(d.esteira.buyers === 1 && d.gateways[0].gateway === 'whatsapp', 'esteira e gateway (whatsapp)');

r = await wh({ event: 'refunded', order_id: 'W101' });
r = await call(`/api/painel?offer=guia-oracoes&from=${from7}&to=${today}`);
ok(r.j.totals.paid === 2 && r.j.totals.refunds === 1, 'reembolso tira da receita e conta como reembolso');

/* ---------- ações na Meta ---------- */
ok(r.j.live['313']?.effective === 'ACTIVE' && r.j.live._currency === 'USD', 'status ao vivo + moeda da conta');
ok((await call('/api/meta/entity', { id: '313', action: 'pause' })).status === 200, 'pausar anúncio');
r = await call('/api/meta/entity', { id: '111', action: 'budget', budget_cents: 18000 });
ok(r.status === 200 && /US\$\s?150,00 → US\$\s?180,00/.test(r.j.text), 'orçamento na moeda da conta: ' + r.j?.text);
ok((await call('/api/meta/entity', { id: '313', action: 'budget', budget_cents: 5000 })).status === 400, 'recusa orçamento em anúncio');
ok((await call('/api/meta/entity', { id: '999999999', action: 'pause' })).status === 400, 'recusa id fora das contas sincronizadas');
r = await call(`/api/painel?offer=guia-oracoes&from=${from7}&to=${today}`);
ok(r.j.live['313'].effective === 'PAUSED' && r.j.live['111'].budget_cents === 18000, 'painel reflete a mudança');
ok(r.j.marks.filter(m => m.day === today).length === 2, 'mudanças viram marca no gráfico');
await call('/api/meta/entity', { id: '313', action: 'activate' });

/* ---------- corte automático ---------- */
ok((await call('/api/config', { auto_cut: true, tax_rate: 0.1, fx_markup: 0.035 })).status === 200, 'liga corte, imposto 10%, acréscimo câmbio 3,5%');
await fetch(B + '/cdn-cgi/handler/scheduled?cron=*/30+*+*+*+*');
r = await call(`/api/painel?offer=guia-oracoes&from=${from7}&to=${today}`);
const cutNames = r.j.cuts.map(c => c.ad_name).sort();
ok(JSON.stringify(cutNames) === JSON.stringify(['AD02 Oração 7 dias', 'AD05 Carta aberta']), `corte pausou quem passou do limite sem venda PAGA (a venda do AD02 foi reembolsada; AD01 tem venda pelo lead): ${cutNames}`);
ok(r.j.live['313'].effective === 'PAUSED' && r.j.live['311'].effective === 'ACTIVE' && r.j.live['312'].effective === 'PAUSED', 'status confere na Meta (AD01 segue ativo)');
r = await call(`/api/painel?offer=tiragem&from=${from7}&to=${today}`);
ok(r.j.cuts.length === 0, 'oferta sem nenhuma venda recebida NÃO sofre corte (trava)');
r = await call(`/api/painel?offer=guia-oracoes&from=${today}&to=${today}`);
ok(r.j.fx_markup === 0.035 && r.j.totals.spend === Math.round(2 * Math.round(5055 * rate(today) * 1.035) + Math.round(2000 * rate(today) * 1.035)), `cron re-sincronizou hoje com acréscimo no câmbio: ${r.j.totals.spend}`);

console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
process.exit(fails ? 1 : 0);
