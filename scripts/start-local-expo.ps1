# Run interactively on this PC. Secrets are entered locally and never printed.
[CmdletBinding()]
param(
    [ValidateSet('Local', 'NamedTunnel', 'QuickTunnel')]
    [string]$Mode = 'Local',
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'docker-compose.local-host.yml'
$localDirectory = Join-Path $repoRoot '.tmp/local-host'
$backendEnvPath = Join-Path $localDirectory 'backend.env'
$tokenPath = Join-Path $localDirectory 'tunnel-token'
$projectUrl = 'https://fnvifghuszodpjtzemiw.supabase.co'
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Read-EnvFile([string]$FilePath) {
    $values = [ordered]@{}
    if (Test-Path -LiteralPath $FilePath) {
        foreach ($line in [System.IO.File]::ReadAllLines($FilePath)) {
            if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
                $values[$Matches[1]] = $Matches[2].Trim()
            }
        }
    }
    return $values
}

function Read-LocalSecret([string]$Prompt) {
    $secureValue = Read-Host -Prompt $Prompt -AsSecureString
    $plainValue = [System.Net.NetworkCredential]::new('', $secureValue).Password.Trim()
    if ([string]::IsNullOrWhiteSpace($plainValue) -or $plainValue -match '[\r\n]' -or $plainValue -match 'REPLACE|YOUR-|ci-public') {
        throw 'A real single-line credential is required. Enter it only in this local terminal.'
    }
    return $plainValue
}

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCommand) {
    $dockerPath = $dockerCommand.Source
} else {
    $dockerPath = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
}
if (-not (Test-Path -LiteralPath $dockerPath)) {
    throw 'Docker Desktop is required. Install/start it in Linux-container mode first.'
}
# A missing engine is a setup issue, not a reason to alter unrelated containers.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$engineVersion = & $dockerPath info --format '{{.ServerVersion}}' 2>$null
$engineExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
if ($engineExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($engineVersion)) {
    throw 'Open Docker Desktop, complete its setup and wait for Engine running, then run this script again.'
}

