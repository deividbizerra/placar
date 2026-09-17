# Contrato `GET /api/painel?offer=<slug|all>&from=YYYY-MM-DD&to=YYYY-MM-DD`

Header `x-placar-key`. Dinheiro em **centavos**. Campo sem dado = `null` → painel mostra "–".
O modo demo (`painel/3-demo.js`) devolve exatamente este formato; o Worker da etapa 2 troca só a fonte.

| Campo | Conteúdo |
|---|---|
| `tax_rate` | imposto sobre gasto (0.06 = 6%) |
| `refs` | régua: `click_checkout`, `checkout_paid`, `bump` |
| `verdict` | `scale_min_sales`, `scale_min_roas`, `kill_roas`, `kill_spend_mult` |
| `offers[]` | config pública (sem `capi_token`; só `capi_set`) + `sales_count` (pedidos) |
| `totals` | `spend, impressions, link_clicks` (null sem conta Meta) · `gross, fee` · `gross_m, fee_m` (só ofertas com gasto; usados no ROAS) · `paid, paid_pix, bumps, refunds, chargebacks, orders, pending, abandoned, no_utm` |
| `days[]` | `day, spend, gross, fee, gross_m, fee_m, paid, orders` |
| `marks[]` | `day, kind (cut/budget/status), text` |
| `cuts[]` | cortes não dispensados |
| `campaigns[]` | `campaign_id, campaign_name, account_id, filter_offer, manual_offer` |
| `sales[]` | 30 últimas; `email` já mascarado no servidor |
| `per_offer[]` | só em `offer=all`: `slug, totals, days` |
| `funnel` | `clicks, visits, button, leads` (conversas do n8n, null sem lead) `, checkout, paid` |
| `gateways[]` | `gateway, initiated, orders, paid, gross, fee, paid_pix` |
| `esteira` | `buyers, repeat_buyers, ltv_net_cents, paid, bumps, origin.{ad,thankyou,other}.{n,net}` |
| `page` | `null` sem beacon · `sessions, clicked, orders, paid, median_time_s, median_scroll_pct, modal, sections[], buttons[], variants[]` |
| `ads[]` | por anúncio: ids/nomes de anúncio, conjunto e campanha + `spend, impressions, link_clicks, orders, paid, gross, fee` (inclui anúncio com venda e gasto 0) |
| `live` | `{ <id>: { status, effective, budget_cents, budget_type, lifetime_cents } }` lido da Meta (cache 90 s); `live_error` se falhar |
| `auto_cut`, `last_sync`, `fx_markup` | chave do corte automático; resumo da última sync |

## Regras
- Receita líquida = bruto − taxa (só status `paid`)
- Investido = gasto × (1 + imposto) · ROAS líquido = receita líquida / investido
- CPA = gasto / vendas pagas · Ticket = receita líquida / vendas pagas · Empate = CPA = ticket
- Checkout = pedido gerado no gateway (qualquer status menos abandono)
- Veredito: gasto < X da oferta → **diluído**; ≥ X sem venda → **matar**; ROAS < kill_roas com gasto ≥ X×kill_spend_mult → **matar**; vendas ≥ scale_min_sales e ROAS ≥ scale_min_roas → **escalar**; resto → **segurar**
