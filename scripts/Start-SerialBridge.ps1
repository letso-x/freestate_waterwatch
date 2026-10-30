# Run from the repository root. Configure the non-secret Bridge settings first; see docs/TASK4_TELEMETRY.md.
$ErrorActionPreference = 'Stop'
foreach ($settingName in @('Bridge__IngestionKey','Bridge__ComPort','Bridge__BaudRate','Bridge__ApiUrl','Bridge__SensorKey','Bridge__MeasurementType','Bridge__Unit','Bridge__Minimum','Bridge__Maximum','Bridge__DtrEnable')) {
    if (-not [Environment]::GetEnvironmentVariable($settingName, 'Process')) {
        [Environment]::SetEnvironmentVariable($settingName, [Environment]::GetEnvironmentVariable($settingName, 'User'), 'Process')
    }
}
dotnet run --project src/WaterWatch.SerialBridge
