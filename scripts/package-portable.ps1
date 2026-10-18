$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$releaseRoot = Join-Path $projectRoot 'release'
$metadata = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $metadata.shortVersion
if ($version -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$' -or $version -ne ($metadata.version -replace '\+revision\.', '.')) { throw 'Invalid release version' }
$payloadRoot = (Resolve-Path -LiteralPath (Join-Path $releaseRoot 'win-unpacked')).Path
if ((Split-Path $payloadRoot -Parent) -ne $releaseRoot) { throw 'Invalid payload directory' }
$zipPath = Join-Path $releaseRoot "DirectorDesk-Portable-$version-win-x64.zip"
$tempPath = "$zipPath.tmp"
if (Test-Path -LiteralPath $tempPath) { throw 'Previous ZIP staging file exists; inspect it before retrying' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($tempPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $marker = $archive.CreateEntry("DirectorDesk-$version/portable.json")
    $writer = [IO.StreamWriter]::new($marker.Open())
    try { $writer.Write('{"portable":true}') } finally { $writer.Dispose() }
    foreach ($file in Get-ChildItem -LiteralPath $payloadRoot -File -Recurse) {
        if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point in payload' }
        $relative = $file.FullName.Substring($payloadRoot.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, "DirectorDesk-$version/$relative", [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    $notes = Get-Item -LiteralPath (Join-Path $releaseRoot "DirectorDesk-$version-README.txt")
    if (@($notes).Count -ne 1) { throw 'Expected one release notes file' }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $notes.FullName, "DirectorDesk-$version/README.txt", [IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally { $archive.Dispose() }
Move-Item -LiteralPath $tempPath -Destination $zipPath -Force
Get-Item -LiteralPath $zipPath | Select-Object Name, Length
