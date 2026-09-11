[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Invoke-GitStrict {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & git -C $Repository @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Git falhou em $($Repository): $($Arguments -join ' ')"
    }
    return (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

$canonical = 'C:\OLLI_REL'
$hub = 'C:\Users\ADMIN\Desktop\OLLI - CENTRAL DO PROJETO'
$driveRoot = 'C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS'
$oldHub = 'C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS V1'
$duplicateOld = 'C:\Users\ADMIN\Desktop\2 PESSOAL\OLLI ORCAMENTOS V1'
$duplicateArchive = 'C:\Users\ADMIN\Desktop\_Arquivo OLLI\HUB OLLI DUPLICADO ESTATICO 2026-08-30'
$zipOld = 'C:\Users\ADMIN\Desktop\2 PESSOAL\OLLI ORCAMENTOS V1 zipp.zip'
$zipArchive = 'C:\Users\ADMIN\Desktop\_Arquivo OLLI\HUB OLLI DUPLICADO ESTATICO 2026-08-30.zip'
$manifestPath = Join-Path $PSScriptRoot 'MANIFESTO_RAIZES_OLLI.json'
$driveReadme = Join-Path $driveRoot '00-LEIA-ME-ORGANIZACAO.md'
$hubValidator = Join-Path $hub '00_ADMIN\VALIDAR_HUB.ps1'

Assert-True (Test-Path -LiteralPath $canonical -PathType Container) 'Repositório canônico ausente.'
Assert-True (Test-Path -LiteralPath $hub -PathType Container) 'Hub central ausente.'
Assert-True (Test-Path -LiteralPath $driveRoot -PathType Container) 'Raiz Drive ausente.'
Assert-True (Test-Path -LiteralPath (Join-Path $driveRoot '.tmp.driveupload')) 'Marcador do Drive ausente.'
Assert-True (-not (Test-Path -LiteralPath $oldHub)) 'O nome antigo do hub voltou a existir.'
Assert-True (-not (Test-Path -LiteralPath $duplicateOld)) 'A cópia estática voltou a competir em 2 PESSOAL.'
Assert-True (Test-Path -LiteralPath $duplicateArchive -PathType Container) 'Cópia estática arquivada ausente.'
Assert-True (-not (Test-Path -LiteralPath $zipOld)) 'O ZIP antigo voltou a competir em 2 PESSOAL.'
Assert-True (Test-Path -LiteralPath $zipArchive -PathType Leaf) 'ZIP arquivado ausente.'

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
Assert-True ($manifest.canonicalRepository -eq $canonical) 'Manifesto aponta outro canônico.'
Assert-True ($manifest.centralHub -eq $hub) 'Manifesto aponta outro hub.'
$editable = @($manifest.roots | Where-Object { $_.editable })
Assert-True ($editable.Count -eq 1) 'Deve existir exatamente uma raiz editável.'
Assert-True ($editable[0].path -eq $canonical) 'A única raiz editável deve ser C:\OLLI_REL.'

$branch = Invoke-GitStrict -Repository $canonical -Arguments @('branch', '--show-current')
$head = Invoke-GitStrict -Repository $canonical -Arguments @('rev-parse', 'HEAD')
$top = Invoke-GitStrict -Repository $canonical -Arguments @('rev-parse', '--show-toplevel')
Assert-True ($branch -eq 'main') "Branch canônica inesperada: $branch"
Assert-True ([IO.Path]::GetFullPath($top).TrimEnd('\') -eq $canonical) 'Git toplevel não é o canônico.'

$driveText = Get-Content -LiteralPath $driveReadme -Raw
Assert-True ($driveText.Contains('CANONICAL_REPOSITORY=C:\OLLI_REL')) 'README do Drive não aponta o canônico.'
Assert-True ($driveText.Contains('DRIVE_ROLE=HISTORICAL_NON_CANONICAL')) 'README do Drive não declara seu papel histórico.'

Assert-True (Test-Path -LiteralPath $hubValidator -PathType Leaf) 'Validador do hub ausente.'
& powershell -NoProfile -ExecutionPolicy Bypass -File $hubValidator
if ($LASTEXITCODE -ne 0) {
    throw "Validador do hub falhou com exit code $LASTEXITCODE."
}

$summary = [pscustomobject]@{
    Ok = $true
    Canonical = $canonical
    Branch = $branch
    Head = $head
    Hub = $hub
    DriveMarkerIntact = $true
    EditableRoots = $editable.Count
    StaticDuplicateArchived = $true
    ZipArchived = $true
}

$summary | Format-List
exit 0
