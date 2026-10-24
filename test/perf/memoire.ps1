# Additionne la mémoire de travail (Mo) de tous les processus d'une application Electron.
# Usage : memoire.ps1 -Racine <dossier contenant electron.exe ou l'app> [-Lancer] [-Attente 12] [-Json]
#   -Lancer : démarre `electron.exe <Racine>` , attend, mesure, ferme.
#   Sans -Lancer : mesure les processus déjà ouverts dont le chemin commence par -Chemin (défaut : electron/BloxPlus).
param(
  [string]$Racine = (Resolve-Path "$PSScriptRoot/../..").Path,
  [switch]$Lancer,
  [int]$Attente = 12,
  [string]$Chemin = "",
  [switch]$Json
)
$ErrorActionPreference = 'Stop'
$proc = $null
if ($Lancer) {
  $exe = Join-Path $Racine 'node_modules/electron/dist/electron.exe'
  if (-not (Test-Path $exe)) { throw "electron.exe introuvable : $exe" }
  $proc = Start-Process -FilePath $exe -ArgumentList "`"$Racine`"" -PassThru
  Start-Sleep -Seconds $Attente
  if (-not $Chemin) { $Chemin = (Join-Path $Racine 'node_modules/electron/dist') }
}
if (-not $Chemin) { $Chemin = 'electron.exe' }
$cheminNorm = $Chemin.Replace("/", "\")
$tous = Get-CimInstance Win32_Process
if ($proc) {
  # Seuls les descendants du processus lancé (d’autres Electron peuvent tourner sur la machine).
  $ids = @($proc.Id); $on = $true
  while ($on) { $on = $false; foreach ($q in $tous) { if ($ids -contains $q.ParentProcessId -and $ids -notcontains $q.ProcessId) { $ids += $q.ProcessId; $on = $true } } }
  $liste = $tous | Where-Object { $ids -contains $_.ProcessId }
} else {
  $liste = $tous | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like "$cheminNorm*" -or $_.ExecutablePath -like "*BloxPlus*") }
}
$details = foreach ($p in $liste) {
  $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
  if ($gp) {
    $type = if ($p.CommandLine -match '--type=([\w-]+)') { $Matches[1] } else { 'main' }
    [pscustomobject]@{ Pid = $p.ProcessId; Type = $type; WorkingSetMo = [math]::Round($gp.WorkingSet64 / 1MB, 1); PrivateMo = [math]::Round($gp.PrivateMemorySize64 / 1MB, 1) }
  }
}
$totalWs = [math]::Round((($details | Measure-Object WorkingSetMo -Sum).Sum), 1)
$totalPriv = [math]::Round((($details | Measure-Object PrivateMo -Sum).Sum), 1)
if ($proc) { foreach ($i in $ids) { Stop-Process -Id $i -Force -ErrorAction SilentlyContinue } }
if ($Json) { [pscustomobject]@{ Processus = @($details).Count; TotalWorkingSetMo = $totalWs; TotalPrivateMo = $totalPriv; Details = $details } | ConvertTo-Json -Depth 4 }
else { $details | Format-Table -AutoSize; "Processus : $(@($details).Count)  |  Mémoire de travail totale : $totalWs Mo  |  Privée : $totalPriv Mo" }
