# Placar — tráfego pago que conta só venda paga

Cloudflare Worker + D1 + cron de 30 min. Painel em `https://placar.<seu-subdominio>.workers.dev/?key=SUA_CHAVE`.

**Ligado:**
- **Meta Marketing API** — gasto, impressões e cliques no link por anúncio/dia; carimbo campanha → oferta; status e orçamento ao vivo; **pausar, ativar e mudar orçamento pelo painel** com confirmação; corte automático com trava.
- **Câmbio do dia** — conta em dólar tem o gasto convertido pela PTAX de fechamento do Banco Central (fim de semana/feriado usa o último dia útil).
- **Vendas do WhatsApp pelo n8n** — lead e venda paga em tempo real, com dedupe e atribuição por anúncio. Veja `docs/n8n.md`.

**Ainda não:** `/go/`, beacon da página e CAPI pelo Placar (seu n8n já manda a Purchase). Onde falta dado, o painel mostra “–”.

---

## 1. Preparar o computador (uma vez)

1. Instale o **Node.js LTS**: https://nodejs.org → baixar “LTS” → instalar com as opções padrão.
2. Abra o **PowerShell** dentro da pasta `Documents\placar` (no Explorer: clique com o botão direito na pasta → “Abrir no Terminal”).
3. Rode:
   ```powershell
   npm install
   ```

## 2. Criar a conta Cloudflare e o banco

1. Crie a conta grátis em https://dash.cloudflare.com/sign-up e confirme o e-mail.
2. Faça login pelo terminal (abre o navegador pra você autorizar):
   ```powershell
   npx wrangler login
   ```
3. Crie o banco D1:
   ```powershell
   npx wrangler d1 create placar
   ```
   O comando mostra um `database_id`. Abra `wrangler.toml` e troque `COLE_O_ID_DO_D1_AQUI` por esse id. (O id não é segredo.)
4. Crie as tabelas no banco da nuvem:
   ```powershell
   npm run db:remote
   ```

## 3. Publicar

```powershell
npm run deploy
```
Na primeira vez o wrangler pede pra escolher um subdomínio `workers.dev`. No fim ele mostra a URL, tipo `https://placar.seunome.workers.dev`.
Enquanto os secrets abaixo não existirem, tudo responde “Chave inválida” — é proposital.

## 4. Secrets (nunca no código, nunca no chat)

### 4.1 Chave do painel
Gere uma chave longa:
```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```
Guarde no seu gerenciador de senhas e grave no Worker (o comando pede o valor; cole e dê Enter):
```powershell
npx wrangler secret put PAINEL_KEY
```
Precisa ter pelo menos 16 caracteres, senão o painel não abre.

### 4.2 Token da Meta (usuário do sistema)
Token de usuário do sistema não expira com sua sessão do Facebook — é o certo pra um cron.

1. **Business Manager → Configurações do negócio → Contas → Apps.** Se não tiver app: https://developers.facebook.com/apps → Criar app → tipo **Empresa** → vincule ao seu Business Manager.
2. **Usuários → Usuários do sistema → Adicionar** → nome `placar`, função **Admin**.
3. Com o usuário selecionado: **Atribuir ativos → Contas de anúncios** → marque as contas das ofertas → permissão **Gerenciar campanhas** (controle total).
4. **Gerar novo token** → escolha o app → validade **Nunca** → permissões **`ads_read`** e **`ads_management`** → Gerar → copie.
5. Grave no Worker:
   ```powershell
   npx wrangler secret put META_TOKEN
   ```

> `ads_read` lê gasto e status. `ads_management` é o que permite pausar, ativar e mudar orçamento. Sem ele, o painel lê tudo mas as ações dão erro.

## 5. Primeiro uso

