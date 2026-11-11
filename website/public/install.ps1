# Tokly installer for Windows 10 and later (64-bit).
#
#   irm https://tokly.blackielabs.com/install.ps1 | iex
#
# Downloads the newest Tokly setup program from GitHub, checks its SHA-256 and
# runs it for the current user (no administrator rights needed).
# Read it before you run it: https://tokly.blackielabs.com/install.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$repo = 'Blackie360/Tokly'

if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'Tokly needs 64-bit Windows.'
}

Write-Host 'Looking up the newest Tokly release...'
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=20" -Headers @{ 'User-Agent' = 'tokly-installer' }
$asset = $releases | ForEach-Object { $_.assets } | Where-Object { $_.name -like '*windows-x64-setup.exe' } | Select-Object -First 1
if (-not $asset) {
    throw "No Windows release found at https://github.com/$repo/releases"
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("tokly-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $file = Join-Path $work $asset.name
    Write-Host "Downloading $($asset.name)..."
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing
    $checksum = (Invoke-WebRequest -Uri "$($asset.browser_download_url).sha256" -UseBasicParsing).Content
    if ($checksum -is [byte[]]) { $checksum = [Text.Encoding]::UTF8.GetString($checksum) }
    $expected = ($checksum.Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        throw 'Checksum mismatch; the download was not installed.'
    }
    Write-Host 'Checksum verified. Installing...'

    $setup = Start-Process -FilePath $file -ArgumentList '/S' -Wait -PassThru
    if ($setup.ExitCode -ne 0) {
        throw "The installer exited with code $($setup.ExitCode)."
    }
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Tokly is installed. Start it from the Start menu.'
Write-Host 'It lives in the system tray; Alt+Shift+C opens the history.'
Write-Host 'To remove it later, use Settings > Apps > Installed apps.'
