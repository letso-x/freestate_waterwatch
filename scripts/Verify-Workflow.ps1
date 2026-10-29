param([switch]$VerifyOnly, [string]$ApiBaseUrl = 'http://localhost:5100', [string]$FrontendBaseUrl = 'http://localhost:5173')
$ErrorActionPreference = 'Stop'
$operatorKey = [Environment]::GetEnvironmentVariable('Operator__ApiKey', 'User')
if ([string]::IsNullOrWhiteSpace($operatorKey)) { $operatorKey = $env:Operator__ApiKey }
if ([string]::IsNullOrWhiteSpace($operatorKey)) { throw 'Configure the demo operator first.' }
$headers = @{ Authorization = 'Bearer ' + $operatorKey; Origin = 'http://localhost:5173' }
$referencePath = Join-Path $env:TEMP 'waterwatch-task3-demo.json'
function Send-Json([string]$method, [string]$path, $body) {
    Invoke-RestMethod ($ApiBaseUrl + $path) -Method $method -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json)
}
if (-not $VerifyOnly) {
    $record = Send-Json POST '/api/incidents' @{
        title = 'Hackathon demo: Burst water pipe in Bloemfontein'
        description = 'Demonstration record only, not a verified real-world leak. A burst pipe was reported near a Bloemfontein street for the hackathon workflow.'
        location = 'Bloemfontein demonstration location'; latitude = -29.12; longitude = 26.21
    }
    $reference = $record.id
    Send-Json PATCH "/api/incidents/$reference/status" @{status='UnderReview'; note='Demo operator acknowledged the report.'} | Out-Null
    Send-Json PATCH "/api/incidents/$reference/assignment" @{assignedTo='Maintenance Team A (demo)'; note='Demo assignment for investigation.'} | Out-Null
    Send-Json PATCH "/api/incidents/$reference/status" @{status='InProgress'; note='Demo investigation started.'} | Out-Null
    Send-Json POST "/api/incidents/$reference/notes" @{note='INTERNAL-DEMO-EVIDENCE: investigation details must stay private.'} | Out-Null
    Send-Json PATCH "/api/incidents/$reference/priority" @{priority='High'; note='Demo operator-selected priority, no calculated severity score.'} | Out-Null
    Send-Json PATCH "/api/incidents/$reference/status" @{status='Resolved'; note='Demo operator recorded replacement of the damaged pipe section. This demonstration is not independent physical repair verification.'} | Out-Null
} else {
    if (-not (Test-Path -LiteralPath $referencePath)) { throw 'Run the demonstration once before VerifyOnly.' }
    $reference = (Get-Content -LiteralPath $referencePath -Raw | ConvertFrom-Json).reference
}
$record = Invoke-RestMethod "$ApiBaseUrl/api/incidents/$reference" -Headers $headers
$events = Invoke-RestMethod "$ApiBaseUrl/api/incidents/$reference/events" -Headers $headers
$publicResponse = Invoke-WebRequest "$ApiBaseUrl/api/public/incidents/$reference/tracking" -UseBasicParsing
$tracking = $publicResponse.Content | ConvertFrom-Json
if ($record.status -ne 'Resolved' -or -not $record.resolvedAtUtc -or $record.priority -ne 'High' -or $record.assignedTo -ne 'Maintenance Team A (demo)') { throw 'Incident state did not persist.' }
if ($events.Count -ne 7 -or $tracking.events.Count -ne 4 -or $tracking.status -ne 'Resolved') { throw 'Timeline did not persist correctly.' }
foreach ($privateValue in @('INTERNAL-DEMO-EVIDENCE', 'Maintenance Team A', 'actorIdentifier', 'assignedTo', 'priority', 'resolvedAtUtc')) {
    if ($publicResponse.Content.Contains($privateValue)) { throw 'Public tracking exposed an operational field.' }
}
try {
    $unauthorized = Invoke-WebRequest "$ApiBaseUrl/api/incidents/$reference/events" -UseBasicParsing
    $unauthorizedStatus = [int]$unauthorized.StatusCode
} catch {
    if (-not $_.Exception.Response) { throw }
    $unauthorizedStatus = [int]$_.Exception.Response.StatusCode
}
if ($unauthorizedStatus -ne 401) { throw 'Operational history was not protected.' }
$frontend = Invoke-WebRequest "$FrontendBaseUrl/report" -UseBasicParsing
if ([int]$frontend.StatusCode -ne 200) { throw 'Frontend is not running.' }
$currentIds = ($events | Sort-Object id | ForEach-Object { $_.id }) -join ','
if ($VerifyOnly) {
    $before = Get-Content -LiteralPath $referencePath -Raw | ConvertFrom-Json
    if ($currentIds -ne $before.eventIds -or $record.updatedAtUtc -ne $before.updatedAtUtc) { throw 'Incident or event history changed across restart.' }
} else {
    @{reference=$reference; eventIds=$currentIds; updatedAtUtc=$record.updatedAtUtc} | ConvertTo-Json | Set-Content -LiteralPath $referencePath
}
[PSCustomObject]@{Reference=$reference; Status=$record.status; Priority=$record.priority; AssignmentPersisted=$true; InternalEvents=$events.Count; PublicEvents=$tracking.events.Count; PrivateNotesExcluded=$true; UnauthorizedHistoryStatus=$unauthorizedStatus; FrontendStatus=[int]$frontend.StatusCode; RestartVerification=[bool]$VerifyOnly}