1. Abra `https://placar.seunome.workers.dev/?key=SUA_CHAVE` (salve nos favoritos; quem tem o link com a chave vê o painel).
2. **Ofertas → Nova oferta**: nome, id (ex.: `guia-oracoes`), conta de anúncios (`act_…`, em Gerenciador de Anúncios → menu de contas), filtro de campanha, ticket/CPA alvo e o limite de corte.
3. Em **Ofertas**, preencha **Imposto sobre gasto** (o percentual que você paga sobre o gasto com anúncio; padrão 0) e Salvar.
4. Escolha o período (ex.: 30d) e clique **Sincronizar Meta**. A sync cobre o período escolhido (mín. 7, máx. 90 dias). Depois disso o cron traz hoje e ontem a cada 30 min.
5. Confira em **Campanha → oferta** se cada campanha caiu na oferta certa. Se não, escolha no select — isso recarimba todo o histórico da campanha.

### Como a campanha vira oferta
1. **Mapa manual** (select no painel) vale mais que tudo.
2. Oferta da mesma conta cujo **filtro** aparece no nome da campanha. Filtro = pedaços separados por `|`, sem diferenciar maiúscula (ex.: `ORACOES|GUIA`).
3. Oferta da mesma conta **sem filtro** fica com o resto.

### Contrato de UTM (parâmetros de URL no anúncio)
```
utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```
A atribuição por anúncio é `utm_content` = **nome do anúncio**. Renomear anúncio com venda no período separa o histórico dele. Evite nomes repetidos entre anúncios da mesma oferta.

## 6. Pausar, ativar e mudar orçamento
Em **Desempenho**, cada linha tem **Pausar/Ativar** e, em conjunto ou campanha com orçamento diário, **Orçamento**. Tudo pede confirmação; mudança acima de 30% pede uma segunda. O valor é digitado **na moeda da conta** (US$ nas contas em dólar). Orçamento total (lifetime) só aparece, não é alterado pelo painel. Cada mudança vira uma marca ◆ no gráfico por dia.

## 7. Vendas do WhatsApp (n8n)
1. Crie a oferta com checkout **n8n** e copie **Webhook** e **Token** em Ofertas → Editar.
2. No n8n, crie uma credencial **Header Auth**: Name `Authorization`, Value `Bearer <token>`.
3. Importe `docs/n8n-no-placar.json`: um nó pro **lead** (logo depois do seu webhook de tracking) e um pra **venda paga** (logo depois de confirmar o pagamento).
4. Ajuste as expressões pros nomes dos seus campos. Detalhes do corpo em `docs/n8n.md`.

## 8. Câmbio
- Automático pela PTAX (venda, fechamento). Nada a configurar.
- **Acréscimo no câmbio** (Ofertas): se quiser somar IOF/spread do cartão, coloque o percentual. Vale para as próximas sincronizações; o cron refaz hoje e ontem, e **Sincronizar Meta** refaz o período escolhido.
- Sem cotação disponível pra um dia, a linha não é gravada (nada inventado) e a próxima sync tenta de novo.

## 9. Corte automático
- Desligado por padrão. Liga em **Ofertas → corte automático ligado**.
- A cada 30 min: anúncio **ativo** com gasto acumulado (tudo que já foi sincronizado) **acima do limite da oferta** e **zero venda paga** com `utm_content` igual ao nome é pausado, registrado e aparece como aviso dispensável.
- **Trava:** só age em oferta que já recebeu pelo menos 1 pedido por webhook. Hoje, sem webhook, nenhuma oferta passa nessa trava — então o corte fica esperando a próxima etapa mesmo ligado.
- Anúncio que já foi cortado e alguém reativou não é cortado de novo.
- Orçamento **nunca** muda sozinho.

## 10. Regras de conta
- Receita líquida = bruto − taxa da plataforma (só pedidos pagos)
- Investido = gasto × (1 + imposto) · ROAS líquido = receita líquida / investido
- CPA = gasto / vendas pagas · Ticket = receita líquida / vendas · Empate = CPA igual ao ticket
- Checkout = pedido gerado no gateway (qualquer status menos abandono)
- Veredito: **diluído** gasto < limite · **matar** passou do limite sem venda, ou ROAS < 0,8 com 2× o limite · **escalar** 3+ vendas e ROAS ≥ 1,3 · **segurar** o resto
- Dia = fuso de São Paulo. O gasto vem no fuso da conta de anúncios — deixe a conta em Brasília pra os dias baterem.
- Gasto guardado sempre em **BRL** (valor original e cotação ficam registrados). Orçamento aparece na moeda da conta.

