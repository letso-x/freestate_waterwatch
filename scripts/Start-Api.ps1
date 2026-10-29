# Run from the repository root. Imports saved Windows user settings without printing them.
foreach ($settingName in @('ConnectionStrings__WaterWatch','Operator__ApiKey','Operator__Identifier')) {
    if (-not [Environment]::GetEnvironmentVariable($settingName, 'Process')) {
        [Environment]::SetEnvironmentVariable($settingName, [Environment]::GetEnvironmentVariable($settingName, 'User'), 'Process')
    }
}
dotnet run --project src/WaterWatch.Api --launch-profile http
