import { safeEqual, logEvent, json, err } from './util.js';

/* POST /wh/<plataforma>/<slug>  — token da oferta em  Authorization: Bearer <token>  (ou x-placar-token, ou ?token=)
   Hoje: plataforma "n8n" (vendas do WhatsApp). Outras plataformas entram como adaptadores aqui. */

const STATUS = {
  paid: 'paid', pago: 'paid', approved: 'paid', aprovado: 'paid', purchase: 'paid',
  pending: 'pending', pendente: 'pending', aguardando: 'pending', pix_gerado: 'pending',
  refunded: 'refunded', reembolso: 'refunded', reembolsado: 'refunded', estorno: 'refunded',
  chargeback: 'chargeback', charged_back: 'chargeback',
  abandoned: 'abandoned', abandono: 'abandoned', cancelado: 'abandoned', canceled: 'abandoned', expired: 'abandoned',
  lead: 'lead', conversa: 'lead',
};
const str = (v, max = 300) => v == null || v === '' ? null : String(v).trim().slice(0, max);
function money(v) { // aceita 19.9, "19,90", "R$ 1.234,56" → centavos
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
function iso(v) { if (!v) return null; const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v); return isNaN(d) ? null : d.toISOString(); }
const pick = (o, ...keys) => { for (const k of keys) { const v = k.split('.').reduce((a, p) => a?.[p], o); if (v != null && v !== '') return v; } return null; };

export function normalizeN8n(b) {
  const ev = String(pick(b, 'event', 'status', 'evento') || '').toLowerCase().replace(/^.*\./, '');
  const status = STATUS[ev];
  if (!status) throw new Error(`event inválido: use paid, pending, refunded, chargeback, abandoned ou lead`);
  const u = b.utm || b.utms || {};
  const amount = pick(b, 'amount_cents') != null ? Math.round(Number(b.amount_cents)) : money(pick(b, 'amount', 'value', 'valor'));
  return {
    status,
    order_id: str(pick(b, 'order_id', 'pedido_id', 'transaction_id', 'id'), 120),
    lead_id: str(pick(b, 'lead_id', 'lead.id'), 120),
    gross: amount,
    fee: pick(b, 'fee_cents') != null ? Math.round(Number(b.fee_cents)) : money(pick(b, 'fee', 'taxa')) ?? 0,
    bump: pick(b, 'bump_cents') != null ? Math.round(Number(b.bump_cents)) : money(pick(b, 'bump_amount', 'bump')) ?? 0,
    method: str(pick(b, 'method', 'payment_method', 'metodo'), 20)?.toLowerCase().replace('cartao', 'card').replace('cartão', 'card').replace('credit_card', 'card') ?? null,
    product: str(pick(b, 'product', 'produto', 'product.name'), 200),
    gateway: str(pick(b, 'gateway'), 40),
    paid_at: iso(pick(b, 'paid_at', 'pago_em')),
    created_at: iso(pick(b, 'created_at', 'criado_em')),
    email: str(pick(b, 'customer.email', 'email'), 200)?.toLowerCase() ?? null,
    name: str(pick(b, 'customer.name', 'name', 'nome'), 200),
    phone: str(pick(b, 'customer.phone', 'phone', 'telefone', 'whatsapp'), 40),
    utm_source: str(pick(b, 'utm_source') ?? u.source ?? u.utm_source),
    utm_medium: str(pick(b, 'utm_medium') ?? u.medium ?? u.utm_medium),
    utm_campaign: str(pick(b, 'utm_campaign') ?? u.campaign ?? u.utm_campaign),
    utm_content: str(pick(b, 'utm_content') ?? u.content ?? u.utm_content),
    utm_term: str(pick(b, 'utm_term') ?? u.term ?? u.utm_term),
    ad_id: str(pick(b, 'ad_id'), 30),
    sck: str(pick(b, 'sck', 'session_id'), 120),
    fbc: str(pick(b, 'fbc'), 300), fbp: str(pick(b, 'fbp'), 300),
    ip: str(pick(b, 'ip'), 60), ua: str(pick(b, 'ua', 'user_agent'), 400),
  };
}

