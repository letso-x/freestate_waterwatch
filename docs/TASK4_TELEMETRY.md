# Sensor telemetry and USB serial bridge

## Scope and hardware status

The software path is Arduino USB serial → C# serial bridge → authenticated ASP.NET telemetry ingestion → PostgreSQL → staff Sensor Monitoring. Sensor observations and suspected anomalies use separate tables from resident incidents. Nothing automatically confirms a leak or creates an incident.

**Physical hardware integration is not yet verified.** Software tests use explicitly synthetic measurements or isolated HTTP mocks. A connected Arduino, its USB driver, the correct COM port, a calibrated probe and real measurements are external prerequisites. No synthetic data is seeded into the operational dashboard.

## Start the applications

Run from the repository root in PowerShell. Keep the existing PostgreSQL and staff environment settings. Never put credentials in frontend configuration.

```powershell
dotnet restore WaterWatch.slnx
dotnet tool restore
# Load the saved connection without displaying it, then apply the additive migration.
$env:ConnectionStrings__WaterWatch = [Environment]::GetEnvironmentVariable('ConnectionStrings__WaterWatch', 'User')
dotnet ef database update --project src/WaterWatch.Api
pwsh -File scripts/Initialize-Telemetry.ps1
pwsh -File scripts/Start-Api.ps1
```

In another terminal:

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run dev -- --host 127.0.0.1
```

`frontend/.env` must retain `VITE_API_BASE_URL=http://localhost:5100`. Use the explicitly allowed Vite origin `http://localhost:5173`; existing CORS settings are unchanged. Open `/operations/sensors` directly for local Development on localhost; staff-key entry is no longer required there. Remote access retains staff authentication. See the README’s local development access section. The API remains on port 5100 with the existing launch profile.

## Register and calibrate a sensor

Staff authorization is required for `POST /api/sensors`, `GET /api/sensors` and `GET /api/sensors/{id}/readings`. The bridge's ingestion key cannot access these endpoints or incident management. Registration fixes a sensor's source, measurement type and unit. Unknown sensors cannot self-register through ingestion.

The API's `Telemetry:Types` configuration defines permitted measurement names, units and numeric ranges. Defaults are `soil-moisture-raw` (`adc`, 0–1023) and `soil-moisture-percent` (`%`, 0–100). For a 12-bit ADC, configure `Telemetry__Types__soil-moisture-raw__Maximum=4095` on the server and matching bridge bounds. Raw ADC counts are not moisture percentages. Use percent only after the hardware team provides a calibrated conversion.

Register a physical sensor after measuring its dry baseline and wet response. This example is an **illustrative calibration**, not a validated threshold for your hardware:

```powershell
$staffCredential = [Environment]::GetEnvironmentVariable('Operator__ApiKey', 'User')
$registration = @{
  sensorKey = 'arduino-moisture-01'
  name = 'Moisture probe 01'
  location = 'Replace with the actual installed location'
  measurementType = 'soil-moisture-raw'
  source = 'Physical'
  baseline = 600
  threshold = 300
  minimumDeviation = 150
  direction = 'Below'
  requiredConsecutive = 3
  staleAfterSeconds = 120
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:5100/api/sensors' `
  -Headers @{ Authorization = "Bearer $staffCredential" } -ContentType 'application/json' -Body $registration
