<#
  Cria as labels e as issues iniciais do ARC-DRAW no GitHub.
  Requer o GitHub CLI (winget install GitHub.cli) e `gh auth login` feito.

  Uso:   .\seed-github.ps1 -Repo SEU_USUARIO/arc-draw
  Teste: .\seed-github.ps1 -Repo SEU_USUARIO/arc-draw -DryRun
#>
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$labels = @(
  @{ n = "pattern";           c = "0E8A16"; d = "Reusable SAP architecture pattern" },
  @{ n = "diagram-feedback";  c = "0070F2"; d = "The agent drew something that does not match SAP style" },
  @{ n = "sap-guideline";     c = "FBCA04"; d = "Related to the SAP BTP Solution Diagram guideline" },
  @{ n = "windows";           c = "5319E7"; d = "Windows-specific" }
)

foreach ($l in $labels) {
  Write-Host "label: $($l.n)"
  if (-not $DryRun) {
    gh label create $l.n --color $l.c --description $l.d --repo $Repo --force | Out-Null
  }
}

$issues = Get-Content (Join-Path $PSScriptRoot "starter-issues.json") -Raw -Encoding UTF8 | ConvertFrom-Json

foreach ($i in $issues) {
  Write-Host "issue: $($i.title)   [$($i.labels -join ', ')]"
  if (-not $DryRun) {
    gh issue create --repo $Repo --title $i.title --body $i.body --label ($i.labels -join ",") | Out-Null
  }
}

Write-Host ""
Write-Host "Feito. Confira em https://github.com/$Repo/issues"
