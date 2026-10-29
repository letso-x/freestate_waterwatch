param([switch]$RevealToken)
$ErrorActionPreference = 'Stop'
# Run locally: creates a 256-bit demo operator key in the Windows user environment.
# It is never placed in a VITE_ variable or repository file.
$operatorKey = [Environment]::GetEnvironmentVariable('Operator__ApiKey', 'User')
if ([string]::IsNullOrWhiteSpace($operatorKey)) {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    $operatorKey = [BitConverter]::ToString($bytes).Replace('-', '')
    [Environment]::SetEnvironmentVariable('Operator__ApiKey', $operatorKey, 'User')
}
[Environment]::SetEnvironmentVariable('Operator__Identifier', 'demo-operator', 'User')
$env:Operator__ApiKey = $operatorKey
$env:Operator__Identifier = 'demo-operator'
Write-Output 'Demo operator configured. Restart the API after changing this setting.'
if ($RevealToken) { Write-Output $operatorKey }