Remove-Variable staffCredential
```

Use `Synthetic` for test sensors, with a distinct sensor key and a clearly named test location. Source is provenance declared by the registered integration, not cryptographic proof of physical hardware. Never submit generated values to a physical sensor identity. Calibration is recorded on registration; this sprint does not add a calibration-editing UI or endpoint.

## Arduino serial protocol

Configure the Arduino sketch and bridge to the same baud rate (default 9600), 8 data bits, no parity, one stop bit, no handshake. Emit one ASCII JSON object followed by LF (`\n`); CRLF is also accepted:

```json
{"value":412}
```

Only the numeric `value` property is allowed. No labels, arrays, additional properties, credentials or device identifiers belong in the serial frame. Maximum line length is 256 characters; malformed, oversized and out-of-range lines are discarded without logging their contents. Sample every 5 seconds initially. Arduino boot text is safely ignored.

Minimal sketch fragment for the hardware teammate (pin and range must match the board):

```cpp
void setup() { Serial.begin(9600); }
void loop() {
  int reading = analogRead(A0);
  Serial.print("{\"value\":");
  Serial.print(reading);
  Serial.println("}");
  delay(5000);
}
```

The bridge adds the configured sensor key, measurement type, unit, `Physical` source, a new measurement ID, and the laptop UTC timestamp when it reads the frame. Arduino RTC support is not required. Keep the laptop clock synchronized; this timestamp represents bridge acquisition rather than a clock on the probe. Close Arduino Serial Monitor before starting the bridge: only one process can own the port.

## Configure and run the bridge

`Initialize-Telemetry.ps1` generates a random 256-bit credential if none is saved and stores it as Windows user variables `Telemetry__IngestionKey` (server) and `Bridge__IngestionKey` (bridge), without printing it. Run it once on the local API/bridge laptop, then restart both processes. A remote API must receive the same ingestion key through its own server secret settings; use HTTPS. No secret is bundled in React or written to committed files.

Set the non-secret bridge variables in the terminal that starts it:

```powershell
$env:Bridge__ComPort = 'COM3' # Replace with the port shown in Windows Device Manager.
$env:Bridge__BaudRate = '9600'
$env:Bridge__ApiUrl = 'http://localhost:5100/'
$env:Bridge__SensorKey = 'arduino-moisture-01'
$env:Bridge__MeasurementType = 'soil-moisture-raw'
$env:Bridge__Unit = 'adc'
$env:Bridge__Minimum = '0'
$env:Bridge__Maximum = '1023'
$env:Bridge__DtrEnable = 'false' # Some boards need true; opening the port may reset them.
pwsh -File scripts/Start-SerialBridge.ps1
```

The bridge reconnects every 3 seconds after serial I/O or port-access failures and stops with Ctrl+C. HTTP timeouts, transient server failures and 429 responses get up to five attempts with bounded backoff, reusing the same measurement ID and timestamp. Authentication failures stop the bridge; other permanent HTTP rejections skip that reading. It never prints credentials, HTTP response bodies or raw serial input. Redirects are disabled to protect the ingestion credential. Non-loopback HTTP is rejected.

This is a small online bridge, not a durable offline recorder. Delivery can be unconfirmed if a response is lost. Retries are idempotent, but pending readings are not saved to disk and a long service outage or serial overflow can lose measurements. Reconnection and completed delivery attempts discard queued serial input, avoiding fresh timestamps on an old backlog. Do not use this version where guaranteed sample retention is required.

## API contract

`POST /api/telemetry` requires `Authorization: Bearer <server ingestion credential>` and JSON:

```json
{
  "sensorKey": "arduino-moisture-01",
  "measurementId": "3a713eac-cdf0-453c-927c-f39bf2a7ca38",
  "measurementType": "soil-moisture-raw",
  "value": 412,
  "unit": "adc",
  "timestamp": "2026-10-30T00:00:00Z",
  "source": "Physical"
}
```

Use a fresh actual UTC timestamp, not the static example. Returns 201 with `{reading, duplicate:false}`. Replaying the exact measurement returns 200 with `duplicate:true`, without advancing counters or duplicating alerts. Reusing an identity for different data or sending a distinct out-of-order/equal-time measurement returns 409. Unknown sensor: 404. Invalid/missing fields, unconfigured types, non-finite values, mismatched units/source, readings older than 24 hours or more than 2 minutes ahead: 400. Missing/invalid credentials: 401. Ingestion requires HTTPS outside ASP.NET Development. A missing server key disables ingestion while existing incident functionality remains available.

`GET /api/sensors?page=1&pageSize=50` returns registered sensor summaries with latest values, measured/received UTC times, a staleness interval and any active suspected anomaly. Page size max 100. `GET /api/sensors/{id}/readings?limit=60` returns newest-first measurements; max 200. The dashboard refreshes every 30 seconds, shows a 60-reading chart and the latest 10 rows, and labels physical versus synthetic data. “Receiving readings” means recent timestamps; it does not prove the USB cable is connected.

## Anomaly rule and consistency

Each sensor stores a calibrated baseline, absolute threshold, minimum baseline deviation, direction and required consecutive count (2–100). For `Above`, both `value >= threshold` and `value - baseline >= minimumDeviation` must hold. For `Below`, both `value <= threshold` and `baseline - value >= minimumDeviation` must hold. Bounds are inclusive. The baseline is fixed calibration, not a rolling average.

A normal reading resets the count and marks the active observation recovered. A gap longer than `staleAfterSeconds` resets consecutive evidence; it does not silently clear an existing anomaly. One suspected anomaly is created after the required count. Sustained abnormal readings leave that same anomaly active. A new sequence after a normal recovery may create a new anomaly. Anomalies preserve the calibration used at trigger time.

The reading, sensor state and anomaly are saved atomically. PostgreSQL row locks serialize ingestion per sensor across API instances; a unique partial index permits at most one active anomaly per sensor. A unique sensor/measurement-ID index prevents duplicate readings. Sensor tables have RLS enabled and no direct Supabase `anon`/`authenticated` grants, matching the existing backend-only access model. Earlier migrations and incident history are unchanged.

## Verify physical integration with the hardware teammate

1. Register the calibrated physical sensor and start all three applications. Keep the ingestion key out of browser tools and screenshots.
2. Connect the Arduino, select its actual port and confirm the bridge reports accepted measurements.
3. In Sensor Monitoring, verify the physical source, value, unit, recent UTC/SAST timestamps and chart against the serial measurements. `GET /api/sensors/{id}/readings` must match PostgreSQL rows.
4. Introduce a controlled moisture change appropriate to the probe. After the configured consecutive readings, verify exactly one suspected anomaly, and verify no confirmed-leak incident was created.
5. Hold the abnormal condition and check that the anomaly ID remains unchanged. Restore normal conditions and check recovery. Disconnect USB and wait beyond the configured staleness interval.
6. Restart the API and frontend; confirm the same persisted readings and anomaly state are retrieved.

Until these steps are witnessed with physical readings, only software integration is verified.

## Automated checks

```powershell
dotnet build WaterWatch.slnx --no-restore
$env:WATERWATCH_TEST_POSTGRES = [Environment]::GetEnvironmentVariable('ConnectionStrings__WaterWatch', 'User')
dotnet test WaterWatch.slnx --no-build --no-restore
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
```

PostgreSQL tests require the additive migration first. Without the test connection, live database tests explicitly skip; passing SQLite tests alone does not prove PostgreSQL integration. Live test data is synthetic. Transaction tests roll it back; the concurrency/fresh-host test commits only its uniquely named test sensor and removes that sensor, its readings and anomalies in a scoped cleanup. See the completion report for actual results from this run.


## Actual verification — 30 October 2026 (SAST)

- Before modifications: develop was clean at f36d99d; Task 3 commit 4dc7a85 was present. All 48 existing backend tests and 43 frontend tests passed. The first backend attempt encountered the running API's executable lock; stopping that process allowed the baseline build/tests to pass.
- API, serial bridge and test-project builds passed with zero warnings/errors. The final additional concurrency-test project build also passed with zero warnings/errors.
- Final automated result: 75 API tests, 18 serial bridge tests and 50 frontend tests passed; zero failed or skipped. PostgreSQL tests ran against the configured Supabase database. This includes atomic rollback, ingestion/staff credential separation, validation, consecutive evidence, baseline deviation, recovery, duplicate identity checks, concurrent retries and persisted state visible to a fresh API host. Test-generated sensor data was rolled back or scoped and cleaned up.
- Frontend TypeScript and Vite production build passed (2054 modules). The last build completed without the earlier optional plugin timing advisory.
- Applied migration 20261029235810_SensorTelemetry successfully. EF reported no pending model changes. Both earlier migration source files are unchanged. A reviewable idempotent incremental SQL script is committed alongside the new migration.
- Live local HTTP checks: staff GET sensors 200; anonymous GET sensors 401; ingestion-key GET sensors 401; authenticated empty telemetry JSON 400; frontend sensor route 200. The sensor list was empty before the software checks; no operational sensor records were seeded.
- The bridge's unconfigured startup exited with the actionable message “Set Bridge__ComPort.” No physical port was opened and no physical Arduino measurement was verified. Serial disconnection handling and the chart's browser/device presentation still need a real-device check; parser, forwarding retries, source labeling, chart rendering, loading/errors and staleness are covered by automated tests.
- The new ingestion credential was generated and saved in the Windows user environment without being printed. The API and existing Vite server were left running for local review. Register the actual sensor with measured calibration and configure its COM port before starting the bridge.