[System.IO.Directory]::CreateDirectory($localDirectory) | Out-Null
$backendEnv = Read-EnvFile $backendEnvPath
if ($backendEnv.Contains('SUPABASE_URL') -and $backendEnv['SUPABASE_URL'] -ne $projectUrl) {
    throw 'This helper is scoped to the new ghocoy-expo-free project. Existing other-project settings were preserved.'
}
$backendEnv['SUPABASE_URL'] = $projectUrl
if (-not $backendEnv.Contains('SUPABASE_ANON_KEY') -or [string]::IsNullOrWhiteSpace($backendEnv['SUPABASE_ANON_KEY'])) {
    $publicEnv = Read-EnvFile (Join-Path $repoRoot '.tmp/free-stack-supabase-public.env')
    if ($publicEnv.Contains('VITE_SUPABASE_URL') -and $publicEnv['VITE_SUPABASE_URL'] -ne $projectUrl) {
        throw 'The saved public configuration belongs to another project.'
    }
    if ($publicEnv.Contains('VITE_SUPABASE_ANON_KEY')) {
        $backendEnv['SUPABASE_ANON_KEY'] = $publicEnv['VITE_SUPABASE_ANON_KEY']
    } else {
        $backendEnv['SUPABASE_ANON_KEY'] = Read-Host 'New Supabase project publishable key'
    }
}
if (-not $backendEnv.Contains('SUPABASE_SERVICE_KEY') -or [string]::IsNullOrWhiteSpace($backendEnv['SUPABASE_SERVICE_KEY']) -or $backendEnv['SUPABASE_SERVICE_KEY'] -match 'REPLACE|YOUR-') {
    Write-Host 'Open https://supabase.com/dashboard/project/fnvifghuszodpjtzemiw/settings/api-keys'
    $backendEnv['SUPABASE_SERVICE_KEY'] = Read-LocalSecret 'New project server secret key (hidden input)'
}
if (-not $backendEnv.Contains('BACKEND_CORS_ALLOWED_ORIGINS')) {
    $backendEnv['BACKEND_CORS_ALLOWED_ORIGINS'] = 'https://www.30sek24.com'
}
if (-not $backendEnv.Contains('MODULAR_HOME_QUOTE_PRODUCTION_HOSTS')) {
    $backendEnv['MODULAR_HOME_QUOTE_PRODUCTION_HOSTS'] = 'www.30sek24.com,api-pc.30sek24.com'
}
foreach ($required in @('SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'BACKEND_CORS_ALLOWED_ORIGINS', 'MODULAR_HOME_QUOTE_PRODUCTION_HOSTS')) {
    if ([string]::IsNullOrWhiteSpace($backendEnv[$required]) -or $backendEnv[$required] -match '[\r\n]|REPLACE|YOUR-|example\.invalid|ci-public') {
        throw "Fill a real value for $required locally before starting. Its value will not be printed."
    }
}
$serializedEnv = ($backendEnv.GetEnumerator() | ForEach-Object { '{0}={1}' -f $_.Key, $_.Value }) -join "`n"
[System.IO.File]::WriteAllText($backendEnvPath, $serializedEnv + "`n", $utf8)
Remove-Variable serializedEnv

if ($Mode -eq 'NamedTunnel') {
    if (-not (Test-Path -LiteralPath $tokenPath) -or [string]::IsNullOrWhiteSpace([System.IO.File]::ReadAllText($tokenPath))) {
        Write-Host 'Create the named tunnel in Cloudflare and route api-pc.30sek24.com to HTTP backend:3000.'
        $tunnelToken = Read-LocalSecret 'Cloudflare tunnel token (hidden input)'
        [System.IO.File]::WriteAllText($tokenPath, $tunnelToken, $utf8)
        Remove-Variable tunnelToken
    }
}

$composeArguments = @('compose', '--env-file', $backendEnvPath, '-f', $composeFile)
if ($Mode -eq 'NamedTunnel') { $composeArguments += @('--profile', 'named-tunnel') }
if ($Mode -eq 'QuickTunnel') { $composeArguments += @('--profile', 'quick-tunnel') }

function Invoke-LocalCompose([string[]]$CommandArguments) {
    & $dockerPath @composeArguments @CommandArguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed. Review its error; credentials were not printed by this helper.' }
}

Push-Location -LiteralPath $repoRoot
try {
    Invoke-LocalCompose @('config', '--quiet')
    if (-not $SkipBuild) { Invoke-LocalCompose @('build', 'backend') }
    Invoke-LocalCompose @('up', '-d', 'backend', 'redis')
    $healthy = $false
    for ($attempt = 1; $attempt -le 12; $attempt++) {
        try {
            Invoke-RestMethod -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 2 | Out-Null
            $healthy = $true
            break
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $healthy) { throw 'Local API health did not pass. Inspect backend logs before publishing a tunnel.' }
    Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/expo/scene' -TimeoutSec 10 | Out-Null
    Write-Host 'Local API health and public scene HTTP requests passed.'
    if ($Mode -eq 'NamedTunnel') { Invoke-LocalCompose @('up', '-d', 'tunnel') }
    if ($Mode -eq 'QuickTunnel') {
        Invoke-LocalCompose @('up', '-d', 'quick-tunnel')
        Invoke-LocalCompose @('logs', '--tail', '30', 'quick-tunnel')
        Write-Host 'Use the temporary URL for tests only; update the frontend URL and quote host allowlist.'
    }
    Invoke-LocalCompose @('ps')
    Write-Host 'Public DNS, Pages deployment and Auth/CORS/application checks remain separate steps.'
} finally {
    Pop-Location
    Remove-Variable backendEnv -ErrorAction SilentlyContinue
}
