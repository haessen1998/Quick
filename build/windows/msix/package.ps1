[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ExecutablePath,

    [Parameter(Mandatory = $true)]
    [string] $OutputPath,

    [string] $IdentityName = "haessen.QuickDev",

    [string] $Publisher = "CN=248AC9D1-95E3-40D3-B8EF-1D38B72432B7",

    [Parameter(Mandatory = $true)]
    [string] $Version,

    [string] $MakeAppxPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Resolve-PackageVersion {
    param([string] $Value)

    $parts = @($Value.Split("."))
    if ($parts.Count -lt 1 -or $parts.Count -gt 4) {
        throw "MSIX version must contain one to four numeric parts: $Value"
    }

    while ($parts.Count -lt 4) {
        $parts += "0"
    }

    foreach ($part in $parts) {
        [uint16] $number = 0
        if (-not [uint16]::TryParse($part, [ref] $number)) {
            throw "Each MSIX version part must be between 0 and 65535: $Value"
        }
    }

    return $parts -join "."
}

function Resolve-MakeAppx {
    param([string] $RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    $sdkRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
    $candidate = Get-ChildItem -LiteralPath $sdkRoot -Filter MakeAppx.exe -Recurse -ErrorAction SilentlyContinue |
        Where-Object FullName -Match '\\x64\\MakeAppx\.exe$' |
        Sort-Object FullName -Descending |
        Select-Object -First 1

    if (-not $candidate) {
        throw "MakeAppx.exe was not found. Install the Windows 10/11 SDK."
    }

    return $candidate.FullName
}

function Write-LogoAsset {
    param(
        [System.Drawing.Bitmap] $Source,
        [int] $Width,
        [int] $Height,
        [string] $Path
    )

    $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

        $targetSize = [Math]::Max(1, [Math]::Min($Width, $Height))
        $x = [int](($Width - $targetSize) / 2)
        $y = [int](($Height - $targetSize) / 2)
        $graphics.DrawImage($Source, $x, $y, $targetSize, $targetSize)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
    throw "Windows executable not found: $ExecutablePath"
}
if ([string]::IsNullOrWhiteSpace($IdentityName) -or $IdentityName.Contains("__")) {
    throw "IdentityName must be copied from Partner Center"
}
if ([string]::IsNullOrWhiteSpace($Publisher) -or $Publisher.Contains("__")) {
    throw "Publisher must be copied from Partner Center"
}

$packageVersion = Resolve-PackageVersion $Version
$makeAppx = Resolve-MakeAppx $MakeAppxPath
$manifestTemplate = Join-Path $PSScriptRoot "app_manifest.xml"
$windowsBuildDirectory = Split-Path $PSScriptRoot -Parent
$buildDirectory = Split-Path $windowsBuildDirectory -Parent
$sourceImagePath = Join-Path $buildDirectory "appicon.png"
$executable = (Resolve-Path -LiteralPath $ExecutablePath).Path
$output = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path $output -Parent

if (-not (Test-Path -LiteralPath $manifestTemplate -PathType Leaf)) {
    throw "MSIX manifest template not found: $manifestTemplate"
}
if (-not (Test-Path -LiteralPath $sourceImagePath -PathType Leaf)) {
    throw "Application icon not found: $sourceImagePath"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stageRoot = Join-Path $tempRoot ("quick-msix-" + [Guid]::NewGuid().ToString("N"))
$unpackRoot = Join-Path $tempRoot ("quick-msix-check-" + [Guid]::NewGuid().ToString("N"))
foreach ($path in @($stageRoot, $unpackRoot)) {
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to use a staging directory outside the system temp folder: $resolved"
    }
}

try {
    $assetsDirectory = Join-Path $stageRoot "Assets"
    New-Item -ItemType Directory -Path $assetsDirectory -Force | Out-Null
    Copy-Item -LiteralPath $executable -Destination (Join-Path $stageRoot "quick.exe")

    $manifest = Get-Content -Raw -LiteralPath $manifestTemplate
    $manifest = $manifest.Replace(
        "__STORE_IDENTITY_NAME__",
        [System.Security.SecurityElement]::Escape($IdentityName)
    )
    $manifest = $manifest.Replace(
        "__STORE_PUBLISHER__",
        [System.Security.SecurityElement]::Escape($Publisher)
    )
    $manifest = $manifest.Replace("__PACKAGE_VERSION__", $packageVersion)
    [xml] $manifestXml = $manifest
    [IO.File]::WriteAllText(
        (Join-Path $stageRoot "AppxManifest.xml"),
        $manifestXml.OuterXml,
        [Text.UTF8Encoding]::new($false)
    )

    $sourceBitmap = [System.Drawing.Bitmap]::new($sourceImagePath)
    try {
        Write-LogoAsset $sourceBitmap 50 50 (Join-Path $assetsDirectory "StoreLogo.png")
        Write-LogoAsset $sourceBitmap 44 44 (Join-Path $assetsDirectory "Square44x44Logo.png")
        Write-LogoAsset $sourceBitmap 150 150 (Join-Path $assetsDirectory "Square150x150Logo.png")
    }
    finally {
        $sourceBitmap.Dispose()
    }

    if (Test-Path -LiteralPath $output) {
        Remove-Item -LiteralPath $output -Force
    }

    & $makeAppx pack /d $stageRoot /p $output /o
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output -PathType Leaf)) {
        throw "MakeAppx failed to create the MSIX package"
    }

    & $makeAppx unpack /p $output /d $unpackRoot /o
    if ($LASTEXITCODE -ne 0) {
        throw "MakeAppx could not unpack the generated MSIX package"
    }

    [xml] $packedManifest = Get-Content -Raw -LiteralPath (Join-Path $unpackRoot "AppxManifest.xml")
    $identity = $packedManifest.Package.Identity
    if ($identity.Name -ne $IdentityName -or $identity.Publisher -ne $Publisher -or $identity.Version -ne $packageVersion) {
        throw "Generated package identity does not match the requested Microsoft Store identity"
    }

    Write-Host "Created unsigned Microsoft Store package: $output"
    Write-Host "Package identity: $IdentityName"
    Write-Host "Publisher: $Publisher"
    Write-Host "Version: $packageVersion"
}
finally {
    foreach ($path in @($stageRoot, $unpackRoot)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}
