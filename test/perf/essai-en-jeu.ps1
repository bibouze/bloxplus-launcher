# Essai réel : BloxPlus (profil temporaire) + Roblox (--app, même commande que BloxPlus) → mémoire en jeu → retour.
# Usage : essai-en-jeu.ps1 -Mode leger|complet [-AttenteJeu 30]
# Ouvre vraiment Roblox sur la machine, puis le ferme. Aucun fichier du profil réel de BloxPlus n'est touché.
param([ValidateSet('leger', 'complet')][string]$Mode = 'leger', [int]$AttenteJeu = 30)
$ErrorActionPreference = 'Stop'
if (Get-Process RobloxPlayerBeta, gardien -ErrorAction SilentlyContinue) { throw 'Roblox ou un gardien tourne déjà : fermez-les avant l essai.' }
$racine = (Resolve-Path "$PSScriptRoot/../..").Path
$mem = Join-Path $PSScriptRoot 'memoire.ps1'
$profil = Join-Path $env:TEMP ("bp-essai-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $profil | Out-Null
$motif = "--user-data-dir=$profil"

# Profil prérempli : mode demandé, installation de Roblox déjà faite (versions de BloxPlus).
$cfg = '{"launch":{"playMode":"' + $Mode + '","multiInstance":false,"applyMods":true,"highPriority":false},"overlay":{"enabled":false}}'
[IO.File]::WriteAllText((Join-Path $profil 'config.json'), $cfg)

$electron = Join-Path $racine 'node_modules/electron/dist/electron.exe'
Start-Process -FilePath $electron -ArgumentList "`"$racine`" `"$motif`"" | Out-Null
Start-Sleep -Seconds 15
"--- BloxPlus ouvert, fenêtre au repos ($Mode)"
& $mem -Motif $profil -Json | ConvertFrom-Json | ForEach-Object { "$($_.Processus) processus, $($_.TotalWorkingSetMo) Mo" }

$ver = Get-ChildItem "$env:LOCALAPPDATA/BloxPlus/Versions" -Directory | Where-Object { Test-Path "$($_.FullName)/RobloxPlayerBeta.exe" } | Select-Object -First 1
if (-not $ver) { throw 'Aucune version de Roblox installée par BloxPlus.' }
Start-Process -FilePath "$($ver.FullName)/RobloxPlayerBeta.exe" -ArgumentList '--app' -WorkingDirectory $ver.FullName | Out-Null
Start-Sleep -Seconds $AttenteJeu
"--- Roblox ouvert depuis $AttenteJeu s"
Get-Process RobloxPlayerBeta -ErrorAction SilentlyContinue | ForEach-Object { "Roblox pid $($_.Id) : $([math]::Round($_.WorkingSet64/1MB)) Mo (non compté)" }
$r = & $mem -Motif $profil -Json | ConvertFrom-Json
$r.Details | Format-Table -AutoSize | Out-String
"TOTAL BLOXPLUS EN JEU ($Mode) : $($r.Processus) processus, $($r.TotalWorkingSetMo) Mo"

"--- Fermeture de Roblox"
Get-Process RobloxPlayerBeta -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 15
$retour = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like "*$profil*" -and $_.CommandLine -notmatch '--type=' }
"Fenêtre BloxPlus de retour : " + $(if ($retour) { 'OUI (pid ' + $retour.ProcessId + ')' } else { 'NON' })
$fg = Get-Process -Id $retour.ProcessId -ErrorAction SilentlyContinue
if ($fg) { "Titre de fenêtre : '$($fg.MainWindowTitle)'  gardien encore actif : " + [bool](Get-Process gardien -ErrorAction SilentlyContinue) }

# Nettoyage : tout ce qui appartient à l'essai.
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$profil*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process RobloxPlayerBeta, gardien -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Remove-Item $profil -Recurse -Force -ErrorAction SilentlyContinue