export async function handleWebhook(req, env, platform, slug, url) {
  const offer = await env.DB.prepare('SELECT id, slug, platform, webhook_token FROM offers WHERE slug = ?').bind(slug).first();
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-placar-token') || url.searchParams.get('token') || '';
  if (!offer || !safeEqual(auth, offer.webhook_token)) return err('Não autorizado', 401); // mesma resposta pra slug inexistente
  if (platform !== 'n8n') return err('Plataforma ainda não suportada: ' + platform, 400);
  let body; try { body = await req.json(); } catch { return err('Corpo precisa ser JSON'); }
  let s; try { s = normalizeN8n(body); } catch (e) { return err(e.message); }
  const DB = env.DB, now = new Date().toISOString();

  // anúncio: ad_id vale mais; sem utm_content, completa pelo nome sincronizado
  if (s.ad_id && !s.utm_content) {
    const a = await DB.prepare('SELECT ad_name FROM spend WHERE ad_id = ? ORDER BY day DESC LIMIT 1').bind(s.ad_id).first();
    if (a) s.utm_content = a.ad_name;
  }
  // venda sem UTM: herda do lead registrado antes (mesmo lead_id)
  if (s.lead_id && !s.utm_content && !s.ad_id) {
    const l = await DB.prepare(`SELECT detail_json FROM events WHERE offer_id = ? AND kind = 'lead' AND ref = ?`).bind(offer.id, s.lead_id).first();
    if (l) { try { const d = JSON.parse(l.detail_json); for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_id', 'fbc', 'fbp']) s[k] ??= d[k] ?? null; } catch {} }
  }

  if (s.status === 'lead') {
    if (!s.lead_id) return err('lead precisa de lead_id');
    const detail = { utm_source: s.utm_source, utm_medium: s.utm_medium, utm_campaign: s.utm_campaign, utm_content: s.utm_content, utm_term: s.utm_term, ad_id: s.ad_id, fbc: s.fbc, fbp: s.fbp };
    const r = await DB.prepare(`INSERT INTO events (offer_id, kind, subkind, ref, detail_json, created_at) VALUES (?, 'lead', 'n8n', ?, ?, ?) ON CONFLICT DO NOTHING`)
      .bind(offer.id, s.lead_id, JSON.stringify(detail), s.created_at || now).run();
    return json({ ok: true, lead: s.lead_id, duplicate: r.meta.changes === 0 });
  }

  if (!s.order_id) return err('order_id é obrigatório');
  if (s.status === 'paid' && !(s.gross > 0)) return err('venda paga precisa de amount maior que zero');
  const noUtm = s.utm_content || s.ad_id ? 0 : 1;
  const paidAt = s.status === 'paid' ? (s.paid_at || now) : null;
  const prev = await DB.prepare('SELECT id, status, paid_at FROM sales WHERE platform = ? AND order_id = ?').bind('n8n', s.order_id).first();
  const raw = JSON.stringify(body).slice(0, 20000);
  if (!prev) {
    await DB.prepare(`INSERT INTO sales (offer_id, platform, order_id, status, product, gross_cents, fee_cents, bump_cents, method, gateway, customer_email, customer_name, customer_phone,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, ad_id, lead_id, sck, no_utm, fbc, fbp, ip, ua, paid_at, created_at, updated_at, raw_json)
      VALUES (?, 'n8n', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(offer.id, s.order_id, s.status, s.product, s.gross ?? 0, s.fee ?? 0, s.bump ?? 0, s.method, s.gateway || 'whatsapp', s.email, s.name, s.phone,
        s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term, s.ad_id, s.lead_id, s.sck, noUtm, s.fbc, s.fbp, s.ip, s.ua, paidAt, s.created_at || paidAt || now, now, raw).run();
  } else {
    // dedupe: mesmo pedido só atualiza. Campos que vierem vazios não apagam o que já existe. paid_at do primeiro pagamento é mantido.
    await DB.prepare(`UPDATE sales SET status = ?, product = COALESCE(?, product), gross_cents = COALESCE(?, gross_cents), fee_cents = COALESCE(?, fee_cents), bump_cents = COALESCE(?, bump_cents),
        method = COALESCE(?, method), gateway = COALESCE(?, gateway), customer_email = COALESCE(?, customer_email), customer_name = COALESCE(?, customer_name), customer_phone = COALESCE(?, customer_phone),
        utm_source = COALESCE(?, utm_source), utm_medium = COALESCE(?, utm_medium), utm_campaign = COALESCE(?, utm_campaign), utm_content = COALESCE(?, utm_content), utm_term = COALESCE(?, utm_term),
        ad_id = COALESCE(?, ad_id), lead_id = COALESCE(?, lead_id), no_utm = CASE WHEN COALESCE(?, utm_content) IS NULL AND COALESCE(?, ad_id) IS NULL THEN 1 ELSE 0 END,
        paid_at = CASE WHEN paid_at IS NULL THEN ? ELSE paid_at END, updated_at = ?, raw_json = ? WHERE id = ?`)
      .bind(s.status, s.product, s.gross, s.fee || null, s.bump || null, s.method, s.gateway, s.email, s.name, s.phone,
        s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term, s.ad_id, s.lead_id, s.utm_content, s.ad_id, paidAt, now, raw, prev.id).run();
  }
  await logEvent(env, { offer_id: offer.id, kind: 'webhook', subkind: s.status, ref: s.order_id });
  return json({ ok: true, order_id: s.order_id, status: s.status, duplicate: !!prev && prev.status === s.status });
}
