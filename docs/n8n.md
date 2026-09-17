# Vendas do WhatsApp → Placar (n8n)

O Placar conta **só venda paga**. O n8n avisa o Placar em dois momentos:

| Momento no seu fluxo | `event` | Pra que serve |
|---|---|---|
| Lead chegou no WhatsApp (o webhook de tracking que você já tem) | `lead` | etapa **Conversa** do funil e guarda as UTMs do lead |
| n8n confirmou o pagamento (o mesmo ponto em que você manda a Purchase pra Meta) | `paid` | venda paga, receita, CPA, ROAS, ranking, corte |
| Reembolso / estorno | `refunded` / `chargeback` | tira da receita |
| Pix gerado e ainda não pago (opcional) | `pending` | conta como checkout |

**Endereço:** `POST https://placar.SEU-SUBDOMINIO.workers.dev/wh/n8n/<id-da-oferta>`
**Header:** `Authorization: Bearer <token da oferta>` (painel → Ofertas → Editar → Token). Guarde o token numa credencial *Header Auth* do n8n, não no corpo do fluxo.

O Placar **não** manda Purchase pra Meta nessa oferta — seu n8n já manda. Assim não duplica.

## Corpo (JSON)

```json
{
  "event": "paid",
  "order_id": "id único do pedido (obrigatório exceto em lead)",
  "lead_id": "mesmo lead_id do tracking da página",
  "amount": 19.90,
  "method": "pix",
  "product": "Guia de Orações",
  "bump_amount": 0,
  "fee": 0,
  "paid_at": "2026-09-16T14:30:00-03:00",
  "customer": { "name": "…", "email": "…", "phone": "55…" },
  "utm_source": "meta", "utm_medium": "paid",
  "utm_campaign": "{{campaign.name}}", "utm_content": "{{ad.name}}", "utm_term": "{{adset.name}}",
  "ad_id": "id do anúncio, se você tiver",
  "fbc": "…", "fbp": "…"
}
```

Regras:
- `amount` em reais (aceita `19.9`, `"19,90"`, `"R$ 19,90"`) ou `amount_cents` inteiro.
- Mesmo `order_id` de novo **não duplica**: só atualiza status (ex.: `paid` → `refunded`). Campo vazio não apaga o que já estava.
- Atribuição ao anúncio, nesta ordem: `ad_id` → `utm_content` (nome do anúncio) → UTMs guardadas no `lead` com o mesmo `lead_id`. Por isso vale mandar o `lead` com as UTMs assim que ele chega: a venda pode vir só com `lead_id`.
- Sem nada disso a venda entra marcada **sem UTM** (conta no total, não em anúncio).
- `paid_at` com fuso (`-03:00`). Sem ele, vale a hora em que o Placar recebeu.
- Resposta: `{"ok":true,"order_id":"…","status":"paid","duplicate":false}`. Erro de dado = 400 com mensagem; token errado = 401.
- Nome, e-mail e telefone ficam guardados pra LTV/recompra e nunca aparecem no painel (e-mail sai mascarado).

## Nó pronto
Importe `docs/n8n-no-placar.json` (n8n → colar no canvas), ajuste as expressões `$json.…` pros nomes dos seus campos e escolha a credencial Header Auth.

Teste rápido no PowerShell (troque URL e token):
```powershell
$h = @{ Authorization = "Bearer SEU_TOKEN" }
Invoke-RestMethod -Method Post -Uri "https://placar.SEU-SUBDOMINIO.workers.dev/wh/n8n/guia-oracoes" -Headers $h -ContentType "application/json" -Body '{"event":"paid","order_id":"TESTE-1","amount":19.9,"method":"pix","utm_content":"NOME DO ANUNCIO"}'
```
Depois apague o teste com um `refunded` do mesmo `order_id` (ou deixe e ignore — ele fica no histórico).
