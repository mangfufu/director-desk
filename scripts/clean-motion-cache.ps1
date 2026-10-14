[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param()

$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packagePath = Join-Path $workspacePath 'package.json'
if (!(Test-Path -LiteralPath $packagePath) -or
    (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).name -ne 'director-desk') {
    throw 'Run this script from the director-desk scripts directory.'
}

# Only disposable outputs from the motion-library work and Vite's local caches.
# Keep .local, .audit/desktop-app, dist, release, projects, assets and user libraries.
$relativePaths = @(
    'node_modules\.vite',
    'node_modules\.vite-temp',
    'output\playwright\motion-library',
    'tmp\review\motion-desktop.mjs',
    'tmp\review\measure-motion-drag.mjs',
    'tmp\review\motion-drag-baseline.json'
)
$testRoot = Join-Path $workspacePath 'tmp'
if (Test-Path -LiteralPath $testRoot) {
    if ((Get-Item -LiteralPath $testRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Refusing a linked test directory.'
    }
    $relativePaths += Get-ChildItem -LiteralPath $testRoot -Directory -Filter 'motion-desktop-*' |
        ForEach-Object { 'tmp\' + $_.Name }
}

$removed = 0
$failed = 0
$freedBytes = 0L
foreach ($relativePath in $relativePaths) {
    $targetPath = [IO.Path]::GetFullPath((Join-Path $workspacePath $relativePath))
    if (!$targetPath.StartsWith($workspacePath + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target is outside the project: $relativePath"
    }
    if (!(Test-Path -LiteralPath $targetPath)) { continue }
    try {
        # Check parents as well as the target: an apparent in-project path may
        # otherwise traverse a junction into a different directory.
        $ancestorPath = $targetPath
        while ($ancestorPath -ne $workspacePath) {
            if ((Get-Item -LiteralPath $ancestorPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'Linked paths are not eligible for cleanup.'
            }
            $ancestorPath = [IO.Path]::GetDirectoryName($ancestorPath)
        }
        $item = Get-Item -LiteralPath $targetPath -Force
        $contents = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $targetPath -Recurse -Force) } else { @($item) }
        if ($contents | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
            throw 'Directory contains a linked item; skipped.'
        }
        $bytes = ($contents | Where-Object { !$_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum
        if ($PSCmdlet.ShouldProcess($relativePath, 'Delete disposable cache')) {
            Remove-Item -LiteralPath $targetPath -Recurse -Force
            $removed++
            $freedBytes += $bytes
            Write-Host "Removed: $relativePath"
        }
    } catch {
        $failed++
        Write-Warning "Skipped $relativePath : $($_.Exception.Message)"
    }
}
Write-Host ("Done. Removed {0} targets, freed {1:N1} MB. Skipped {2}." -f $removed, ($freedBytes / 1MB), $failed)
if ($failed) { Write-Host 'Close any development server or test process using these files, then retry.'; exit 1 }
