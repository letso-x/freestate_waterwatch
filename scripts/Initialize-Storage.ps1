# Run from the repository root. Saves only the generated signing secret, never prints credentials.
$ErrorActionPreference='Stop'
foreach ($name in @('Storage__SupabaseUrl','Storage__ServiceRoleKey','Storage__UploadCapabilityKey')) {
    if (-not [Environment]::GetEnvironmentVariable($name,'Process')) {
        [Environment]::SetEnvironmentVariable($name,[Environment]::GetEnvironmentVariable($name,'User'),'Process')
    }
}
if (-not $env:Storage__SupabaseUrl -or -not $env:Storage__ServiceRoleKey) { throw 'Set Storage__SupabaseUrl and Storage__ServiceRoleKey in the Windows user environment first.' }
if (-not $env:Storage__UploadCapabilityKey) {
    $random=[System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $bytes=New-Object byte[] 32; $random.GetBytes($bytes) } finally { $random.Dispose() }
    $env:Storage__UploadCapabilityKey=[BitConverter]::ToString($bytes).Replace('-','')
    [Environment]::SetEnvironmentVariable('Storage__UploadCapabilityKey',$env:Storage__UploadCapabilityKey,'User')
}
if ($env:Storage__UploadCapabilityKey.Length -lt 32) { throw 'The upload signing key must have at least 32 characters.' }
Write-Output 'Storage settings loaded and resident upload signing key ready. No credentials were printed.'
