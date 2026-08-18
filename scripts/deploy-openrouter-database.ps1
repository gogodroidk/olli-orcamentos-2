param(
  [switch]$Apply,
  [string]$CredentialsFile = 'C:\Users\ADMIN\Desktop\CONFIG CLAUDE\credenciais-locais.env',
  [string]$ProjectRef = 'yiaeplqinnnnniyvwtls'
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

$accessToken = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Process')
if ([string]::IsNullOrWhiteSpace($accessToken)) {
  throw 'SUPABASE_ACCESS_TOKEN nao esta configurado no cofre local.'
}

$endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$headers = @{
  Authorization = "Bearer $accessToken"
  'Content-Type' = 'application/json'
}

function Invoke-DatabaseQuery([string]$Sql) {
  $body = @{ query = $Sql } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $body
}

$preflightSql = @'
select
  to_regclass('public.ia_uso_gratis') is not null as tem_ia_uso_gratis,
  to_regclass('public.credit_ledger') is not null as tem_credit_ledger,
  to_regclass('public.ia_cota_global_diaria') is not null as nova_cota_global,
  to_regclass('public.ia_cota_usuario_diaria') is not null as nova_cota_usuario,
  to_regclass('public.ia_cota_reservas') is not null as novas_reservas,
  to_regprocedure('public.reservar_cota_ia_diaria(uuid,text,text,integer,integer,integer)') is not null as rpc_reserva,
  to_regprocedure('public.consumir_creditos_atomico(uuid,integer,text,text)') is not null as rpc_creditos;
'@

$preflight = @(Invoke-DatabaseQuery $preflightSql)
if ($preflight.Count -ne 1) {
  throw 'O Supabase nao devolveu um resultado de preflight reconhecido.'
}

$state = $preflight[0]
Write-Output ('Preflight Supabase: ' + ($state | ConvertTo-Json -Compress))

if (-not $state.tem_ia_uso_gratis -or -not $state.tem_credit_ledger) {
  throw 'As tabelas comerciais anteriores nao existem; a migração nova nao sera aplicada.'
}

if (-not $Apply) {
  Write-Output 'Somente leitura concluida. Use -Apply para aplicar a migracao transacional.'
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$migrationPath = Join-Path $repoRoot 'supabase\migrations\20260817_openrouter_quota_diaria.sql'
if (-not (Test-Path -LiteralPath $migrationPath)) {
  throw 'O arquivo versionado da migracao OpenRouter nao foi encontrado.'
}

$migrationSql = Get-Content -LiteralPath $migrationPath -Raw
$transactionalSql = "begin;`n$migrationSql`ncommit;"
$null = Invoke-DatabaseQuery $transactionalSql

$verificationSql = @'
select
  bool_and(c.relrowsecurity and c.relforcerowsecurity) as rls_forcada,
  count(*) = 3 as tres_tabelas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ia_cota_global_diaria', 'ia_cota_usuario_diaria', 'ia_cota_reservas');
'@

$functionVerificationSql = @'
select
  to_regprocedure('public.reservar_cota_ia_diaria(uuid,text,text,integer,integer,integer)') is not null as rpc_reserva,
  to_regprocedure('public.consumir_cota_ia(uuid,text,text,integer)') is not null as rpc_mensal,
  to_regprocedure('public.consumir_creditos_atomico(uuid,integer,text,text)') is not null as rpc_creditos,
  not has_function_privilege('anon', 'public.reservar_cota_ia_diaria(uuid,text,text,integer,integer,integer)', 'EXECUTE') as anon_bloqueado,
  not has_function_privilege('authenticated', 'public.reservar_cota_ia_diaria(uuid,text,text,integer,integer,integer)', 'EXECUTE') as usuario_bloqueado,
  has_function_privilege('service_role', 'public.reservar_cota_ia_diaria(uuid,text,text,integer,integer,integer)', 'EXECUTE') as service_role_liberada;
'@

$tableVerification = @(Invoke-DatabaseQuery $verificationSql)
$functionVerification = @(Invoke-DatabaseQuery $functionVerificationSql)
if ($tableVerification.Count -ne 1 -or $functionVerification.Count -ne 1) {
  throw 'A verificacao pos-migracao nao devolveu o formato esperado.'
}

$tablesOk = $tableVerification[0].rls_forcada -and $tableVerification[0].tres_tabelas
$functionsOk = $functionVerification[0].rpc_reserva -and
  $functionVerification[0].rpc_mensal -and
  $functionVerification[0].rpc_creditos -and
  $functionVerification[0].anon_bloqueado -and
  $functionVerification[0].usuario_bloqueado -and
  $functionVerification[0].service_role_liberada

if (-not $tablesOk -or -not $functionsOk) {
  throw 'A migracao foi aplicada, mas a verificacao de RLS ou permissoes nao passou.'
}

Write-Output 'Migracao OpenRouter aplicada e verificada: 3 tabelas com RLS forcada e RPCs restritas ao service_role.'
