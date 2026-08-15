param(
  [Parameter(Mandatory = $true)]
  [string] $ExtensionId,
  [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.brunolm.link_preview'
$installDir = Join-Path $env:LOCALAPPDATA 'brunolm-link-preview'
$repoHost = Join-Path $PSScriptRoot 'host.mjs'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$grok = (Get-Command grok -ErrorAction SilentlyContinue).Source

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

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$launcher = Join-Path $installDir 'host.cmd'
$manifestPath = Join-Path $installDir "$hostName.json"

@(
  '@echo off'
  "set GROK_BIN=$grok"
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
Write-Output 'Reload the unpacked extension, then click Test in Link Preview.'
