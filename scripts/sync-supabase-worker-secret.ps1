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

$supabaseAccessToken = ''
foreach ($line in Get-Content -LiteralPath $CredentialsFile) {
  $match = [regex]::Match($line, '^SUPABASE_ACCESS_TOKEN=(.*)$')
  if (-not $match.Success) { continue }
  $supabaseAccessToken = $match.Groups[1].Value.Trim()
  if ($supabaseAccessToken.Length -ge 2 -and
      $supabaseAccessToken[0] -eq $supabaseAccessToken[$supabaseAccessToken.Length - 1] -and
      ($supabaseAccessToken[0] -eq '"' -or $supabaseAccessToken[0] -eq "'")) {
    $supabaseAccessToken = $supabaseAccessToken.Substring(1, $supabaseAccessToken.Length - 2)
  }
}

if ([string]::IsNullOrWhiteSpace($supabaseAccessToken)) {
  throw 'SUPABASE_ACCESS_TOKEN nao esta configurado no cofre local.'
}

$keysEndpoint = "https://api.supabase.com/v1/projects/$ProjectRef/api-keys?reveal=true"
$keys = Invoke-RestMethod -Method Get -Uri $keysEndpoint -Headers @{
  Authorization = "Bearer $supabaseAccessToken"
}

$serviceEntry = @($keys | Where-Object {
  $_.name -eq 'service_role' -and -not [string]::IsNullOrWhiteSpace($_.api_key)
}) | Select-Object -First 1

if (-not $serviceEntry) {
  throw 'A Management API nao devolveu a chave legacy service_role atual.'
}

$serviceKey = [string]$serviceEntry.api_key
$probeUri = "https://$ProjectRef.supabase.co/rest/v1/assinaturas?select=plano,status,current_period_end&limit=1"
$probe = Invoke-WebRequest -Method Get -Uri $probeUri -Headers @{
  apikey = $serviceKey
  Authorization = "Bearer $serviceKey"
} -TimeoutSec 30

if ($probe.StatusCode -ne 200) {
  throw 'A chave atual do Supabase nao passou no canario REST service_role.'
}

Write-Output 'Chave service_role atual do Supabase validada por canario REST.'

if (-not $Apply) {
  $serviceKey = ''
  Write-Output 'Somente leitura concluida. Use -Apply para sincronizar o segredo do Worker.'
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$workerRoot = Join-Path $repoRoot 'worker'
$wranglerCli = Join-Path $workerRoot 'node_modules\wrangler\bin\wrangler.js'
if (-not (Test-Path -LiteralPath $wranglerCli)) {
  throw 'O Wrangler local do Worker nao foi encontrado.'
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $nodePath
$startInfo.WorkingDirectory = $workerRoot
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true
$startInfo.ArgumentList.Add($wranglerCli)
$startInfo.ArgumentList.Add('secret')
$startInfo.ArgumentList.Add('put')
$startInfo.ArgumentList.Add('SUPABASE_SERVICE_ROLE_KEY')

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$null = $process.Start()
$process.StandardInput.WriteLine($serviceKey)
$process.StandardInput.Close()
$serviceKey = ''
$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -ne 0) {
  throw "O Wrangler nao sincronizou o segredo (codigo $($process.ExitCode))."
}

Write-Output 'SUPABASE_SERVICE_ROLE_KEY sincronizada no Worker sem expor o valor.'
