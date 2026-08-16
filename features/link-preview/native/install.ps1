param(
  [Parameter(Mandatory = $true)]
  [string] $ExtensionId,
  [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'

function Find-CurlPython {
  $candidates = @()
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  $candidates += (
    "$env:LOCALAPPDATA\mise\installs\python\3.13.14\python.exe",
    "$env:LOCALAPPDATA\mise\installs\python\3.12.8\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
  )
  foreach ($exe in $candidates | Select-Object -Unique) {
    if (-not $exe -or -not (Test-Path $exe)) { continue }
    if ($exe -match 'chocolatey|WindowsApps') { continue }
    & $exe -c "from curl_cffi import requests" 2>$null
    if ($LASTEXITCODE -eq 0) { return $exe }
  }
  return $null
}

$hostName = 'com.brunolm.link_preview'
$installDir = Join-Path $env:LOCALAPPDATA 'brunolm-link-preview'
$repoHost = Join-Path $PSScriptRoot 'host.mjs'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$grok = (Get-Command grok -ErrorAction SilentlyContinue).Source
$python = Find-CurlPython

$registryKeys = @(
  "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Chromium\NativeMessagingHosts\$hostName"
)

if ($Uninstall) {
  foreach ($key in $registryKeys) {
    if (Test-Path $key) { Remove-Item $key -Force }
  }
  if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }
  Write-Output "Removed $hostName"
  exit 0
}

$id = $ExtensionId.ToLowerInvariant()
if ($id -notmatch '^[a-p]{32}$') {
  throw "Extension id must be 32 characters a-p (from brave://extensions). Got: $ExtensionId"
}
if (-not $node) { throw 'node is not on PATH' }
if (-not (Test-Path $repoHost)) { throw "missing $repoHost" }
if (-not $grok) {
  Write-Warning 'grok is not on PATH. The host will try %USERPROFILE%\.grok\bin\grok.exe'
}
if (-not $python) {
  throw 'No python with curl_cffi. Run: python -m pip install curl_cffi'
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$launcher = Join-Path $installDir 'host.cmd'
$manifestPath = Join-Path $installDir "$hostName.json"

$pythonDir = Split-Path $python
@(
  '@echo off'
  "set GROK_BIN=$grok"
  "set PYTHON=$python"
  "set PATH=$pythonDir;%PATH%"
  "`"$node`" `"$repoHost`""
) | Set-Content -Path $launcher -Encoding ASCII

@{
  name = $hostName
  description = 'brunolm link preview via grok CLI'
  path = $launcher
  type = 'stdio'
  allowed_origins = @("chrome-extension://$id/")
} | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8

foreach ($key in $registryKeys) {
  New-Item -Path $key -Force | Out-Null
  Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath
}

Write-Output "Installed $hostName for chrome-extension://$id/"
Write-Output "Manifest: $manifestPath"
Write-Output "Python: $python"
Write-Output 'Reload the unpacked extension, then click Test in Link Preview.'
