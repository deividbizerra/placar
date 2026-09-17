# Placar - enviar o codigo pro GitHub (rode com dois cliques em SUBIR-GITHUB.cmd)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
function Falha($t) { Write-Host ""; Write-Host "ERRO: $t" -ForegroundColor Red; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Start-Process "https://git-scm.com/download/win"
  Falha "Git nao encontrado. Instale (abri o site, opcoes padrao), feche esta janela e rode SUBIR-GITHUB.cmd de novo."
}

$url = Read-Host "Endereco do repositorio (Enter = https://github.com/deividbizerra/placar)"
if (-not $url.Trim()) { $url = "https://github.com/deividbizerra/placar" }
$url = $url.Trim().TrimEnd('/')
if ($url -notmatch '^https://github\.com/[^/]+/[^/]+$') { Falha "endereco invalido" }
if ($url -notmatch '\.git$') { $url = "$url.git" }

if (-not (Test-Path .git)) { git init -b main | Out-Null }
if (-not (git config user.name)) { git config user.name "Deivid" }
if (-not (git config user.email)) { git config user.email "souzadeivid326@gmail.com" }
git add -A
git commit -m "Placar: tracker de trafego pago (Worker + D1 + painel ao vivo)" 2>$null | Out-Null
git branch -M main
if (git remote | Select-String -Quiet '^origin$') { git remote set-url origin $url } else { git remote add origin $url }

Write-Host ""
Write-Host "Conferindo que nenhum segredo vai junto..." -ForegroundColor Cyan
$bad = git ls-files | Select-String -Pattern '^(\.dev\.vars|chave-do-painel\.txt|config-local\.txt|\.env)$'
if ($bad) { Falha "arquivo sensivel no git: $bad" }

Write-Host "Juntando com o que ja existe no GitHub (README inicial)..." -ForegroundColor Cyan
git fetch origin 2>$null
if (git branch -r | Select-String -Quiet 'origin/main') { git pull origin main --allow-unrelated-histories --no-rebase -X ours --no-edit; if ($LASTEXITCODE -ne 0) { Falha "nao consegui juntar com o repositorio do GitHub" } }

Write-Host "Enviando (se abrir uma janela do GitHub, faca login e autorize)..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) { Falha "o envio falhou (veja a mensagem acima)" }
Write-Host ""
Write-Host "PRONTO! Codigo no GitHub: $($url -replace '\.git$','')" -ForegroundColor Green
Start-Process ($url -replace '\.git$','')
