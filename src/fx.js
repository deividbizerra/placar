import { getConfig, setConfig, addDays, todaySP } from './util.js';

/* Cotação PTAX (Banco Central) — venda, boletim de fechamento. Cache em config 'fx:<MOEDA>' = { 'YYYY-MM-DD': taxa }.
   Dia sem cotação (fim de semana, feriado, hoje antes do fechamento) usa o último dia útil anterior. */
const PTAX = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)';
const mdy = (d) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`;

async function fetchRange(env, currency, since, until) {
  const url = (env.FX_URL || PTAX) + `?@moeda='${currency}'&@dataInicial='${mdy(since)}'&@dataFinalCotacao='${mdy(until)}'&$format=json`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Banco Central respondeu ${r.status} na cotação de ${currency}`);
  const j = await r.json();
  const byDay = {};
  for (const v of j.value || []) {
    const day = String(v.dataHoraCotacao).slice(0, 10);
    const isClose = /^Fechamento/i.test(v.tipoBoletim || '') && !/Interbanc/i.test(v.tipoBoletim || '');
    const cur = byDay[day];
    // prefere o fechamento; sem ele, o boletim mais tarde do dia
    if (!cur || (isClose && !cur.close) || (isClose === cur.close && v.dataHoraCotacao > cur.at)) byDay[day] = { rate: Number(v.cotacaoVenda), close: isClose, at: v.dataHoraCotacao };
  }
  return Object.fromEntries(Object.entries(byDay).filter(([, v]) => v.rate > 0).map(([d, v]) => [d, v.rate]));
}

// Devolve função day → { rate, fx_day } ou null
export async function fxResolver(env, currency, since, until) {
  if (!currency || currency === 'BRL') return () => ({ rate: 1, fx_day: null });
  const key = 'fx:' + currency;
  const cache = (await getConfig(env, key, {})) || {};
  const from = addDays(since, -10); // pega dias úteis anteriores pra cobrir fim de semana/feriado
  const today = todaySP();
  const needFetch = (() => { for (let d = since; d <= until; d = addDays(d, 1)) if (!cache[d] && d >= addDays(today, -3)) return true; return !Object.keys(cache).some(d => d <= since); })();
  if (needFetch) {
    Object.assign(cache, await fetchRange(env, currency, from, until));
    const keep = Object.keys(cache).sort().slice(-800); // ~3 anos
    await setConfig(env, key, Object.fromEntries(keep.map(k => [k, cache[k]])));
  }
  const markup = Number(await getConfig(env, 'fx_markup', 0)) || 0;
  const days = Object.keys(cache).sort();
  return (day) => {
    let best = null;
    for (const d of days) { if (d <= day) best = d; else break; }
    return best ? { rate: cache[best] * (1 + markup), fx_day: best } : null;
  };
}
