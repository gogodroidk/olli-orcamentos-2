param(
  [string]$CredentialsFile = 'C:\Users\ADMIN\Desktop\CONFIG CLAUDE\credenciais-locais.env'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $CredentialsFile)) {
  throw 'O arquivo local de credenciais nao foi encontrado.'
}

foreach ($line in Get-Content -LiteralPath $CredentialsFile) {
  $match = [regex]::Match($line, '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
  if (-not $match.Success) { continue }

  $name = $match.Groups[1].Value
  $value = $match.Groups[2].Value.Trim()
  if ($value.Length -ge 2) {
    $quotedWithDouble = $value.StartsWith('"') -and $value.EndsWith('"')
    $quotedWithSingle = $value.StartsWith("'") -and $value.EndsWith("'")
    if ($quotedWithDouble -or $quotedWithSingle) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$required = @(
  'OLLI_UPLOAD_KEYSTORE_PATH',
  'OLLI_UPLOAD_KEYSTORE_ALIAS',
  'OLLI_UPLOAD_KEYSTORE_PASSWORD',
  'OLLI_UPLOAD_KEY_PASSWORD'
)

$missing = $required | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
}
if ($missing) {
  throw 'A configuracao local da assinatura de producao esta incompleta.'
}

$keystorePath = [Environment]::GetEnvironmentVariable('OLLI_UPLOAD_KEYSTORE_PATH', 'Process')
$keystoreAlias = [Environment]::GetEnvironmentVariable('OLLI_UPLOAD_KEYSTORE_ALIAS', 'Process')
if (-not (Test-Path -LiteralPath $keystorePath)) {
  throw 'O arquivo da assinatura de producao nao existe no caminho configurado.'
}

$keyInfo = & keytool -list -keystore $keystorePath -alias $keystoreAlias -storepass:env OLLI_UPLOAD_KEYSTORE_PASSWORD 2>&1
if ($LASTEXITCODE -ne 0) {
  $safeError = $keyInfo -join ' '
  foreach ($secretName in $required) {
    $secretValue = [Environment]::GetEnvironmentVariable($secretName, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($secretValue)) {
      $safeError = $safeError.Replace($secretValue, '[OCULTO]')
    }
  }
  throw "Nao foi possivel validar a chave: $safeError"
}

$certificateFile = [System.IO.Path]::GetTempFileName()
try {
  $null = & keytool -exportcert -keystore $keystorePath -alias $keystoreAlias -storepass:env OLLI_UPLOAD_KEYSTORE_PASSWORD -file $certificateFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel exportar o certificado publico para validar sua identidade.'
  }

  foreach ($fingerprint in @(
    @{ Name = 'OLLI_UPLOAD_KEYSTORE_SHA1'; Algorithm = 'SHA1' },
    @{ Name = 'OLLI_UPLOAD_KEYSTORE_SHA256'; Algorithm = 'SHA256' }
  )) {
    $expected = [Environment]::GetEnvironmentVariable($fingerprint.Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($expected)) { continue }
    $expected = ($expected -replace ':', '' -replace '\s', '').ToUpperInvariant()
    $actual = (Get-FileHash -LiteralPath $certificateFile -Algorithm $fingerprint.Algorithm).Hash.ToUpperInvariant()
    if ($actual -ne $expected) {
      throw "A identidade $($fingerprint.Name) da chave nao confere com o cofre local."
    }
  }
} finally {
  Remove-Item -LiteralPath $certificateFile -Force -ErrorAction SilentlyContinue
}

Write-Output 'Chave de producao validada: arquivo, alias e identidades conferem.'

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $repoRoot 'android'
$output = Join-Path $androidRoot 'app\build\outputs\bundle\release\app-release.aab'
if (Test-Path -LiteralPath $output) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = Join-Path (Split-Path -Parent $output) "app-release-prior-build-do-not-upload-$stamp.aab"
  Move-Item -LiteralPath $output -Destination $backup
}

[Environment]::SetEnvironmentVariable('SENTRY_DISABLE_AUTO_UPLOAD', 'true', 'Process')
[Environment]::SetEnvironmentVariable('NODE_ENV', 'production', 'Process')

Push-Location $androidRoot
try {
  & .\gradlew.bat --no-daemon bundleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "O Gradle encerrou com codigo $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $output)) {
  throw 'A compilacao terminou sem produzir o arquivo AAB esperado.'
}

$signatureCheck = & jarsigner -verify -strict -keystore $keystorePath -storepass:env OLLI_UPLOAD_KEYSTORE_PASSWORD $output $keystoreAlias 2>&1
if ($LASTEXITCODE -ne 0) {
  throw 'O AAB foi criado, mas a assinatura final nao corresponde a chave oficial do OLLI.'
}

Write-Output 'Assinatura final do AAB confirmada com a chave oficial do OLLI.'
Write-Output "AAB de producao criado em: $output"
