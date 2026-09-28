# Sobe a Área do Formando local e abre o navegador.
# Uso: .\iniciar.ps1   (ou .\iniciar.ps1 -Porta 5000)

param([int]$Porta = 4173)

Set-Location $PSScriptRoot
$env:PORTA = $Porta
$url = "http://localhost:$Porta/"

Write-Host ""
Write-Host "  Área do Formando — abrindo $url" -ForegroundColor Magenta
Write-Host "  Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

Start-Job -ScriptBlock { Start-Sleep -Seconds 1; Start-Process $using:url } | Out-Null
node servidor.mjs