## 11. Teste local (opcional)
```powershell
copy .dev.vars.example .dev.vars   # edite os valores; esse arquivo não sobe pra lugar nenhum
npm run db:local
npm run dev
```
Pra testar sem tocar na Meta nem no Banco Central: em outro terminal `node test/mock-meta.mjs`, ponha `META_TOKEN=token-teste`, `META_GRAPH_URL=http://127.0.0.1:8799` e `FX_URL=http://127.0.0.1:8799/ptax` no `.dev.vars`, e rode `node test/fumaca-meta.mjs` com o banco local zerado (43 checagens: Meta, câmbio, n8n, ações e corte).

## 12. Problemas comuns
| Sintoma | O que fazer |
|---|---|
| “Chave inválida” | `PAINEL_KEY` não gravado, menor que 16 caracteres, ou chave errada na URL |
| “Secret META_TOKEN não configurado” | rode o passo 4.2 |
| “Invalid OAuth access token” / código 190 | token revogado ou copiado errado — gere outro e rode `secret put` de novo |
| “(#200) … permission” / código 200 | usuário do sistema sem acesso à conta ou sem `ads_management` |
| “Exceeded CPU time” nos logs | plano grátis tem limite de CPU por execução; sincronize períodos menores ou use o plano pago (US$ 5/mês) |
| n8n recebe 401 | token errado ou faltando `Bearer ` no header |
| n8n recebe 400 | a mensagem diz o campo (ex.: `order_id é obrigatório`) |
| “sem cotação USD” na sync | Banco Central fora do ar ou dia sem boletim ainda — a próxima sync resolve |
| Ver logs do cron | `npx wrangler tail` |

## 13. Modo "Placar Meta" no Worker (24h, sem abrir o Claude)

Com `LIVE_ACCOUNTS` preenchido no `wrangler.toml`, o endereço do Worker abre o mesmo painel do artifact Placar Meta:
gasto e status ao vivo da Meta, vendas do n8n em tempo real, funil com WhatsApp, análise e ações, orçamento e alertas.

- `LIVE_ACCOUNTS`: contas de anúncio mostradas (id sem `act_`, nome, moeda).
- `N8N_DADOS_URL` (secret): webhook do fluxo **PLACAR - DADOS DO PAINEL** (precisa estar publicado). Fica em `config-local.txt` (fora do git) e o `PUBLICAR.cmd` grava na Cloudflare.
- `META_TOKEN` (secret): token de usuário do sistema com `ads_read` e `ads_management`.
- Contas em Business Managers diferentes: crie um secret por conta, `META_TOKEN_<id da conta>`
  (ex.: `npx wrangler secret put META_TOKEN_917690753512280`). Sem ele, a conta usa o `META_TOKEN`.

Abra `https://placar.<seu-subdominio>.workers.dev/?key=SUA_CHAVE` e salve nos favoritos (no celular: "Adicionar à tela inicial").

Diferenças para o artifact: a "Análise detalhada com Claude" não existe aqui (as regras de análise e as ações continuam);
alertas de venda tocam enquanto a aba estiver aberta (mesmo em segundo plano).

## Estrutura
```
migrations/   0001_init.sql, 0002_meta.sql, 0003_n8n_cambio.sql (versionadas; npm run db:remote aplica as novas)
src/          index.js (rotas + cron) · meta.js (Graph API, sync, ao vivo, ações, corte) · fx.js (PTAX) · webhook.js (n8n) · painel.js (consultas) · offers.js · util.js
painel/       1-head.html · 2-body.html · 3-demo.js (dados de exemplo, só sem ?key) · 4-app.js  → build.mjs gera painel/dist/painel.html
test/         mock-meta.mjs · fumaca-meta.mjs
docs/         contrato-painel.md · n8n.md · n8n-no-placar.json
```
