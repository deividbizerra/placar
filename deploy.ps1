# Placar - publicar na Cloudflare (rode com dois cliques em PUBLICAR.cmd)
# Nenhum segredo sai deste computador: a chave do painel fica em chave-do-painel.txt e o token da Meta voce cola direto no terminal.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
function Passo($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Falha($t) { Write-Host ""; Write-Host "ERRO: $t" -ForegroundColor Red; exit 1 }
function Wr { & npx.cmd --yes wrangler @args; if ($LASTEXITCODE -ne 0) { Falha "o comando 'wrangler $($args -join ' ')' falhou (veja a mensagem acima)" } }

Passo "1/7 Conferindo o Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Start-Process "https://nodejs.org/pt"
  Falha "Node.js nao encontrado. Instale a versao LTS (abri o site), feche esta janela e rode PUBLICAR.cmd de novo."
}
node --version

Passo "2/7 Instalando as dependencias (1a vez demora um pouco)"
& npm.cmd install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Falha "npm install falhou" }

Passo "3/7 Login na Cloudflare"
& npx.cmd wrangler whoami 2>&1 | Out-String | Tee-Object -Variable who | Out-Null
if ($who -match 'not authenticated|You are not') {
  Write-Host "Vai abrir o navegador: entre na sua conta Cloudflare e clique em Allow / Permitir." -ForegroundColor Yellow
  Wr login
} else { Write-Host "Ja esta logado." }

Passo "4/7 Banco de dados D1"
$toml = Get-Content wrangler.toml -Raw
if ($toml -match 'COLE_O_ID_DO_D1_AQUI') {
  $lista = (& npx.cmd wrangler d1 list --json 2>$null | Out-String)
  $db = $null
  try { $db = ($lista.Substring($lista.IndexOf('[')) | ConvertFrom-Json) | Where-Object { $_.name -eq 'placar' } | Select-Object -First 1 } catch {}
  if (-not $db) {
    Wr d1 create placar
    $lista = (& npx.cmd wrangler d1 list --json 2>$null | Out-String)
    $db = ($lista.Substring($lista.IndexOf('[')) | ConvertFrom-Json) | Where-Object { $_.name -eq 'placar' } | Select-Object -First 1
  }
  if (-not $db.uuid) { Falha "nao consegui achar o id do banco 'placar'" }
  $toml = $toml.Replace('COLE_O_ID_DO_D1_AQUI', $db.uuid)
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'wrangler.toml'), $toml, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Banco ligado: $($db.uuid)"
} else { Write-Host "Banco ja configurado no wrangler.toml." }
$env:CI = 'true'   # aplica sem perguntar
Wr d1 migrations apply placar --remote
Remove-Item Env:CI

Passo "5/7 Publicando o Worker"
& node build.mjs; if ($LASTEXITCODE -ne 0) { Falha "build do painel falhou" }
$saida = Join-Path $env:TEMP "placar-deploy.ndjson"; Remove-Item $saida -ErrorAction SilentlyContinue
$env:WRANGLER_OUTPUT_FILE_PATH = $saida
Write-Host "Se perguntar o subdominio workers.dev, digite um nome (ex.: seu nome) e Enter." -ForegroundColor Yellow
Wr deploy
Remove-Item Env:WRANGLER_OUTPUT_FILE_PATH
$url = $null
if (Test-Path $saida) { foreach ($l in Get-Content $saida) { try { $o = $l | ConvertFrom-Json; if ($o.type -eq 'deploy' -and $o.targets) { $url = @($o.targets | Where-Object { $_ -match 'workers\.dev' })[0] } } catch {} } }

Passo "6/7 Chave do painel"
$arq = Join-Path $PSScriptRoot 'chave-do-painel.txt'
$key = $null
if (Test-Path $arq) { $m = Select-String -Path $arq -Pattern '^CHAVE=(.+)$' | Select-Object -First 1; if ($m) { $key = $m.Matches[0].Groups[1].Value.Trim() } }
if (-not $key) {
  $b = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $key = [Convert]::ToBase64String($b).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}
$key | & npx.cmd wrangler secret put PAINEL_KEY
if ($LASTEXITCODE -ne 0) { Falha "nao consegui gravar a PAINEL_KEY" }

$cfgLocal = Join-Path $PSScriptRoot 'config-local.txt'
if (Test-Path $cfgLocal) {
  $m = Select-String -Path $cfgLocal -Pattern '^N8N_DADOS_URL=(.+)$' | Select-Object -First 1
  if ($m) { $m.Matches[0].Groups[1].Value.Trim() | & npx.cmd wrangler secret put N8N_DADOS_URL; if ($LASTEXITCODE -ne 0) { Falha "nao consegui gravar N8N_DADOS_URL" } }
} else { Write-Host "Sem config-local.txt: grave depois com  npx wrangler secret put N8N_DADOS_URL" -ForegroundColor Yellow }

Passo "7/7 Token da Meta"
Write-Host "Cole o token de usuario do sistema da Meta (ads_read + ads_management) quando pedir e aperte Enter." -ForegroundColor Yellow
Write-Host "Ele vai direto pra Cloudflare - nao aparece na tela e nao fica salvo aqui." -ForegroundColor Yellow
$pular = Read-Host "Aperte Enter pra colar agora (ou digite P pra pular e fazer depois)"
if ($pular -notmatch '^[Pp]') {
  Wr secret put META_TOKEN
  $outro = Read-Host "A conta Lary (917690753512280) esta em OUTRO Business Manager com outro token? (s/N)"
  if ($outro -match '^[Ss]') { Wr secret put META_TOKEN_917690753512280 }
  $outro2 = Read-Host "A conta BM NOVA (1314234857567715) usa um token diferente do que voce colou? (s/N)"
  if ($outro2 -match '^[Ss]') { Wr secret put META_TOKEN_1314234857567715 }
}

$link = if ($url) { "$url/?key=$key" } else { "https://placar.SEU-SUBDOMINIO.workers.dev/?key=$key" }
Set-Content -Path $arq -Encoding UTF8 -Value @("CHAVE=$key", "LINK=$link", "", "Guarde este arquivo. Quem tem o link abre o painel.")
Write-Host ""
Write-Host "PRONTO! O Placar esta no ar 24h." -ForegroundColor Green
Write-Host "O link com a chave foi salvo em chave-do-painel.txt (nesta pasta)." -ForegroundColor Green
if ($url) { Start-Process $link }
