export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export const err = (msg, status = 400) => json({ error: msg }, status);

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// Brasil sem horário de verão desde 2019: dia local = UTC − 3h
export const todaySP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function getConfig(env, key, fallback = null) {
  const r = await env.DB.prepare('SELECT value FROM config WHERE key = ?').bind(key).first();
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
export async function setConfig(env, key, value) {
  await env.DB.prepare(`INSERT INTO config (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(key, JSON.stringify(value)).run();
}
export const logEvent = (env, { offer_id = null, kind, subkind = null, ref = null, detail = null }) =>
  env.DB.prepare('INSERT INTO events (offer_id, kind, subkind, ref, detail_json) VALUES (?, ?, ?, ?, ?)').bind(offer_id, kind, subkind, ref, detail == null ? null : JSON.stringify(detail)).run();

export const randomToken = (prefix = '', bytes = 18) => {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return prefix + btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': 'x', '/': 'y', '=': '' }[c]));
};
export const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
