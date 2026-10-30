# Saves a generated server/bridge credential without printing it. Run on the API/bridge laptop.
$ErrorActionPreference = 'Stop'
$telemetryCredential = [Environment]::GetEnvironmentVariable('Telemetry__IngestionKey', 'User')
if ([string]::IsNullOrWhiteSpace($telemetryCredential)) {
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $bytes = New-Object byte[] 32; $random.GetBytes($bytes) } finally { $random.Dispose() }
    $telemetryCredential = [BitConverter]::ToString($bytes).Replace('-', '')
    [Environment]::SetEnvironmentVariable('Telemetry__IngestionKey', $telemetryCredential, 'User')
}
if ($telemetryCredential.Length -lt 32) { throw 'The saved ingestion credential must contain at least 32 characters.' }
[Environment]::SetEnvironmentVariable('Bridge__IngestionKey', $telemetryCredential, 'User')
Write-Output 'Telemetry credential saved for the API and bridge. Restart them to load it.'
